using Sciad.Domain.Entities;

namespace Sciad.Application.Dtos.Credenciales;

/// <summary>
/// Credencial para la administración. <see cref="Qr"/> es el sobre cifrado que va en el código QR (se genera en cada
/// respuesta con un nonce nuevo; todos son válidos). El token completo no sale del servidor: solo <see cref="TokenCorto"/>.
/// </summary>
public sealed record CredencialDto(
    string Id,
    string PersonaId,
    string PersonaNombre,
    string DpiCodigo,
    string TokenCorto,
    string Qr,
    string Estado,
    DateOnly Emitido,
    string? Motivo,
    int? ReemitidoDe)
{
    public static CredencialDto From(CredencialQr c, string qr) => new(
        c.Id.ToString(),
        c.PersonaId.ToString(),
        c.Persona?.Nombre ?? "",
        c.Persona?.DpiCodigo ?? "",
        c.Token[..8],
        qr,
        c.Estado,
        c.Emitido,
        c.Motivo,
        c.ReemitidoDe);
}
