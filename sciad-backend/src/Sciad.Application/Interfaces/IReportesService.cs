using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Reportes;
using Sciad.Application.Services;

namespace Sciad.Application.Interfaces;

/// <summary>
/// Reportes de auditoría (CU-07). <see cref="GenerarAsync"/> devuelve el CSV construido en memoria y
/// persiste solo los metadatos (<c>periodo</c>, <c>total_registros</c>, <c>generado</c>, <c>usuario_id</c>);
/// no se guarda el archivo. Roles: Administrador y Gerencia/Auditoría.
/// </summary>
public interface IReportesService
{
    /// <summary>
    /// Genera el CSV de los registros que cumplen los filtros (período obligatorio; persona, zona y
    /// tipo de evento opcionales), guarda los metadatos del reporte y devuelve el contenido CSV.
    /// </summary>
    Task<ServicioResultado<string>> GenerarAsync(
        GenerarReporteRequest request, int usuarioId, CancellationToken ct = default);

    /// <summary>Lista paginada de los reportes ya generados (metadatos, no el archivo).</summary>
    Task<ServicioResultado<PaginadoDto<ReporteDto>>> ListarAsync(
        int pagina, int tamanoPagina, CancellationToken ct = default);
}