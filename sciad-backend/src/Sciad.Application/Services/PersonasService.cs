using Microsoft.Extensions.Logging;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Personas;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;

namespace Sciad.Application.Services;

/// <summary>
/// CRUD administrativo de personas (Colaboradores/Visitantes): alta/baja lógica vía
/// <c>estado</c>, unicidad de <c>dpi_codigo</c> y filtrado por <c>tipo</c> (1/2) y <c>estado</c>.
/// </summary>
public sealed class PersonasService : IPersonasService
{
    private readonly IPersonaRepository _personas;
    private readonly ILogger<PersonasService> _logger;

    public PersonasService(IPersonaRepository personas, ILogger<PersonasService> logger)
    {
        _personas = personas;
        _logger = logger;
    }

    public async Task<ServicioResultado<PaginadoDto<PersonaDto>>> ListarAsync(
        int? tipo, string? estado, int pagina, int tamanoPagina, CancellationToken ct = default)
    {
        if (tipo.HasValue && tipo is not (Persona.TipoColaborador or Persona.TipoVisitante))
        {
            return ServicioResultado<PaginadoDto<PersonaDto>>.Fallo(
                CodigosError.Validacion, "El tipo debe ser 1 (colaborador) o 2 (visitante).");
        }

        if (!string.IsNullOrWhiteSpace(estado) && estado is not ("activo" or "inactivo"))
        {
            return ServicioResultado<PaginadoDto<PersonaDto>>.Fallo(
                CodigosError.Validacion, "El estado debe ser 'activo' o 'inactivo'.");
        }

        var (items, total) = await _personas.ListarPaginadoAsync(
            tipo, Normalizar(estado), pagina, tamanoPagina, ct);
        var totalPaginas = CalcularTotalPaginas(total, tamanoPagina);
        var dtos = items.Select(PersonaDto.From).ToList();
        return ServicioResultado<PaginadoDto<PersonaDto>>.Ok(
            new PaginadoDto<PersonaDto>(dtos, total, pagina, tamanoPagina, totalPaginas));
    }

    public async Task<ServicioResultado<PersonaDto>> CrearAsync(CrearPersonaRequest req, CancellationToken ct = default)
    {
        var error = Validar(req.Nombre, req.DpiCodigo, req.Tipo, out var nombre, out var dpi);
        if (error is not null)
        {
            return ServicioResultado<PersonaDto>.Fallo(CodigosError.Validacion, error);
        }

        if (await _personas.ExisteDpiAsync(dpi, null, ct))
        {
            return ServicioResultado<PersonaDto>.Fallo(CodigosError.Conflicto, "Ya existe una persona con ese DPI.");
        }

        var persona = new Persona
        {
            Nombre = nombre,
            DpiCodigo = dpi,
            Tipo = req.Tipo,
            Estado = "activo",
        };

        var creada = await _personas.AgregarAsync(persona, ct);
        _logger.LogInformation("Persona creada (id={PersonaId}, tipo={Tipo}).", creada.Id, creada.Tipo);
        return ServicioResultado<PersonaDto>.Ok(PersonaDto.From(creada));
    }

    public async Task<ServicioResultado<PersonaDto>> ActualizarAsync(
        int id, ActualizarPersonaRequest req, CancellationToken ct = default)
    {
        var existente = await _personas.FindByIdAsync(id, ct);
        if (existente is null)
        {
            return ServicioResultado<PersonaDto>.Fallo(CodigosError.NoEncontrado, "Persona no encontrada.");
        }

        var error = Validar(req.Nombre, req.DpiCodigo, req.Tipo, out var nombre, out var dpi);
        if (error is not null)
        {
            return ServicioResultado<PersonaDto>.Fallo(CodigosError.Validacion, error);
        }

        if (await _personas.ExisteDpiAsync(dpi, id, ct))
        {
            return ServicioResultado<PersonaDto>.Fallo(CodigosError.Conflicto, "Ya existe una persona con ese DPI.");
        }

        existente.Nombre = nombre;
        existente.DpiCodigo = dpi;
        existente.Tipo = req.Tipo;

        var actualizada = await _personas.ActualizarAsync(existente, ct);
        _logger.LogInformation("Persona actualizada (id={PersonaId}).", actualizada.Id);
        return ServicioResultado<PersonaDto>.Ok(PersonaDto.From(actualizada));
    }

    public async Task<ServicioResultado<PersonaDto>> CambiarEstadoAsync(
        int id, CambiarEstadoRequest req, CancellationToken ct = default)
    {
        var existente = await _personas.FindByIdAsync(id, ct);
        if (existente is null)
        {
            return ServicioResultado<PersonaDto>.Fallo(CodigosError.NoEncontrado, "Persona no encontrada.");
        }

        var estado = req.Estado.Trim().ToLowerInvariant();
        if (estado is not ("activo" or "inactivo"))
        {
            return ServicioResultado<PersonaDto>.Fallo(
                CodigosError.Validacion, "El estado debe ser 'activo' o 'inactivo'.");
        }

        existente.Estado = estado;
        var actualizada = await _personas.ActualizarAsync(existente, ct);
        _logger.LogInformation("Estado de persona cambiado (id={PersonaId}, estado={Estado}).", id, estado);
        return ServicioResultado<PersonaDto>.Ok(PersonaDto.From(actualizada));
    }

    /// <summary>Normaliza y valida nombre, DPI y tipo (<see cref="ValidacionPersona"/>). Devuelve el mensaje de error o null.</summary>
    private static string? Validar(string? nombreCrudo, string? dpiCrudo, int tipo, out string nombre, out string dpi)
    {
        nombre = ValidacionPersona.NormalizarNombre(nombreCrudo);
        dpi = ValidacionPersona.NormalizarDpi(dpiCrudo);
        if (!ValidacionPersona.NombreValido(nombre, out var motivo) || !ValidacionPersona.DpiValido(dpi, out motivo))
        {
            return motivo;
        }

        return tipo is Persona.TipoColaborador or Persona.TipoVisitante
            ? null
            : "El tipo debe ser 1 (colaborador) o 2 (visitante).";
    }

    private static string? Normalizar(string? valor)
        => string.IsNullOrWhiteSpace(valor) ? null : valor.Trim().ToLowerInvariant();

    private static int CalcularTotalPaginas(int total, int tamanoPagina)
        => total == 0 ? 0 : (int)Math.Ceiling(total / (double)tamanoPagina);
}