using Sciad.Domain.Entities;

namespace Sciad.Application.Interfaces;

/// <summary>
/// Acceso a notificaciones automáticas (CU-09, porción de lectura/gestión). Sin DELETE físico.
/// Generación en <see cref="IRegistroAccesoRepository"/>/<see cref="IAuditoriaRepository"/> (disparo de
/// concentración inusual) y <see cref="IRegistrosAccesoService"/> (token_revocado/fuera_horario en 2C).
/// </summary>
public interface INotificacionRepository
{
    /// <summary>
    /// Lista paginada de notificaciones (ordenadas por id descendente, con persona). Si
    /// <paramref name="usuarioId"/> se pasa, filtra por <c>UsuarioId</c> (el usuario autenticado ve las
    /// suyas); <c>leida</c> filtra por leídas/no leídas.
    /// </summary>
    Task<(IReadOnlyList<Notificacion> Items, int Total)> ListarAsync(
        int? usuarioId, bool? leida, int pagina, int tamanoPagina, CancellationToken ct = default);

    /// <summary>Inserta una notificación (disparadores de eventos anómalos, p. ej. concentración inusual).</summary>
    Task<Notificacion> AgregarAsync(Notificacion notificacion, CancellationToken ct = default);

    /// <summary>Busca una notificación por id (con seguimiento: la devuelve modificable para marcarla leída).</summary>
    Task<Notificacion?> FindByIdAsync(int id, CancellationToken ct = default);

    /// <summary>Persiste los cambios de una notificación ya rastreada (marcar leída/no leída).</summary>
    Task<Notificacion> ActualizarAsync(Notificacion notificacion, CancellationToken ct = default);
}