using System.ComponentModel.DataAnnotations;

namespace Sciad.Application.Dtos.Reportes;

/// <summary>
/// Filtros de un reporte de auditoría (CU-07): período (obligatorio) y opcionalmente persona, zona y
/// tipo de evento. La validez del rango (hasta ≥ desde) la valida el servicio (regla de negocio).
/// </summary>
public sealed record GenerarReporteRequest
{
    [Required(ErrorMessage = "La fecha inicial del período es obligatoria.")]
    public DateOnly Desde { get; init; }

    [Required(ErrorMessage = "La fecha final del período es obligatoria.")]
    public DateOnly Hasta { get; init; }

    public int? PersonaId { get; init; }

    public int? ZonaId { get; init; }

    /// <summary>"ingreso" | "egreso" (opcional: si se omite, incluye ambos).</summary>
    public string? TipoEvento { get; init; }
}