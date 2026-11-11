namespace Sciad.Application.Dtos.Auth;

/// <summary>
/// Respuesta de login: forma <c>{ user, token }</c> idéntica a la que producía el mock del frontend.
/// </summary>
public sealed record LoginResponse(UsuarioDto User, string Token);
