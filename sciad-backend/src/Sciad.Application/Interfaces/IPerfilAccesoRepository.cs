using Sciad.Domain.Entities;

namespace Sciad.Application.Interfaces;

public interface IPerfilAccesoRepository
{
    Task<PerfilAcceso?> FindByIdAsync(int id, CancellationToken ct = default);
    Task<List<PerfilAcceso>> ListarAsync(int? personaId, int? zonaId, CancellationToken ct = default);
    Task<PerfilAcceso> AgregarAsync(PerfilAcceso perfil, CancellationToken ct = default);
    Task EliminarAsync(PerfilAcceso perfil, CancellationToken ct = default);
}