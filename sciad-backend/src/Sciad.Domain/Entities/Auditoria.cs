namespace Sciad.Domain.Entities;

/// <summary>
/// Hallazgo de auditoría de integridad de bitácoras. Referencia DERCAS §7.2 — tabla `auditoria`.
/// </summary>
public class Auditoria
{
    public int Id { get; set; }

    /// <summary>Categoría de inconsistencia. VARCHAR(30) NOT NULL.</summary>
    public string Tipo { get; set; } = null!;

    public string Descripcion { get; set; } = null!;

    public int? PersonaId { get; set; }
    public Persona? Persona { get; set; }

    /// <summary>"abierto" | "en_revision" | "resuelto".</summary>
    public string Estado { get; set; } = null!;

    public DateOnly Fecha { get; set; }
}
