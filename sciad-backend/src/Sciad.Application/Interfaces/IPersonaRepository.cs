using Sciad.Domain.Entities;

namespace Sciad.Application.Interfaces;

public interface IPersonaRepository
{
    Task<Persona?> FindByIdAsync(int id, CancellationToken ct = default);
    Task<(IReadOnlyList<Persona> Items, int Total)> ListarPaginadoAsync(
        int? tipo, string? estado, int pagina, int tamanoPagina, CancellationToken ct = default);
    Task<bool> ExisteDpiAsync(string dpiCodigo, int? excluirId = null, CancellationToken ct = default);
    Task<Persona> AgregarAsync(Persona persona, CancellationToken ct = default);
    Task<Persona> ActualizarAsync(Persona persona, CancellationToken ct = default);
}