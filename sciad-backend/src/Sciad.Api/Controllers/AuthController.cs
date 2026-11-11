using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Sciad.Api.Common;
using Sciad.Application.Dtos.Auth;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;

namespace Sciad.Api.Controllers;

/// <summary>
/// Autenticación (CU-10). Únicamente login y "me"; ningún endpoint de negocio en la Fase 2A.
/// </summary>
[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly IAuthService _auth;

    public AuthController(IAuthService auth)
    {
        _auth = auth;
    }

    /// <summary>
    /// Inicia sesión con correo y contraseña. Devuelve <c>{ user, token }</c>.
    /// </summary>
    [EnableRateLimiting("login")]
    [HttpPost("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var result = await _auth.LoginAsync(request.Email, request.Password, ct);
        if (result.Exitoso)
        {
            return Ok(result.Response);
        }

        // Respuesta ÚNICA (401, mismo texto) para credenciales inválidas, correo desconocido, cuenta inactiva o bloqueada:
        // distinguir «inactivo» sin conocer la contraseña revelaría qué correos existen (OWASP A07). El motivo real queda en el log.
        return ApiProblem.Unauthorized("Credenciales inválidas.");
    }

    /// <summary>Devuelve el usuario autenticado a partir del token Bearer.</summary>
    [Authorize]
    [HttpGet("me")]
    [ProducesResponseType(typeof(UsuarioDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var idRaw = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                    ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(idRaw, out var usuarioId))
        {
            return ApiProblem.Unauthorized("Token inválido.");
        }

        var usuario = await _auth.ObtenerPorIdAsync(usuarioId, ct);
        return usuario is null
            ? ApiProblem.NotFound("Usuario no encontrado.")
            : Ok(usuario);
    }

    /// <summary>
    /// Punto de verificación de RBAC (Fase 2A): solo accesible con rol ADMIN.
    /// Sirve para comprobar que los policies por rol rechazan con 403 a los demás roles.
    /// </summary>
    [Authorize(Policy = "RequireAdmin")]
    [HttpGet("role-check")]
    public IActionResult RoleCheck()
    {
        var rol = User.FindFirstValue(ClaimTypes.Role);
        return Ok(new { ok = true, rol, message = "Acceso concedido (ADMIN)." });
    }
}
