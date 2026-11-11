using Sciad.Domain.Entities;

namespace Sciad.Application.Dtos.RegistrosAcceso;

/// <summary>
/// Fila del historial de accesos (CU-06). <c>Id</c> en string (mismo criterio que el frontend);
/// <c>RegistradoPor</c> es el nombre del usuario que ejecutó el escaneo.
/// </summary>
public sealed record RegistroHistorialDto(
    string Id,
    int PersonaId,
    string PersonaNombre,
    int ZonaId,
    string ZonaNombre,
    DateOnly Fecha,
    TimeOnly Hora,
    string Tipo,
    string RegistradoPor)
{
    public static RegistroHistorialDto From(RegistroAcceso r)
    {
        return new RegistroHistorialDto(
            Id: r.Id.ToString(),
            PersonaId: r.PersonaId,
            PersonaNombre: r.Persona?.Nombre ?? "",
            ZonaId: r.ZonaId,
            ZonaNombre: r.Zona?.Nombre ?? "",
            Fecha: r.Fecha,
            Hora: r.Hora,
            Tipo: r.Tipo,
            RegistradoPor: r.Usuario?.Nombre ?? "");
    }
}