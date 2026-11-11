using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sciad.Api.Common;
using Sciad.Application.Dtos.Credenciales;
using Sciad.Application.Interfaces;

namespace Sciad.Api.Controllers;

/// <summary>
/// Credenciales QR (CU-03): generación, reemisión e historial. Solo rol Administrador.
/// Nunca se borra físicamente: solo cambia <c>estado</c> (activa → revocada).
/// </summary>
[ApiController]
[Authorize(Policy = "RequireAdmin")]
[Route("api/credenciales")]
public sealed class CredencialesController : ControllerBase
{
    private readonly ICredencialesService _credenciales;

    public CredencialesController(ICredencialesService credenciales)
    {
        _credenciales = credenciales;
    }

    /// <summary>
    /// Historial de credenciales. Sin filtro lista todas; con <c>personaId</c> lista
    /// solo las de esa persona (incluye las revocadas, para trazabilidad).
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<CredencialDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Listar([FromQuery] int? personaId = null, CancellationToken ct = default)
    {
        var resultado = await _credenciales.ListarAsync(personaId, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }

    /// <summary>
    /// Genera la primera credencial para una persona activa (token aleatorio; el QR lleva el sobre cifrado).
    /// 409 si la persona ya tiene una credencial activa (use reemisión).
    /// </summary>
    [HttpPost("{personaId:int}/generar")]
    [ProducesResponseType(typeof(CredencialDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Generar(int personaId, CancellationToken ct)
    {
        var resultado = await _credenciales.GenerarAsync(personaId, ct);
        return resultado.Exitoso
            ? Created($"/api/credenciales/{resultado.Dato!.Id}", resultado.Dato)
            : ApiProblem.FromServicio(resultado);
    }

    /// <summary>
    /// Reemite una credencial: si está activa la revoca (motivo «Reemisión») y crea una nueva con la
    /// referencia <c>reemitido_de</c> (trazabilidad), todo en una transacción. Desde una revocada solo
    /// procede si la persona no tiene otra activa (409). 400 si la persona está inactiva.
    /// </summary>
    [HttpPost("{id:int}/reemitir")]
    [ProducesResponseType(typeof(CredencialDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Reemitir(int id, CancellationToken ct)
    {
        var resultado = await _credenciales.ReemitirAsync(id, ct);
        return resultado.Exitoso
            ? Created($"/api/credenciales/{resultado.Dato!.Id}", resultado.Dato)
            : ApiProblem.FromServicio(resultado);
    }

    /// <summary>
    /// Revoca la credencial (<c>estado = revocada</c>) con motivo opcional. Deja de ser válida para
    /// escaneo; no se borra físicamente (trazabilidad). 400 si ya está revocada.
    /// </summary>
    [HttpPost("{id:int}/revocar")]
    [ProducesResponseType(typeof(CredencialDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Revocar(int id, [FromBody] RevocarCredencialRequest? request, CancellationToken ct)
    {
        var resultado = await _credenciales.RevocarAsync(id, request?.Motivo, ct);
        return resultado.Exitoso ? Ok(resultado.Dato) : ApiProblem.FromServicio(resultado);
    }
}
