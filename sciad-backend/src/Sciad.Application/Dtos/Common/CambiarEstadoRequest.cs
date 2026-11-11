using System.ComponentModel.DataAnnotations;

namespace Sciad.Application.Dtos.Common;

/// <summary>
/// Cuerpo de <c>PATCH …/estado</c>: cambia el estado de alta/baja lógica
/// (soft delete) de un recurso. Nunca borrado físico.
/// </summary>
public sealed class CambiarEstadoRequest
{
    [Required(ErrorMessage = "El estado es obligatorio.")]
    [StringLength(20, ErrorMessage = "El estado no puede superar 20 caracteres.")]
    public string Estado { get; set; } = null!;
}