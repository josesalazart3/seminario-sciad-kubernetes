using System.ComponentModel.DataAnnotations;

namespace Sciad.Application.Dtos.Auth;

/// <summary>Cuerpo de <c>POST /api/auth/login</c>. Compatible con <c>CredencialesLogin</c> del frontend.</summary>
public sealed class LoginRequest
{
    [Required, EmailAddress, MaxLength(120)]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(128)]
    public string Password { get; set; } = string.Empty;
}
