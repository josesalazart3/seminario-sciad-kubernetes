using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sciad.Api.Common;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Personas;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;

namespace Sciad.Api.Controllers;

/// <summary>CRUD administrativo de personas (Colaboradores/Visitantes). Solo rol Administrador.</summary>
[ApiController]
[Authorize(Policy = "RequireAdmin")]
[Route("api/personas")]
public sealed class PersonasController : ControllerBase
{
    private readonly IPersonasService _personas;

    public PersonasController(IPersonasService personas)
    {
        _personas = personas;
    }

    /// <summary>
    /// Lista paginada de personas, filtrable por <c>tipo</c> (1=colaborador, 2=visitante)
    /// y por <c>estado</c>: <c>activo</c> (por defecto), <c>inactivo</c> o <c>todos</c> (Fase 8.4).
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(PaginadoDto<PersonaDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Listar(
        [FromQuery] int? tipo = null,
        [FromQuery] string? estado = null,
        [FromQuery] int pagina = 1,
        [FromQuery] int tamanoPagina = 20,
        CancellationToken ct = default)
    {
        if (!FiltroEstado.Interpretar(estado, out var filtro, out var mensaje))
        {
            return ApiProblem.BadRequest(mensaje, CodigosError.Validacion);
        }

        var resultado = await _personas.ListarAsync(tipo, filtro, pagina, tamanoPagina, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    /// <summary>Crea una persona. 409 si el DPI ya existe.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(PersonaDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Crear([FromBody] CrearPersonaRequest request, CancellationToken ct)
    {
        var resultado = await _personas.CrearAsync(request, ct);
        return resultado.Exitoso
            ? Created($"/api/personas/{resultado.Dato!.Id}", resultado.Dato)
            : ApiProblem.FromServicio(resultado);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(PersonaDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Actualizar(int id, [FromBody] ActualizarPersonaRequest request, CancellationToken ct)
    {
        var resultado = await _personas.ActualizarAsync(id, request, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    /// <summary>Alta/baja lógica: <c>{"estado":"activo|inactivo"}</c>. Nunca borrado físico.</summary>
    [HttpPatch("{id:int}/estado")]
    [ProducesResponseType(typeof(PersonaDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> CambiarEstado(int id, [FromBody] CambiarEstadoRequest request, CancellationToken ct)
    {
        var resultado = await _personas.CambiarEstadoAsync(id, request, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }
}
