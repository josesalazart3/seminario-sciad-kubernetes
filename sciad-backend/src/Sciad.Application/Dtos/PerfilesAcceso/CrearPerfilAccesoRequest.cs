using System.ComponentModel.DataAnnotations;

namespace Sciad.Application.Dtos.PerfilesAcceso;

public sealed class CrearPerfilAccesoRequest
{
    [Range(1, int.MaxValue, ErrorMessage = "El ID de persona es obligatorio.")]
    public int PersonaId { get; set; }

    [Range(1, int.MaxValue, ErrorMessage = "El ID de zona es obligatorio.")]
    public int ZonaId { get; set; }

    [Required(ErrorMessage = "La vigencia de inicio es obligatoria.")]
    public DateOnly VigenciaInicio { get; set; }

    [Required(ErrorMessage = "La vigencia de fin es obligatoria.")]
    public DateOnly VigenciaFin { get; set; }
}