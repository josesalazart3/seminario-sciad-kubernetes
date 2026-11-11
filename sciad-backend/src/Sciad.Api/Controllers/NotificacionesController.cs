using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sciad.Api.Common;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Notificaciones;
using Sciad.Application.Interfaces;

namespace Sciad.Api.Controllers;

/// <summary>
/// Lectura y gestión de notificaciones automáticas (CU-09 — porción de Fase 2D). Administrador y Gerencia;
/// la Gerencia ve <b>solo sus propias</b> notificaciones y el Administrador todas.
/// </summary>
[ApiController]
[Authorize(Policy = "RequireAdminOGerencia")]
[Route("api/notificaciones")]
public sealed class NotificacionesController : ControllerBase
{
    private readonly INotificacionesService _notificaciones;

    public NotificacionesController(INotificacionesService notificaciones)
    {
        _notificaciones = notificaciones;
    }

    /// <summary>
    /// Lista paginada de notificaciones. <c>leida</c> (bool) filtra por leídas/no leídas.
    /// La Gerencia obtiene exclusivamente las suyas (<c>usuario_id</c> propio).
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(PaginadoDto<NotificacionDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Listar(
        [FromQuery] bool? leida = null,
        [FromQuery] int pagina = 1,
        [FromQuery] int tamanoPagina = 20,
        CancellationToken ct = default)
    {
        var usuarioId = ObtenerUsuarioId();
        var esAdministrador = User.IsInRole("ADMIN");
        var resultado = await _notificaciones.ListarAsync(leida, pagina, tamanoPagina, usuarioId, esAdministrador, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    /// <summary>Marca una notificación como leída/no leída: <c>{"leida": true|false}</c>.</summary>
    [HttpPatch("{id:int}/leida")]
    [ProducesResponseType(typeof(NotificacionDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> MarcarLeida(
        int id, [FromBody] NotificacionLeidaRequest request, CancellationToken ct = default)
    {
        var usuarioId = ObtenerUsuarioId();
        var esAdministrador = User.IsInRole("ADMIN");
        var resultado = await _notificaciones.MarcarLeidaAsync(id, request, usuarioId, esAdministrador, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    private int ObtenerUsuarioId()
    {
        var idRaw = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                    ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(idRaw, out var id) ? id : 0;
    }
}