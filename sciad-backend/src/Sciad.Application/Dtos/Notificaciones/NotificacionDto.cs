using Sciad.Domain.Entities;

namespace Sciad.Application.Dtos.Notificaciones;

/// <summary>
/// Notificación automática por evento anómalo (CU-09, lectura/gestión). La columna <c>fecha</c> se agregó
/// en Fase 3 (decisión de usuario) — el frontend la necesita para ordenar y mostrar "hace X".
/// </summary>
public sealed record NotificacionDto(
    string Id,
    int? UsuarioId,
    string Tipo,
    string Mensaje,
    DateTime Fecha,
    bool Leida,
    int? PersonaId,
    string? PersonaNombre)
{
    public static NotificacionDto From(Notificacion n)
    {
        return new NotificacionDto(
            Id: n.Id.ToString(),
            UsuarioId: n.UsuarioId,
            Tipo: n.Tipo,
            Mensaje: n.Mensaje,
            Fecha: n.Fecha,
            Leida: n.Leida,
            PersonaId: n.PersonaId,
            PersonaNombre: n.Persona?.Nombre);
    }
}