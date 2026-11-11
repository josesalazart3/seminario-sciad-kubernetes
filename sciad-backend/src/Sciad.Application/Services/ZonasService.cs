using Microsoft.Extensions.Logging;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Zonas;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;

namespace Sciad.Application.Services;

/// <summary>
/// CRUD de zonas de acceso. Adenda a la Fase 2B (corrección post-verificación): la zona sí tiene
/// <c>estado</c> (baja lógica, mismo patrón de usuarios/personas) además de <c>capacidad</c> y
/// <c>nivel_riesgo</c>. Ver bitácora 2B.
/// </summary>
public sealed class ZonasService : IZonasService
{
    private readonly IZonaRepository _zonas;
    private readonly ILogger<ZonasService> _logger;

    public ZonasService(IZonaRepository zonas, ILogger<ZonasService> logger)
    {
        _zonas = zonas;
        _logger = logger;
    }

    public Task<ServicioResultado<IReadOnlyList<ZonaDto>>> ListarAsync(CancellationToken ct = default)
        => ListarAsync(null, ct);

    /// <summary>Fase 8.4: filtra por estado (pocas filas, sin paginación: se filtra en memoria).</summary>
    public async Task<ServicioResultado<IReadOnlyList<ZonaDto>>> ListarAsync(string? estado, CancellationToken ct = default)
    {
        var zonas = await _zonas.ListarAsync(ct);
        return ServicioResultado<IReadOnlyList<ZonaDto>>.Ok(zonas
            .Where(z => estado is null || string.Equals(z.Estado, estado, StringComparison.OrdinalIgnoreCase))
            .Select(ZonaDto.From)
            .ToList());
    }

    public async Task<ServicioResultado<ZonaDto>> CrearAsync(CrearZonaRequest req, CancellationToken ct = default)
    {
        var zona = new ZonaAcceso
        {
            Nombre = req.Nombre.Trim(),
            NivelSeguridad = req.NivelSeguridad.Trim(),
            Capacidad = req.Capacidad,
            NivelRiesgo = req.NivelRiesgo.Trim(),
            Estado = "activo",
        };

        var creada = await _zonas.AgregarAsync(zona, ct);
        _logger.LogInformation("Zona creada (id={ZonaId}).", creada.Id);
        return ServicioResultado<ZonaDto>.Ok(ZonaDto.From(creada));
    }

    public async Task<ServicioResultado<ZonaDto>> ActualizarAsync(
        int id, ActualizarZonaRequest req, CancellationToken ct = default)
    {
        var existente = await _zonas.FindByIdAsync(id, ct);
        if (existente is null)
        {
            return ServicioResultado<ZonaDto>.Fallo(CodigosError.NoEncontrado, "Zona no encontrada.");
        }

        existente.Nombre = req.Nombre.Trim();
        existente.NivelSeguridad = req.NivelSeguridad.Trim();
        existente.Capacidad = req.Capacidad;
        existente.NivelRiesgo = req.NivelRiesgo.Trim();

        var actualizada = await _zonas.ActualizarAsync(existente, ct);
        _logger.LogInformation("Zona actualizada (id={ZonaId}).", actualizada.Id);
        return ServicioResultado<ZonaDto>.Ok(ZonaDto.From(actualizada));
    }

    public async Task<ServicioResultado<ZonaDto>> CambiarEstadoAsync(
        int id, CambiarEstadoRequest req, CancellationToken ct = default)
    {
        var existente = await _zonas.FindByIdAsync(id, ct);
        if (existente is null)
        {
            return ServicioResultado<ZonaDto>.Fallo(CodigosError.NoEncontrado, "Zona no encontrada.");
        }

        var estado = req.Estado.Trim().ToLowerInvariant();
        if (estado is not ("activo" or "inactivo"))
        {
            return ServicioResultado<ZonaDto>.Fallo(
                CodigosError.Validacion, "El estado debe ser 'activo' o 'inactivo'.");
        }

        existente.Estado = estado;
        var actualizada = await _zonas.ActualizarAsync(existente, ct);
        _logger.LogInformation("Estado de zona cambiado (id={ZonaId}, estado={Estado}).", id, estado);
        return ServicioResultado<ZonaDto>.Ok(ZonaDto.From(actualizada));
    }
}