using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sciad.Api.Common;
using Sciad.Application.Dtos.Auditoria;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Interfaces;

namespace Sciad.Api.Controllers;

/// <summary>
/// Auditoría de integridad de bitácoras (CU-08). La <c>POST /api/auditoria/verificar</c> es SOLO de
/// Administrador (aplica las dos policies: RequireAdminOGerencia de clase + RequireAdmin de la acción);
/// consultar hallazgos y cambiar su estado es de Administrador o Gerencia/Auditoría. Sin DELETE físico.
/// </summary>
[ApiController]
[Authorize(Policy = "RequireAdminOGerencia")]
[Route("api/auditoria")]
public sealed class AuditoriaController : ControllerBase
{
    private readonly IAuditoriaService _auditoria;

    public AuditoriaController(IAuditoriaService auditoria)
    {
        _auditoria = auditoria;
    }

    /// <summary>
    /// Ejecuta las comprobaciones de integridad (ingresos sin egreso, duplicados, campos inconsistentes,
    /// concentración inusual) e inserta los hallazgos detectados. Solo Administrador.
    /// </summary>
    [HttpPost("verificar")]
    [Authorize(Policy = "RequireAdmin")]
    [ProducesResponseType(typeof(VerificacionAuditoriaResultadoDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Verificar(CancellationToken ct = default)
    {
        var resultado = await _auditoria.VerificarAsync(ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    /// <summary>Lista paginada de hallazgos, filtrable por <c>tipo</c> y <c>estado</c>.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PaginadoDto<AuditoriaHallazgoDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Listar(
        [FromQuery] string? tipo = null,
        [FromQuery] string? estado = null,
        [FromQuery] int pagina = 1,
        [FromQuery] int tamanoPagina = 20,
        CancellationToken ct = default)
    {
        var resultado = await _auditoria.ListarAsync(tipo, estado, pagina, tamanoPagina, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    /// <summary>Cambia el estado de un hallazgo: <c>{"estado":"abierto|en_revision|resuelto"}</c>.</summary>
    [HttpPatch("{id:int}/estado")]
    [ProducesResponseType(typeof(AuditoriaHallazgoDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> CambiarEstado(int id, [FromBody] CambiarEstadoRequest request, CancellationToken ct = default)
    {
        var resultado = await _auditoria.CambiarEstadoAsync(id, request, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }
}