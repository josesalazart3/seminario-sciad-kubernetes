using System.ComponentModel.DataAnnotations;

namespace Sciad.Application.Dtos.Zonas;

public sealed class ActualizarZonaRequest
{
    [Required(ErrorMessage = "El nombre es obligatorio.")]
    [StringLength(80, ErrorMessage = "El nombre no puede superar 80 caracteres.")]
    public string Nombre { get; set; } = null!;

    [Required(ErrorMessage = "El nivel de seguridad es obligatorio.")]
    [StringLength(20, ErrorMessage = "El nivel de seguridad no puede superar 20 caracteres.")]
    public string NivelSeguridad { get; set; } = null!;

    /// <summary>Aforo máximo simultáneo. Opcional (nullable).</summary>
    [Range(0, 1_000_000, ErrorMessage = "La capacidad debe ser un entero entre 0 y 1000000.")]
    public int? Capacidad { get; set; }

    [Required(ErrorMessage = "El nivel de riesgo es obligatorio.")]
    [StringLength(20, ErrorMessage = "El nivel de riesgo no puede superar 20 caracteres.")]
    public string NivelRiesgo { get; set; } = null!;
}