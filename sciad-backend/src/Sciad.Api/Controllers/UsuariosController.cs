using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sciad.Api.Common;
using Sciad.Application.Dtos.Auth;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Usuarios;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;

namespace Sciad.Api.Controllers;

/// <summary>CRUD administrativo de usuarios (CU-01). Solo rol Administrador.</summary>
[ApiController]
[Authorize(Policy = "RequireAdmin")]
[Route("api/usuarios")]
public sealed class UsuariosController : ControllerBase
{
    private readonly IUsuariosService _usuarios;

    public UsuariosController(IUsuariosService usuarios)
    {
        _usuarios = usuarios;
    }

    /// <summary>Lista paginada de usuarios; <c>estado</c>: <c>activo</c> (por defecto), <c>inactivo</c> o <c>todos</c> (Fase 8.4).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PaginadoDto<UsuarioDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Listar(
        [FromQuery] string? estado = null,
        [FromQuery] int pagina = 1,
        [FromQuery] int tamanoPagina = 20,
        CancellationToken ct = default)
    {
        if (!FiltroEstado.Interpretar(estado, out var filtro, out var mensaje))
        {
            return ApiProblem.BadRequest(mensaje, CodigosError.Validacion);
        }

        var respuesta = await _usuarios.ListarAsync(filtro, pagina, tamanoPagina, ct);
        return Ok(respuesta.Dato);
    }

    /// <summary>Crea un usuario. 409 si el correo ya existe.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(UsuarioDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Crear([FromBody] CrearUsuarioRequest request, CancellationToken ct)
    {
        var resultado = await _usuarios.CrearAsync(request, ct);
        return resultado.Exitoso
            ? Created($"/api/usuarios/{resultado.Dato!.Id}", resultado.Dato)
            : ApiProblem.FromServicio(resultado);
    }

    /// <summary>Edita un usuario. La contraseña es opcional (solo se re-emite si se envía).</summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(UsuarioDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Actualizar(int id, [FromBody] ActualizarUsuarioRequest request, CancellationToken ct)
    {
        var resultado = await _usuarios.ActualizarAsync(id, request, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    /// <summary>Alta/baja lógica: <c>{"estado":"activo|inactivo"}</c>. Nunca borrado físico.</summary>
    [HttpPatch("{id:int}/estado")]
    [ProducesResponseType(typeof(UsuarioDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> CambiarEstado(int id, [FromBody] CambiarEstadoRequest request, CancellationToken ct)
    {
        // Fase 8.4: un administrador no puede deshabilitar su propia cuenta (el servicio impide además dejar el sistema
        // sin ningún administrador activo).
        var actual = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (int.TryParse(actual, out var actualId) && actualId == id
            && string.Equals(request.Estado?.Trim(), FiltroEstado.Inactivo, StringComparison.OrdinalIgnoreCase))
        {
            return ApiProblem.BadRequest("No puede deshabilitar su propia cuenta.", CodigosError.Validacion);
        }

        var resultado = await _usuarios.CambiarEstadoAsync(id, request, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }
}
