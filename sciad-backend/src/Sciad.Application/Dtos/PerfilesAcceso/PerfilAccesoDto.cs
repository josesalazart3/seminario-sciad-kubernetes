using Sciad.Domain.Entities;

namespace Sciad.Application.Dtos.PerfilesAcceso;

public sealed record PerfilAccesoDto(
    string Id,
    string PersonaId,
    string PersonaNombre,
    string ZonaId,
    string ZonaNombre,
    DateOnly VigenciaInicio,
    DateOnly VigenciaFin)
{
    public static PerfilAccesoDto From(PerfilAcceso p) => new(
        p.Id.ToString(),
        p.PersonaId.ToString(),
        p.Persona?.Nombre ?? "",
        p.ZonaId.ToString(),
        p.Zona?.Nombre ?? "",
        p.VigenciaInicio,
        p.VigenciaFin);
}