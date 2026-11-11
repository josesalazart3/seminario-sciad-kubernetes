using Sciad.Domain.Entities;

namespace Sciad.Application.Dtos.RegistrosAcceso;

/// <summary>
/// Resultado de un escaneo autorizado (CU-04): persona, tipo de movimiento, zona, hora y estado —
/// la información mínima para que el frontend muestre la alerta verde con motivo. El <see cref="Tipo"/>
/// es el valor real persistido en <c>registros_acceso</c> (<c>ingreso</c>/<c>egreso</c>).
/// </summary>
public sealed record RegistroAccesoResultadoDto(
    string Id,
    int PersonaId,
    string PersonaNombre,
    int ZonaId,
    string ZonaNombre,
    string Tipo,
    DateOnly Fecha,
    TimeOnly Hora,
    string Estado,
    DateTime Timestamp)
{
    public static RegistroAccesoResultadoDto From(RegistroAcceso r, Persona persona, ZonaAcceso zona, DateTime ahora)
        => new(
            r.Id.ToString(),
            persona.Id,
            persona.Nombre,
            zona.Id,
            zona.Nombre,
            r.Tipo,
            r.Fecha,
            r.Hora,
            "autorizado",
            ahora);
}
