using System.ComponentModel.DataAnnotations;

namespace Sciad.Application.Dtos.Personas;

public sealed class ActualizarPersonaRequest
{
    [Required(ErrorMessage = "El nombre es obligatorio.")]
    [StringLength(120, ErrorMessage = "El nombre no puede superar 120 caracteres.")]
    public string Nombre { get; set; } = null!;

    [Required(ErrorMessage = "El código DPI es obligatorio.")]
    [StringLength(20, ErrorMessage = "El código DPI no puede superar 20 caracteres.")]
    public string DpiCodigo { get; set; } = null!;

    [Range(1, 2, ErrorMessage = "El tipo debe ser 1 (colaborador) o 2 (visitante).")]
    public int Tipo { get; set; }
}