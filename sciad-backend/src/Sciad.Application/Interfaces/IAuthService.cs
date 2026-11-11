using Sciad.Application.Dtos.Auth;
using Sciad.Application.Services;

namespace Sciad.Application.Interfaces;

/// <summary>Contrato de autenticación usado por la capa de API.</summary>
public interface IAuthService
{
    Task<LoginResult> LoginAsync(string email, string password, CancellationToken ct = default);
    Task<UsuarioDto?> ObtenerPorIdAsync(int usuarioId, CancellationToken ct = default);
}
