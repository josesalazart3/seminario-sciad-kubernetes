using Microsoft.Extensions.Logging;
using Sciad.Application.Dtos.PerfilesAcceso;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;

namespace Sciad.Application.Services;

/// <summary>
/// Perfiles de acceso (CU-02): asigna zona + vigencia a una persona. Valida que la persona y la
/// zona existan, que la persona y la zona estén activas y que <c>vigencia_fin &gt;= vigencia_inicio</c>.
/// La baja se hace con <c>DELETE</c> físico: <c>perfiles_acceso</c> es una tabla de asignación
/// (no histórica) sin columna <c>estado</c> — DERCAS §7.4 solo exige soft-delete en
/// usuarios/personas/credenciales_qr (decisión anotada en bitácora 2B). La validación de
/// "zona activa" se completó en la adenda 2B cuando <c>zonas_acceso.estado</c> entró en vigor.
/// </summary>
public sealed class PerfilesAccesoService : IPerfilesAccesoService
{
    private readonly IPerfilAccesoRepository _perfiles;
    private readonly IPersonaRepository _personas;
    private readonly IZonaRepository _zonas;
    private readonly ILogger<PerfilesAccesoService> _logger;

    public PerfilesAccesoService(
        IPerfilAccesoRepository perfiles,
        IPersonaRepository personas,
        IZonaRepository zonas,
        ILogger<PerfilesAccesoService> logger)
    {
        _perfiles = perfiles;
        _personas = personas;
        _zonas = zonas;
        _logger = logger;
    }

    public async Task<ServicioResultado<List<PerfilAccesoDto>>> ListarAsync(
        int? personaId, int? zonaId, CancellationToken ct = default)
    {
        var perfiles = await _perfiles.ListarAsync(personaId, zonaId, ct);
        return ServicioResultado<List<PerfilAccesoDto>>.Ok(perfiles.Select(PerfilAccesoDto.From).ToList());
    }

    public async Task<ServicioResultado<PerfilAccesoDto>> CrearAsync(
        CrearPerfilAccesoRequest req, CancellationToken ct = default)
    {
        if (req.VigenciaFin < req.VigenciaInicio)
        {
            return ServicioResultado<PerfilAccesoDto>.Fallo(
                CodigosError.Validacion, "La vigencia final no puede ser anterior a la inicial.");
        }

        // Fase 8: sin fechas absurdas (año fuera de 2020–2100).
        if (req.VigenciaInicio.Year is < 2020 or > 2100 || req.VigenciaFin.Year is < 2020 or > 2100)
        {
            return ServicioResultado<PerfilAccesoDto>.Fallo(
                CodigosError.Validacion, "Las fechas de vigencia deben estar entre los años 2020 y 2100.");
        }

        var persona = await _personas.FindByIdAsync(req.PersonaId, ct);
        if (persona is null)
        {
            return ServicioResultado<PerfilAccesoDto>.Fallo(CodigosError.NoEncontrado, "Persona no encontrada.");
        }

        if (!string.Equals(persona.Estado, "activo", StringComparison.OrdinalIgnoreCase))
        {
            return ServicioResultado<PerfilAccesoDto>.Fallo(
                CodigosError.Validacion, "La persona debe estar activa para asignarle un perfil de acceso.");
        }

        var zona = await _zonas.FindByIdAsync(req.ZonaId, ct);
        if (zona is null)
        {
            return ServicioResultado<PerfilAccesoDto>.Fallo(CodigosError.NoEncontrado, "Zona no encontrada.");
        }

        if (!string.Equals(zona.Estado, "activo", StringComparison.OrdinalIgnoreCase))
        {
            return ServicioResultado<PerfilAccesoDto>.Fallo(
                CodigosError.Validacion, "La zona debe estar activa para asignarle un perfil de acceso.");
        }

        var perfil = new PerfilAcceso
        {
            PersonaId = persona.Id,
            ZonaId = zona.Id,
            VigenciaInicio = req.VigenciaInicio,
            VigenciaFin = req.VigenciaFin,
        };

        var creado = await _perfiles.AgregarAsync(perfil, ct);
        _logger.LogInformation(
            "Perfil de acceso creado (id={PerfilId}, persona={PersonaId}, zona={ZonaId}).",
            creado.Id, persona.Id, zona.Id);
        return ServicioResultado<PerfilAccesoDto>.Ok(PerfilAccesoDto.From(creado));
    }

    public async Task<ServicioResultado<bool>> EliminarAsync(int id, CancellationToken ct = default)
    {
        var perfil = await _perfiles.FindByIdAsync(id, ct);
        if (perfil is null)
        {
            return ServicioResultado<bool>.Fallo(CodigosError.NoEncontrado, "Perfil de acceso no encontrado.");
        }

        await _perfiles.EliminarAsync(perfil, ct);
        _logger.LogInformation("Perfil de acceso eliminado (id={PerfilId}).", id);
        return ServicioResultado<bool>.Ok(true);
    }
}