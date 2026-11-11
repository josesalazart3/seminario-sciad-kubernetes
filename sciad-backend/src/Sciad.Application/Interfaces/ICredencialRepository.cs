using Sciad.Domain.Entities;

namespace Sciad.Application.Interfaces;

public interface ICredencialRepository
{
    Task<CredencialQr?> FindByIdAsync(int id, CancellationToken ct = default);
    Task<CredencialQr?> ObtenerActivaPorPersonaAsync(int personaId, CancellationToken ct = default);
    Task<List<CredencialQr>> ListarPorPersonaAsync(int personaId, CancellationToken ct = default);
    Task<List<CredencialQr>> ListarAsync(CancellationToken ct = default);
    Task<CredencialQr> AgregarAsync(CredencialQr credencial, CancellationToken ct = default);
    Task<CredencialQr> ActualizarAsync(CredencialQr credencial, CancellationToken ct = default);

    /// <summary>Guarda en una sola transacción los cambios de la credencial anterior y el alta de la nueva.</summary>
    Task<CredencialQr> ReemitirAsync(CredencialQr anterior, CredencialQr nueva, CancellationToken ct = default);
}