namespace Sciad.Domain.Entities;

/// <summary>
/// Zona / punto de acceso físico. Referencia DERCAS §7.2 — tabla `zonas_acceso`.
/// Campos adicionales decididos en la adenda a la Fase 2B: <c>capacidad</c>, <c>nivel_riesgo</c>
/// y <c>estado</c> (ver bitácora 2B — corrección post-verificación).
/// </summary>
public class ZonaAcceso
{
    public int Id { get; set; }

    /// <summary>Nombre de la zona. VARCHAR(80) NOT NULL.</summary>
    public string Nombre { get; set; } = null!;

    /// <summary>Nivel de seguridad: bajo | medio | alto (p. ej. "CRITICO" para datacenter).</summary>
    public string NivelSeguridad { get; set; } = null!;

    /// <summary>Aforo máximo simultáneo de la zona. INTEGER NULL (opcional).</summary>
    public int? Capacidad { get; set; }

    /// <summary>Nivel de riesgo: bajo | medio | alto | crítico (p. ej. "CRITICO" para datacenter).</summary>
    public string NivelRiesgo { get; set; } = "MEDIO";

    /// <summary>"activo" | "inactivo" (soft delete).</summary>
    public string Estado { get; set; } = "activo";

    public ICollection<PerfilAcceso> Perfiles { get; set; } = new List<PerfilAcceso>();
    public ICollection<RegistroAcceso> Registros { get; set; } = new List<RegistroAcceso>();
}
