using Sciad.Application.Dtos.PerfilesAcceso;
using Sciad.Application.Services;

namespace Sciad.Application.Interfaces;

public interface IPerfilesAccesoService
{
    Task<ServicioResultado<List<PerfilAccesoDto>>> ListarAsync(int? personaId, int? zonaId, CancellationToken ct = default);
    Task<ServicioResultado<PerfilAccesoDto>> CrearAsync(CrearPerfilAccesoRequest req, CancellationToken ct = default);
    Task<ServicioResultado<bool>> EliminarAsync(int id, CancellationToken ct = default);
}