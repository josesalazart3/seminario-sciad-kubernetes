using Sciad.Application.Dtos.Auditoria;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Services;

namespace Sciad.Application.Interfaces;

/// <summary>
/// Auditoría de integridad de bitácoras (CU-08). La verificación es solo de Administrador; la consulta
/// y el cambio de estado de hallazgos, de Administrador y Gerencia/Auditoría. Sin DELETE físico.
/// </summary>
public interface IAuditoriaService
{
    /// <summary>
    /// Ejecuta las comprobaciones de integridad (ingresos sin egreso de días anteriores, duplicados,
    /// campos nulos/inconsistentes, concentración inusual) e inserta un hallazgo por cada inconsistencia.
    /// La concentración inusual, además, genera una notificación a Gerencia.
    /// </summary>
    Task<ServicioResultado<VerificacionAuditoriaResultadoDto>> VerificarAsync(CancellationToken ct = default);

    /// <summary>Lista paginada de hallazgos, filtrable por <c>tipo</c> y <c>estado</c>.</summary>
    Task<ServicioResultado<PaginadoDto<AuditoriaHallazgoDto>>> ListarAsync(
        string? tipo, string? estado, int pagina, int tamanoPagina, CancellationToken ct = default);

    /// <summary>Cambia el estado de un hallazgo: <c>abierto</c> → <c>en_revision</c> → <c>resuelto</c>.</summary>
    Task<ServicioResultado<AuditoriaHallazgoDto>> CambiarEstadoAsync(
        int id, CambiarEstadoRequest request, CancellationToken ct = default);
}