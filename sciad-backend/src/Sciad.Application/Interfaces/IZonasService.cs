using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Zonas;
using Sciad.Application.Services;

namespace Sciad.Application.Interfaces;

public interface IZonasService
{
    Task<ServicioResultado<IReadOnlyList<ZonaDto>>> ListarAsync(CancellationToken ct = default);

    /// <summary>Zonas filtradas por estado (<c>"activo"</c>/<c>"inactivo"</c>; <c>null</c> = todas). Fase 8.4.</summary>
    Task<ServicioResultado<IReadOnlyList<ZonaDto>>> ListarAsync(string? estado, CancellationToken ct = default);
    Task<ServicioResultado<ZonaDto>> CrearAsync(CrearZonaRequest req, CancellationToken ct = default);
    Task<ServicioResultado<ZonaDto>> ActualizarAsync(int id, ActualizarZonaRequest req, CancellationToken ct = default);
    Task<ServicioResultado<ZonaDto>> CambiarEstadoAsync(int id, CambiarEstadoRequest req, CancellationToken ct = default);
}