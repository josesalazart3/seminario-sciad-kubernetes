using System.ComponentModel.DataAnnotations;

namespace Sciad.Application.Dtos.Credenciales;

/// <summary>Cuerpo de <c>POST /api/credenciales/{id}/revocar</c>. El motivo es opcional.</summary>
public sealed class RevocarCredencialRequest
{
    [StringLength(200, ErrorMessage = "El motivo no puede superar 200 caracteres.")]
    public string? Motivo { get; set; }
}
