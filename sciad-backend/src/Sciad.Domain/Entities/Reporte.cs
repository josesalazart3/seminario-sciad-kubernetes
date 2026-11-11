namespace Sciad.Domain.Entities;

/// <summary>
/// Reporte de auditoría generado. Referencia DERCAS §7.2 — tabla `reportes`.
/// </summary>
public class Reporte
{
    public int Id { get; set; }

    /// <summary>Período que cubre el reporte. VARCHAR(80) NOT NULL.</summary>
    public string Periodo { get; set; } = null!;

    public int TotalRegistros { get; set; }

    public DateOnly Generado { get; set; }

    public int UsuarioId { get; set; }
    public Usuario Usuario { get; set; } = null!;
}
