using System.Text.RegularExpressions;
using Sciad.Application.Services;
using Sciad.Tests.Support;

namespace Sciad.Tests.Services;

/// <summary>
/// Sobre cifrado del QR (AES-256-GCM, RNF-01): ida y vuelta, nonce nuevo en cada cifrado, rechazo de cualquier
/// alteración (kid, id, nonce, texto cifrado, etiqueta), de sobres truncados, de otra versión o clave, del formato
/// antiguo de 64 hex, y arranque fallido si la clave falta o no mide 32 bytes.
/// </summary>
public sealed class CifradoQrTests
{
    private static readonly string Token = TestData.TokenHex("credencial-prueba");
    private static readonly Regex FormatoSobre = new(@"^SCIAD1\.[A-Za-z0-9_-]{87}$", RegexOptions.Compiled);

    private readonly CifradoQr _cifrado = TestData.CifradoQr;

    // ---- Utilidades para manipular el sobre a nivel de bytes ----
    private static byte[] Bytes(string sobre) =>
        Convert.FromBase64String(sobre["SCIAD1.".Length..].Replace('-', '+').Replace('_', '/') + "=");

    private static string Sobre(byte[] datos) =>
        "SCIAD1." + Convert.ToBase64String(datos).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    [Fact]
    public void Cifrar_Descifrar_IdaYVuelta()
    {
        var sobre = _cifrado.Cifrar(42, Token);

        Assert.Matches(FormatoSobre, sobre);
        Assert.DoesNotContain(Token, sobre, StringComparison.OrdinalIgnoreCase); // el token no viaja en claro
        Assert.True(_cifrado.TryDescifrar(sobre, out var id, out var token));
        Assert.Equal(42, id);
        Assert.Equal(Convert.FromHexString(Token), token);
    }

    [Fact]
    public void Cifrar_DosVecesElMismoToken_UsaNoncesDistintos()
    {
        var a = Bytes(_cifrado.Cifrar(42, Token));
        var b = Bytes(_cifrado.Cifrar(42, Token));

        Assert.NotEqual(a.AsSpan(5, 12).ToArray(), b.AsSpan(5, 12).ToArray()); // nonce
        Assert.NotEqual(a, b);
    }

    // Offsets del sobre: kid[0] · id[1..4] · nonce[5..16] · cifrado[17..48] · etiqueta[49..64]
    [Theory]
    [InlineData(0)]   // kid
    [InlineData(2)]   // id de la credencial (AAD)
    [InlineData(10)]  // nonce
    [InlineData(30)]  // texto cifrado
    [InlineData(60)]  // etiqueta GCM
    public void Descifrar_SobreAlteradoEnCualquierParte_Falla(int posicion)
    {
        var datos = Bytes(_cifrado.Cifrar(42, Token));
        datos[posicion] ^= 0x01;

        Assert.False(_cifrado.TryDescifrar(Sobre(datos), out _, out _));
    }

    [Fact]
    public void Descifrar_SobreTruncado_Falla()
    {
        var sobre = _cifrado.Cifrar(42, Token);

        Assert.False(_cifrado.TryDescifrar(sobre[..^1], out _, out _));
        Assert.False(_cifrado.TryDescifrar(sobre[..40], out _, out _));
        Assert.False(_cifrado.TryDescifrar("SCIAD1.", out _, out _));
    }

    [Fact]
    public void Descifrar_OtraVersion_Falla()
    {
        var sobre = _cifrado.Cifrar(42, Token);

        Assert.False(_cifrado.TryDescifrar("SCIAD2." + sobre["SCIAD1.".Length..], out _, out _));
    }

    [Fact]
    public void Descifrar_ConOtraClave_Falla()
    {
        var otra = new CifradoQr(Convert.ToBase64String(new byte[32]));
        var sobre = otra.Cifrar(42, Token);

        Assert.False(_cifrado.TryDescifrar(sobre, out _, out _));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("SCIAD1.!!!!")]
    [InlineData("https://example.com/hola")]
    public void Descifrar_ContenidoAjeno_Falla(string? contenido)
    {
        Assert.False(_cifrado.TryDescifrar(contenido, out _, out _));
    }

    [Fact]
    public void Descifrar_FormatoAntiguo64Hex_Falla()
    {
        Assert.False(_cifrado.TryDescifrar(Token, out _, out _));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("no-es-base64-%%%")]
    [InlineData("MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=")]                         // 20 bytes
    [InlineData("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMTIz")]     // 36 bytes
    public void Constructor_ClaveAusenteOLongitudIncorrecta_ImpideElArranque(string? clave)
    {
        var ex = Assert.Throws<InvalidOperationException>(() => new CifradoQr(clave));

        Assert.Contains("QR_ENCRYPTION_KEY", ex.Message);
        if (!string.IsNullOrWhiteSpace(clave))
        {
            Assert.DoesNotContain(clave, ex.Message); // nunca muestra la clave
        }
    }
}
