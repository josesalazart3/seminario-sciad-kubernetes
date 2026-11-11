using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Sciad.Application.Interfaces;

namespace Sciad.Application.Services;

/// <summary>
/// Sobre del QR (RNF-01): <c>SCIAD1.</c> + base64url( kid[1] ‖ idCredencial[4] ‖ nonce[12] ‖ cifrado[32] ‖ etiqueta[16] ).
/// <list type="bullet">
/// <item>AES-256-GCM con la clave de <c>QR_ENCRYPTION_KEY</c> (32 bytes en base64); el texto plano es el token de 32 bytes.</item>
/// <item>Datos autenticados (AAD): versión, kid e id de la credencial; alterar cualquiera invalida la etiqueta.</item>
/// <item>kid = primer byte de SHA-256("SCIAD-QR-KID" ‖ clave): si la clave cambia, los QR anteriores se reconocen como de otra clave.</item>
/// </list>
/// </summary>
public sealed partial class CifradoQr : ICifradoQr
{
    public const string VariableEntorno = "QR_ENCRYPTION_KEY";
    public const string Prefijo = "SCIAD1.";

    private const int LongClave = 32;
    private const int LongKid = 1;
    private const int LongId = 4;
    private const int LongNonce = 12;
    private const int LongToken = 32;
    private const int LongEtiqueta = 16;
    private const int LongBytes = LongKid + LongId + LongNonce + LongToken + LongEtiqueta; // 65
    private const int LongBase64 = (LongBytes * 4 + 2) / 3;                                 // 87 (sin relleno)

    private static readonly byte[] Version = Encoding.ASCII.GetBytes("SCIAD1");

    private readonly byte[] _clave;
    private readonly byte _kid;

    /// <summary>Lanza <see cref="InvalidOperationException"/> si la clave falta o no mide 32 bytes (el backend no arranca).</summary>
    public CifradoQr(string? claveBase64)
    {
        byte[]? clave = null;
        if (!string.IsNullOrWhiteSpace(claveBase64))
        {
            try { clave = Convert.FromBase64String(claveBase64.Trim()); }
            catch (FormatException) { clave = null; }
        }

        if (clave is null || clave.Length != LongClave)
        {
            throw new InvalidOperationException(
                $"La variable de entorno {VariableEntorno} es obligatoria y debe ser una clave de 32 bytes en base64 " +
                "(genérela con: openssl rand -base64 32).");
        }

        _clave = clave;
        _kid = SHA256.HashData([.. Encoding.ASCII.GetBytes("SCIAD-QR-KID"), .. clave])[0];
    }

    public string Cifrar(int credencialId, string tokenHex)
    {
        var token = Convert.FromHexString(tokenHex);
        if (token.Length != LongToken)
        {
            throw new ArgumentException("El token de la credencial debe tener 32 bytes.", nameof(tokenHex));
        }

        var datos = new byte[LongBytes];
        datos[0] = _kid;
        BinaryPrimitives.WriteInt32BigEndian(datos.AsSpan(LongKid, LongId), credencialId);
        var nonce = datos.AsSpan(LongKid + LongId, LongNonce);
        RandomNumberGenerator.Fill(nonce); // nonce nuevo en cada cifrado

        using var aes = new AesGcm(_clave, LongEtiqueta);
        aes.Encrypt(nonce, token,
            datos.AsSpan(LongKid + LongId + LongNonce, LongToken),
            datos.AsSpan(LongBytes - LongEtiqueta, LongEtiqueta),
            Aad(datos));

        return Prefijo + Convert.ToBase64String(datos).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public bool TryDescifrar(string? sobre, out int credencialId, out byte[] token)
    {
        credencialId = 0;
        token = [];
        if (sobre is null || sobre.Length != Prefijo.Length + LongBase64 || !sobre.StartsWith(Prefijo, StringComparison.Ordinal))
        {
            return false;
        }

        var cuerpo = sobre.AsSpan(Prefijo.Length);
        if (!Base64UrlRegex().IsMatch(cuerpo))
        {
            return false;
        }

        byte[] datos;
        try
        {
            var b64 = cuerpo.ToString().Replace('-', '+').Replace('_', '/') + "=";
            datos = Convert.FromBase64String(b64);
        }
        catch (FormatException)
        {
            return false;
        }

        if (datos.Length != LongBytes || datos[0] != _kid)
        {
            return false;
        }

        var plano = new byte[LongToken];
        try
        {
            using var aes = new AesGcm(_clave, LongEtiqueta);
            aes.Decrypt(
                datos.AsSpan(LongKid + LongId, LongNonce),
                datos.AsSpan(LongKid + LongId + LongNonce, LongToken),
                datos.AsSpan(LongBytes - LongEtiqueta, LongEtiqueta),
                plano,
                Aad(datos));
        }
        catch (AuthenticationTagMismatchException)
        {
            return false;
        }

        credencialId = BinaryPrimitives.ReadInt32BigEndian(datos.AsSpan(LongKid, LongId));
        token = plano;
        return true;
    }

    /// <summary>AAD = "SCIAD1" ‖ kid ‖ idCredencial.</summary>
    private static byte[] Aad(byte[] datos) => [.. Version, .. datos.AsSpan(0, LongKid + LongId)];

    [GeneratedRegex("^[A-Za-z0-9_-]+$")]
    private static partial Regex Base64UrlRegex();
}
