using Microsoft.Extensions.Logging;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Notificaciones;
using Sciad.Application.Interfaces;

namespace Sciad.Application.Services;

/// <summary>
/// Lectura y gestión de notificaciones automáticas (CU-09, Fase 2D). La generación ocurre en 2C
/// (token_revocado/fuera_horario al escanear) y en la verificación de auditoría (concentración inusual).
/// Regla de visibilidad: la Gerencia ve solo sus propias notificaciones; el Administrador ve todas.
/// </summary>
public sealed class NotificacionesService : INotificacionesService
{
    private readonly INotificacionRepository _notificaciones;
    private readonly ILogger<NotificacionesService> _logger;

    public NotificacionesService(INotificacionRepository notificaciones, ILogger<NotificacionesService> logger)
    {
        _notificaciones = notificaciones;
        _logger = logger;
    }

    public async Task<ServicioResultado<PaginadoDto<NotificacionDto>>> ListarAsync(
        bool? leida, int pagina, int tamanoPagina, int usuarioId, bool esAdministrador, CancellationToken ct = default)
    {
        var p = pagina < 1 ? 1 : pagina;
        var t = SanearTamano(tamanoPagina);

        // Gerencia ve SOLO sus notificaciones (usuario_id propio); el Administrador, todas.
        int? filtroUsuario = esAdministrador ? null : usuarioId;

        var (items, total) = await _notificaciones.ListarAsync(filtroUsuario, leida, p, t, ct);
        var totalPaginas = total == 0 ? 0 : (int)Math.Ceiling(total / (double)t);

        return ServicioResultado<PaginadoDto<NotificacionDto>>.Ok(new PaginadoDto<NotificacionDto>(
            items.Select(NotificacionDto.From).ToList(), total, p, t, totalPaginas));
    }

    public async Task<ServicioResultado<NotificacionDto>> MarcarLeidaAsync(
        int id, NotificacionLeidaRequest request, int usuarioId, bool esAdministrador, CancellationToken ct = default)
    {
        var notificacion = await _notificaciones.FindByIdAsync(id, ct);
        if (notificacion is null)
        {
            return ServicioResultado<NotificacionDto>.Fallo(CodigosError.NoEncontrado, "Notificación no encontrada.");
        }

        // Solo el destinatario (o un Administrador) modifica una notificación.
        if (!esAdministrador && notificacion.UsuarioId.HasValue && notificacion.UsuarioId != usuarioId)
        {
            return ServicioResultado<NotificacionDto>.Fallo(
                CodigosError.Validacion, "No puede modificar una notificación de otro usuario.");
        }

        notificacion.Leida = request.Leida;
        var actualizada = await _notificaciones.ActualizarAsync(notificacion, ct);
        _logger.LogInformation(
            "Notificación {NotificacionId} marcada como {Estado} por usuario {UsuarioId}.", id, request.Leida ? "leída" : "no leída", usuarioId);

        return ServicioResultado<NotificacionDto>.Ok(NotificacionDto.From(actualizada));
    }

    private static int SanearTamano(int tamanoPagina) => tamanoPagina is < 1 or > 100 ? 20 : tamanoPagina;
}