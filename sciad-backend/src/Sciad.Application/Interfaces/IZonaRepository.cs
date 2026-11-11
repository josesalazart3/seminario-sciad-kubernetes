using Sciad.Domain.Entities;

namespace Sciad.Application.Interfaces;

public interface IZonaRepository
{
    Task<IReadOnlyList<ZonaAcceso>> ListarAsync(CancellationToken ct = default);
    Task<ZonaAcceso?> FindByIdAsync(int id, CancellationToken ct = default);
    Task<ZonaAcceso> AgregarAsync(ZonaAcceso zona, CancellationToken ct = default);
    Task<ZonaAcceso> ActualizarAsync(ZonaAcceso zona, CancellationToken ct = default);
}