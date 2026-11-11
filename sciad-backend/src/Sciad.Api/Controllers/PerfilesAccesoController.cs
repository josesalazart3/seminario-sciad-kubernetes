using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sciad.Api.Common;
using Sciad.Application.Dtos.PerfilesAcceso;
using Sciad.Application.Interfaces;

namespace Sciad.Api.Controllers;

/// <summary>
/// Perfiles de acceso (CU-02): qué persona entra a qué zona y con qué vigencia.
/// Solo rol Administrador. La baja usa <c>DELETE</c> físico (asignación, no histórica —
/// ver decisión en bitácora 2B).
/// </summary>
[ApiController]
[Authorize(Policy = "RequireAdmin")]
[Route("api/perfiles-acceso")]
public sealed class PerfilesAccesoController : ControllerBase
{
    private readonly IPerfilesAccesoService _perfiles;

    public PerfilesAccesoController(IPerfilesAccesoService perfiles)
    {
        _perfiles = perfiles;
    }

    /// <summary>
    /// Lista perfiles de acceso, filtrable por <c>personaId</c> y/o <c>zonaId</c>.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<PerfilAccesoDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Listar(
        [FromQuery] int? personaId = null,
        [FromQuery] int? zonaId = null,
        CancellationToken ct = default)
    {
        var resultado = await _perfiles.ListarAsync(personaId, zonaId, ct);
        return Ok(resultado.Dato);
    }

    /// <summary>Asigna una zona + vigencia a una persona. 400 si la vigencia es inválida.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(PerfilAccesoDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Crear([FromBody] CrearPerfilAccesoRequest request, CancellationToken ct)
    {
        var resultado = await _perfiles.CrearAsync(request, ct);
        return resultado.Exitoso
            ? Created($"/api/perfiles-acceso/{resultado.Dato!.Id}", resultado.Dato)
            : ApiProblem.FromServicio(resultado);
    }

    /// <summary>Elimina la asignación (quitar acceso de una persona a una zona).</summary>
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var resultado = await _perfiles.EliminarAsync(id, ct);
        return resultado.Exitoso ? NoContent() : ApiProblem.FromServicio(resultado);
    }
}
