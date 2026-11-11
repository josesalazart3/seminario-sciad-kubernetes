// Alias necesario: este namespace termina en ".Auditoria" y la entidad se llama Auditoria (CS0118).
using AuditoriaEntity = Sciad.Domain.Entities.Auditoria;

namespace Sciad.Application.Dtos.Auditoria;

/// <summary>
/// Hallazgo de auditoría de integridad (CU-08). <c>Estado</c>: <c>abierto</c> | <c>en_revision</c> |
/// <c>resuelto</c> (vocabulario de la entidad y del frontend — ver Bitácora 2D).
/// </summary>
public sealed record AuditoriaHallazgoDto(
    string Id,
    string Tipo,
    string Descripcion,
    int? PersonaId,
    string? PersonaNombre,
    string Estado,
    DateOnly Fecha)
{
    public static AuditoriaHallazgoDto From(AuditoriaEntity a)
    {
        return new AuditoriaHallazgoDto(
            Id: a.Id.ToString(),
            Tipo: a.Tipo,
            Descripcion: a.Descripcion,
            PersonaId: a.PersonaId,
            PersonaNombre: a.Persona?.Nombre,
            Estado: a.Estado,
            Fecha: a.Fecha);
    }
}