using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Notificaciones;
using Sciad.Application.Services;

namespace Sciad.Application.Interfaces;

/// <summary>
/// Lectura y gestión de notificaciones automáticas (CU-09, porción que corresponde a Fase 2D; la
/// generación quedó en 2C para token_revocado/fuera_horario y en la verificación de auditoría para
/// concentración inusual). Roles: Administrador y Gerencia/Auditoría.
/// </summary>
public interface INotificacionesService
{
    /// <summary>
    /// Lista paginada de notificaciones. La Gerencia ve <b>solo las suyas</b> (<c>usuario_id</c> propio);
    /// el Administrador ve todas. <paramref name="leida"/> filtra por leídas/no leídas.
    /// </summary>
    Task<ServicioResultado<PaginadoDto<NotificacionDto>>> ListarAsync(
        bool? leida, int pagina, int tamanoPagina, int usuarioId, bool esAdministrador, CancellationToken ct = default);

    /// <summary>
    /// Marca una notificación como leída/no leída. Solo su destinatario (o el Administrador) puede
    /// modificarla; una notificación sin destinatario (<c>usuario_id</c> nulo, generada cuando no había
    /// gerentes activos) la puede gestionar cualquier usuario autorizado.
    /// </summary>
    Task<ServicioResultado<NotificacionDto>> MarcarLeidaAsync(
        int id, NotificacionLeidaRequest request, int usuarioId, bool esAdministrador, CancellationToken ct = default);
}