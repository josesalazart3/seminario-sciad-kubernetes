namespace Sciad.Application.Interfaces;

/// <summary>
/// Sobre cifrado y autenticado (AES-256-GCM) que se imprime en el QR de una credencial.
/// El sobre no se almacena: se genera al entregar la credencial y se valida al escanear.
/// </summary>
public interface ICifradoQr
{
    /// <summary>Cifra el token (64 hex) de la credencial <paramref name="credencialId"/>. Cada llamada usa un nonce nuevo.</summary>
    string Cifrar(int credencialId, string tokenHex);

    /// <summary>
    /// Verifica y descifra un sobre. Devuelve <c>false</c> ante cualquier problema (formato, versión, clave o
    /// etiqueta GCM), sin distinguir el motivo.
    /// </summary>
    bool TryDescifrar(string? sobre, out int credencialId, out byte[] token);
}
