using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Sciad.Application.Dtos.Credenciales;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Domain.Time;

namespace Sciad.Application.Services;

/// <summary>
/// Credenciales QR (CU-03): generación y reemisión de tokens aleatorios de 64 caracteres hex
/// (RNF-01). Aparte del requisito mínimo del plan se bloquea la duplicidad de credencial activa
/// (409) — dos credenciales activas para una misma persona son una inconsistencia de auditoría
/// (ver bitácora 2B). Nunca se borra físicamente: solo cambia <c>estado</c>. El QR no lleva el token en claro sino el
/// sobre AES-256-GCM de <see cref="CifradoQr"/>.
/// </summary>
public sealed class CredencialesService : ICredencialesService
{
    /// <summary>Motivo con que queda revocada la credencial reemplazada en una reemisión.</summary>
    public const string MotivoReemision = "Reemisión";

    private readonly ICredencialRepository _credenciales;
    private readonly IPersonaRepository _personas;
    private readonly ICifradoQr _cifrado;
    private readonly ILogger<CredencialesService> _logger;

    public CredencialesService(
        ICredencialRepository credenciales,
        IPersonaRepository personas,
        ICifradoQr cifrado,
        ILogger<CredencialesService> logger)
    {
        _credenciales = credenciales;
        _personas = personas;
        _cifrado = cifrado;
        _logger = logger;
    }

    public async Task<ServicioResultado<CredencialDto>> GenerarAsync(
        int personaId, CancellationToken ct = default)
    {
        var persona = await _personas.FindByIdAsync(personaId, ct);
        if (persona is null)
        {
            return ServicioResultado<CredencialDto>.Fallo(CodigosError.NoEncontrado, "Persona no encontrada.");
        }

        if (!string.Equals(persona.Estado, "activo", StringComparison.OrdinalIgnoreCase))
        {
            return ServicioResultado<CredencialDto>.Fallo(
                CodigosError.Validacion, "No se puede generar una credencial para una persona inactiva.");
        }

        var existente = await _credenciales.ObtenerActivaPorPersonaAsync(personaId, ct);
        if (existente is not null)
        {
            return ServicioResultado<CredencialDto>.Fallo(
                CodigosError.Conflicto,
                "La persona ya tiene una credencial activa. Use la reemisión para reemplazarla.");
        }

        var creada = await _credenciales.AgregarAsync(new CredencialQr
        {
            PersonaId = personaId,
            Token = GenerarTokenHex64(),
            Estado = "activa",
            Emitido = Hoy(),
            ReemitidoDe = null,
        }, ct);

        _logger.LogInformation("Credencial generada (id={CredencialId}, persona={PersonaId}).", creada.Id, personaId);
        return ServicioResultado<CredencialDto>.Ok(Dto(creada));
    }

    public async Task<ServicioResultado<CredencialDto>> ReemitirAsync(
        int id, CancellationToken ct = default)
    {
        var anterior = await _credenciales.FindByIdAsync(id, ct);
        if (anterior is null)
        {
            return ServicioResultado<CredencialDto>.Fallo(CodigosError.NoEncontrado, "Credencial no encontrada.");
        }

        var persona = await _personas.FindByIdAsync(anterior.PersonaId, ct);
        if (persona is null)
        {
            return ServicioResultado<CredencialDto>.Fallo(CodigosError.NoEncontrado, "Persona no encontrada.");
        }

        if (!string.Equals(persona.Estado, "activo", StringComparison.OrdinalIgnoreCase))
        {
            return ServicioResultado<CredencialDto>.Fallo(
                CodigosError.Validacion, "No se puede reemitir una credencial para una persona inactiva.");
        }

        if (string.Equals(anterior.Estado, "activa", StringComparison.OrdinalIgnoreCase))
        {
            // La credencial vigente se revoca con motivo de trazabilidad.
            anterior.Estado = "revocada";
            anterior.Motivo = MotivoReemision;
        }
        else if (await _credenciales.ObtenerActivaPorPersonaAsync(anterior.PersonaId, ct) is not null)
        {
            // Desde una credencial ya revocada solo se reemite si la persona no tiene otra activa.
            return ServicioResultado<CredencialDto>.Fallo(
                CodigosError.Conflicto,
                "La persona ya tiene una credencial activa. Reemita esa credencial para reemplazarla.");
        }

        // Revocación de la anterior y alta de la nueva en una sola transacción (reemitido_de = trazabilidad).
        var nueva = await _credenciales.ReemitirAsync(anterior, new CredencialQr
        {
            PersonaId = anterior.PersonaId,
            Token = GenerarTokenHex64(),
            Estado = "activa",
            Emitido = Hoy(),
            ReemitidoDe = anterior.Id,
        }, ct);

        _logger.LogInformation(
            "Credencial reemitida (nueva={NuevaId}, anterior={AnteriorId}, persona={PersonaId}).",
            nueva.Id, anterior.Id, anterior.PersonaId);
        return ServicioResultado<CredencialDto>.Ok(Dto(nueva));
    }

    public async Task<ServicioResultado<CredencialDto>> RevocarAsync(
        int id, string? motivo, CancellationToken ct = default)
    {
        var credencial = await _credenciales.FindByIdAsync(id, ct);
        if (credencial is null)
        {
            return ServicioResultado<CredencialDto>.Fallo(CodigosError.NoEncontrado, "Credencial no encontrada.");
        }

        if (string.Equals(credencial.Estado, "revocada", StringComparison.OrdinalIgnoreCase))
        {
            return ServicioResultado<CredencialDto>.Fallo(
                CodigosError.Validacion, "La credencial ya está revocada.");
        }

        credencial.Estado = "revocada";
        credencial.Motivo = motivo;
        var actualizada = await _credenciales.ActualizarAsync(credencial, ct);

        _logger.LogInformation(
            "Credencial {CredencialId} revocada (persona={PersonaId}, motivo={Motivo}).",
            id, credencial.PersonaId, motivo);
        return ServicioResultado<CredencialDto>.Ok(Dto(actualizada));
    }

    public async Task<ServicioResultado<List<CredencialDto>>> ListarAsync(
        int? personaId, CancellationToken ct = default)
    {
        if (personaId.HasValue)
        {
            var persona = await _personas.FindByIdAsync(personaId.Value, ct);
            if (persona is null)
            {
                return ServicioResultado<List<CredencialDto>>.Fallo(
                    CodigosError.NoEncontrado, "Persona no encontrada.");
            }

            var historial = await _credenciales.ListarPorPersonaAsync(personaId.Value, ct);
            return ServicioResultado<List<CredencialDto>>.Ok(
                historial.Select(Dto).ToList());
        }

        var todas = await _credenciales.ListarAsync(ct);
        return ServicioResultado<List<CredencialDto>>.Ok(todas.Select(Dto).ToList());
    }

    /// <summary>DTO con el sobre cifrado del QR (el token completo no sale del servidor).</summary>
    private CredencialDto Dto(CredencialQr c) => CredencialDto.From(c, _cifrado.Cifrar(c.Id, c.Token));

    private static DateOnly Hoy() => GuatemalaTime.Hoy;

    /// <summary>32 bytes aleatorios (CSPRNG) → 64 caracteres hex. RNF-01 / RNF-02.</summary>
    private static string GenerarTokenHex64()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}