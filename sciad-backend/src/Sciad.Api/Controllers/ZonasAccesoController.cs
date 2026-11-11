using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sciad.Api.Common;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Zonas;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;

namespace Sciad.Api.Controllers;

/// <summary>
/// CRUD de zonas de acceso. La lectura (GET) está abierta a cualquier rol (Seguridad la necesita
/// para el desplegable del escaneo, CU-05); la escritura (crear/editar/estado) es solo Admin.
/// </summary>
[ApiController]
[Authorize]
[Route("api/zonas-acceso")]
public sealed class ZonasAccesoController : ControllerBase
{
    private readonly IZonasService _zonas;

    public ZonasAccesoController(IZonasService zonas)
    {
        _zonas = zonas;
    }

    /// <summary>
    /// Lista las zonas de acceso (cualquier rol autenticado). <c>estado</c>: <c>activo</c> (por defecto), <c>inactivo</c>
    /// o <c>todos</c> (Fase 8.4): el escáner y los perfiles nuevos solo ven zonas activas.
    /// </summary>
    [HttpGet]
    [Authorize(Policy = "RequireZonaLectura")]
    [ProducesResponseType(typeof(IReadOnlyList<ZonaDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Listar([FromQuery] string? estado = null, CancellationToken ct = default)
    {
        if (!FiltroEstado.Interpretar(estado, out var filtro, out var mensaje))
        {
            return ApiProblem.BadRequest(mensaje, CodigosError.Validacion);
        }

        var resultado = await _zonas.ListarAsync(filtro, ct);
        return Ok(resultado.Dato);
    }

    [HttpPost]
    [Authorize(Policy = "RequireAdmin")]
    [ProducesResponseType(typeof(ZonaDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Crear([FromBody] CrearZonaRequest request, CancellationToken ct)
    {
        var resultado = await _zonas.CrearAsync(request, ct);
        return resultado.Exitoso
            ? Created($"/api/zonas-acceso/{resultado.Dato!.Id}", resultado.Dato)
            : ApiProblem.FromServicio(resultado);
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = "RequireAdmin")]
    [ProducesResponseType(typeof(ZonaDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Actualizar(int id, [FromBody] ActualizarZonaRequest request, CancellationToken ct)
    {
        var resultado = await _zonas.ActualizarAsync(id, request, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    /// <summary>Alta/baja lógica: <c>{"estado":"activo|inactivo"}</c>. Nunca borrado físico.</summary>
    [HttpPatch("{id:int}/estado")]
    [Authorize(Policy = "RequireAdmin")]
    [ProducesResponseType(typeof(ZonaDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> CambiarEstado(int id, [FromBody] CambiarEstadoRequest request, CancellationToken ct)
    {
        var resultado = await _zonas.CambiarEstadoAsync(id, request, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }
}
