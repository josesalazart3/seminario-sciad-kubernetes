namespace Sciad.Domain.Entities;

/// <summary>
/// Perfil de acceso: persona autorizada a una zona con vigencia. Referencia DERCAS §7.2 — tabla `perfiles_acceso`.
/// </summary>
public class PerfilAcceso
{
    public int Id { get; set; }

    public int PersonaId { get; set; }
    public Persona Persona { get; set; } = null!;

    public int ZonaId { get; set; }
    public ZonaAcceso Zona { get; set; } = null!;

    public DateOnly VigenciaInicio { get; set; }
    public DateOnly VigenciaFin { get; set; }
}
