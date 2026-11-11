namespace Sciad.Application.Dtos.Auditoria;

/// <summary>
/// Resumen de una corrida de <c>POST /api/auditoria/verificar</c>: cuántos hallazgos se crearon, por
/// tipo, y cuántas notificaciones de concentración inusual se generaron.
/// </summary>
public sealed record VerificacionAuditoriaResultadoDto(
    int HallazgosCreados,
    int NotificacionesGeneradas,
    IReadOnlyDictionary<string, int> PorTipo);