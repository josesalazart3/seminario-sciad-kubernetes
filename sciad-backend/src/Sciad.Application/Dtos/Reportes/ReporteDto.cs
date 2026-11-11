using Sciad.Domain.Entities;

namespace Sciad.Application.Dtos.Reportes;

/// <summary>
/// Metadato de un reporte generado (CU-07). El archivo CSV no se almacena: se devuelve en la respuesta
/// de generación y aquí solo se guardan <c>periodo</c>, <c>total_registros</c>, <c>generado</c> y quién.
/// </summary>
public sealed record ReporteDto(
    string Id,
    string Periodo,
    int TotalRegistros,
    DateOnly Generado,
    string GeneradoPor)
{
    public static ReporteDto From(Reporte r)
    {
        return new ReporteDto(
            Id: r.Id.ToString(),
            Periodo: r.Periodo,
            TotalRegistros: r.TotalRegistros,
            Generado: r.Generado,
            GeneradoPor: r.Usuario?.Nombre ?? "");
    }
}