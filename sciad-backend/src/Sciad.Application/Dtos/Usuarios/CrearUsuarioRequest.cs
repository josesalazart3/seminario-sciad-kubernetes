using System.ComponentModel.DataAnnotations;

namespace Sciad.Application.Dtos.Usuarios;

public sealed class CrearUsuarioRequest
{
    [Required(ErrorMessage = "El nombre es obligatorio.")]
    [StringLength(120, ErrorMessage = "El nombre no puede superar 120 caracteres.")]
    public string Nombre { get; set; } = null!;

    [Required(ErrorMessage = "El correo es obligatorio.")]
    [EmailAddress(ErrorMessage = "El correo no tiene un formato válido.")]
    [RegularExpression(@"^\s*[^@\s]+@[^@\s]+\.[^@\s]+\s*$", ErrorMessage = "El correo no tiene un formato válido.")]
    [StringLength(120, ErrorMessage = "El correo no puede superar 120 caracteres.")]
    public string Correo { get; set; } = null!;

    [Required(ErrorMessage = "La contraseña es obligatoria.")]
    [MinLength(8, ErrorMessage = "La contraseña debe tener al menos 8 caracteres.")]
    [MaxLength(72, ErrorMessage = "La contraseña no puede superar 72 caracteres.")]
    public string Password { get; set; } = null!;

    [Required(ErrorMessage = "El rol es obligatorio.")]
    [StringLength(20, ErrorMessage = "El rol no puede superar 20 caracteres.")]
    public string Rol { get; set; } = null!;

    [StringLength(120, ErrorMessage = "El puesto no puede superar 120 caracteres.")]
    public string? Puesto { get; set; }
}