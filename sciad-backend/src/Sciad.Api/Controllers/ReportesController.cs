using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sciad.Api.Common;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Reportes;
using Sciad.Application.Interfaces;

namespace Sciad.Api.Controllers;

/// <summary>
/// Reportes de auditoría (CU-07). <c>POST /api/reportes/generar</c> devuelve el CSV como descarga y
/// guarda los metadatos; <c>GET /api/reportes</c> lista los generados. Administrador y Gerencia/Auditoría.
/// </summary>
[ApiController]
[Authorize(Policy = "RequireAdminOGerencia")]
[Route("api/reportes")]
public sealed class ReportesController : ControllerBase
{
    private readonly IReportesService _reportes;

    public ReportesController(IReportesService reportes)
    {
        _reportes = reportes;
    }

    /// <summary>
    /// Genera un reporte CSV para un período y filtros dados (persona, zona, tipo de evento opcionales).
    /// El archivo se sirve como descarga y se persisten los metadatos en <c>reportes</c>.
    /// </summary>
    [HttpPost("generar")]
    [ProducesResponseType(typeof(FileResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Generar([FromBody] GenerarReporteRequest request, CancellationToken ct = default)
    {
        var usuarioId = ObtenerUsuarioId();
        var resultado = await _reportes.GenerarAsync(request, usuarioId, ct);
        if (!resultado.Exitoso)
        {
            return ApiProblem.FromServicio(resultado);
        }

        var archivo = Encoding.UTF8.GetBytes(resultado.Dato ?? "");
        return File(archivo, "text/csv; charset=utf-8", $"reporte_{DateTime.UtcNow:yyyyMMdd_HHmm}.csv");
    }

    /// <summary>Lista paginada de reportes ya generados (metadatos, no el archivo).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PaginadoDto<ReporteDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Listar(
        [FromQuery] int pagina = 1,
        [FromQuery] int tamanoPagina = 20,
        CancellationToken ct = default)
    {
        var resultado = await _reportes.ListarAsync(pagina, tamanoPagina, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    private int ObtenerUsuarioId()
    {
        var idRaw = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                    ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(idRaw, out var id) ? id : 0;
    }
}