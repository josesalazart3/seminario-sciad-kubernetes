using Sciad.Domain.Entities;

namespace Sciad.Application.Interfaces;

/// <summary>
/// Acceso a reportes de auditoría generados (CU-07). Solo metadatos: <c>periodo</c>, <c>total_registros</c>,
/// <c>generado</c>, <c>usuario_id</c>. El archivo CSV se genera en memoria y se devuelve en la respuesta,
/// no se almacena como blob. Sin DELETE físico — trazabilidad histórica.
/// </summary>
public interface IReporteRepository
{
    /// <summary>Guarda los metadatos de un reporte y los devuelve con el usuario que lo generó.</summary>
    Task<Reporte> AgregarAsync(Reporte reporte, CancellationToken ct = default);

    /// <summary>Lista paginada de reportes generados (con usuario), ordenada por id descendente.</summary>
    Task<(IReadOnlyList<Reporte> Items, int Total)> ListarPaginadoAsync(
        int pagina, int tamanoPagina, CancellationToken ct = default);
}