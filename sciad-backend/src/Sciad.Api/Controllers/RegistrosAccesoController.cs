using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sciad.Api.Common;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.RegistrosAcceso;
using Sciad.Application.Interfaces;

namespace Sciad.Api.Controllers;

/// <summary>
/// Control de acceso y trazabilidad. La autorización es por acción:
/// - <c>POST /api/registros-acceso</c> (escaneo QR, CU-04) y <c>GET .../hoy</c> (CU-05): SOLO
///   Personal de Seguridad o Administrador (Gerencia → 403).
/// - <c>GET /api/registros-acceso</c> (historial, CU-06): Administrador o Gerencia/Auditoría
///   (Personal de Seguridad → 403).
/// El escaneo persiste el ingreso/egreso y dispara notificaciones automáticas; los rechazos devuelven
/// 400 con <c>code</c> identificable y el doble ingreso del mismo día, 409 (UNIQUE de BD, última línea).
/// </summary>
[ApiController]
[Route("api/registros-acceso")]
public sealed class RegistrosAccesoController : ControllerBase
{
    private readonly IRegistrosAccesoService _registros;

    public RegistrosAccesoController(IRegistrosAccesoService registros)
    {
        _registros = registros;
    }

    /// <summary>
    /// Procesa el escaneo de una credencial QR en una zona. El tipo (ingreso/egreso) se infiere en el
    /// servidor. Respuesta incluye persona, tipo, zona, hora y estado (feedback verde/rojo del frontend).
    /// </summary>
    [HttpPost]
    [Authorize(Policy = "RequireSeguridadOAdmin")]
    [ProducesResponseType(typeof(RegistroAccesoResultadoDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Registrar([FromBody] RegistrarAccesoRequest request, CancellationToken ct)
    {
        var usuarioId = ObtenerUsuarioId();
        var resultado = await _registros.RegistrarAccesoAsync(request, usuarioId, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    /// <summary>Accesos registrados hoy (CU-05), opcionalmente filtrados por zona.</summary>
    [HttpGet("hoy")]
    [Authorize(Policy = "RequireSeguridadOAdmin")]
    [ProducesResponseType(typeof(IReadOnlyList<AccesoDelDiaDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Hoy([FromQuery] int? zonaId = null, CancellationToken ct = default)
    {
        var resultado = await _registros.ListarDelDiaAsync(zonaId, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    /// <summary>Historial completo de accesos (CU-06) con filtros y paginado. Gerencia/Auditoría y Administrador.</summary>
    [HttpGet]
    [Authorize(Policy = "RequireAdminOGerencia")]
    [ProducesResponseType(typeof(PaginadoDto<RegistroHistorialDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Historial(
        [FromQuery] int? personaId = null,
        [FromQuery] int? zonaId = null,
        [FromQuery] DateOnly? desde = null,
        [FromQuery] DateOnly? hasta = null,
        [FromQuery] string? tipo = null,
        [FromQuery] int pagina = 1,
        [FromQuery] int tamanoPagina = 20,
        CancellationToken ct = default)
    {
        var resultado = await _registros.ListarHistorialAsync(
            new HistorialAccesosRequest(personaId, zonaId, desde, hasta, tipo, pagina, tamanoPagina), ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    private int ObtenerUsuarioId()
    {
        var idRaw = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                    ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(idRaw, out var id) ? id : 0;
    }
}
