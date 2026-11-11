using Sciad.Application.Dtos.Credenciales;
using Sciad.Application.Services;

namespace Sciad.Application.Interfaces;

public interface ICredencialesService
{
    Task<ServicioResultado<CredencialDto>> GenerarAsync(int personaId, CancellationToken ct = default);
    Task<ServicioResultado<CredencialDto>> ReemitirAsync(int id, CancellationToken ct = default);
    Task<ServicioResultado<CredencialDto>> RevocarAsync(int id, string? motivo, CancellationToken ct = default);
    Task<ServicioResultado<List<CredencialDto>>> ListarAsync(int? personaId, CancellationToken ct = default);
}