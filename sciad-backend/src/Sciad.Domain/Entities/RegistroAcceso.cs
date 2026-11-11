namespace Sciad.Domain.Entities;

/// <summary>
/// Registro de ingreso/egreso por escaneo QR. Referencia DERCAS §7.2 — tabla `registros_acceso`.
/// </summary>
public class RegistroAcceso
{
    public int Id { get; set; }

    public int PersonaId { get; set; }
    public Persona Persona { get; set; } = null!;

    public int ZonaId { get; set; }
    public ZonaAcceso Zona { get; set; } = null!;

    public DateOnly Fecha { get; set; }
    public TimeOnly Hora { get; set; }

    /// <summary>"ingreso" | "egreso" (CHECK constraint).</summary>
    public string Tipo { get; set; } = null!;

    public int UsuarioId { get; set; }
    public Usuario Usuario { get; set; } = null!;
}
