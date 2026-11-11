using Sciad.Domain.Entities;

namespace Sciad.Application.Dtos.Personas;

public sealed record PersonaDto(
    string Id,
    string Nombre,
    string DpiCodigo,
    int Tipo,
    string Estado)
{
    public static PersonaDto From(Persona p) => new(
        p.Id.ToString(),
        p.Nombre,
        p.DpiCodigo,
        p.Tipo,
        p.Estado);
}