using System.ComponentModel.DataAnnotations;

namespace Sciad.Application.Dtos.Notificaciones;

/// <summary>Cuerpo de <c>PATCH /api/notificaciones/{id}/leida</c>: marca una notificación como leída/no leída.</summary>
public sealed class NotificacionLeidaRequest
{
    [Required(ErrorMessage = "El valor 'leida' es obligatorio.")]
    public bool Leida { get; set; }
}