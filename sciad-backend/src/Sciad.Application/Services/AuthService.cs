using Microsoft.Extensions.Logging;
using Sciad.Application.Dtos.Auth;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;

namespace Sciad.Application.Services;

/// <summary>
/// Lógica de autenticación: valida credenciales (bcrypt), emite el JWT y resuelve el usuario actual.
/// </summary>
public sealed class AuthService : IAuthService
{
    private readonly IUsuarioRepository _usuarios;
    private readonly ITokenService _token;
    private readonly ILogger<AuthService> _logger;
    private readonly LoginAttemptTracker _intentos;

    // Hash «señuelo» (se calcula una vez): se verifica contra él cuando el correo no existe, la cuenta está inactiva o bloqueada,
    // para que TODAS las rutas de fallo tarden lo mismo y el tiempo de respuesta no delate qué correos existen (OWASP A07).
    private static readonly string HashSenuelo = BCrypt.Net.BCrypt.HashPassword("sciad-hash-senuelo-tiempo-constante", workFactor: 10);

    // `intentos` es opcional para no romper a quien construye AuthService a mano (p. ej. los tests); en la API se inyecta el singleton.
    public AuthService(IUsuarioRepository usuarios, ITokenService token, ILogger<AuthService> logger, LoginAttemptTracker? intentos = null)
    {
        _usuarios = usuarios;
        _token = token;
        _logger = logger;
        _intentos = intentos ?? new LoginAttemptTracker();
    }

    public async Task<LoginResult> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        // Respuesta genérica: no revelar si el correo existe.
        var fallo = LoginResult.Fallo(LoginResult.CredencialesInvalidas);

        // Cuenta bloqueada temporalmente por exceso de fallos: misma respuesta y mismo tiempo que una credencial inválida.
        if (_intentos.EstaBloqueado(email))
        {
            _ = BCrypt.Net.BCrypt.Verify(password ?? string.Empty, HashSenuelo);
            _logger.LogWarning("Inicio de sesión rechazado: cuenta bloqueada temporalmente por intentos fallidos.");
            return fallo;
        }

        var usuario = await _usuarios.FindByCorreoAsync(email, ct);
        if (usuario is null)
        {
            _ = BCrypt.Net.BCrypt.Verify(password ?? string.Empty, HashSenuelo);
            RegistrarFallo(email, null);
            _logger.LogWarning("Inicio de sesión fallido: correo desconocido.");
            return fallo;
        }

        if (!string.Equals(usuario.Estado, "activo", StringComparison.OrdinalIgnoreCase))
        {
            _ = BCrypt.Net.BCrypt.Verify(password ?? string.Empty, HashSenuelo);
            RegistrarFallo(email, usuario.Id);
            _logger.LogWarning("Inicio de sesión fallido: usuario inactivo (id={UsuarioId}).", usuario.Id);
            return LoginResult.Fallo(LoginResult.UsuarioInactivo);
        }

        if (!BCrypt.Net.BCrypt.Verify(password, usuario.PasswordHash))
        {
            RegistrarFallo(email, usuario.Id);
            _logger.LogWarning("Inicio de sesión fallido: contraseña incorrecta (id={UsuarioId}).", usuario.Id);
            return fallo;
        }

        _intentos.Reiniciar(email);

        var token = _token.GenerarToken(usuario.Id, usuario.Nombre, usuario.Rol.Codigo);
        var dto = UsuarioDto.From(usuario);

        _logger.LogInformation("Login correcto (id={UsuarioId}, rol={Rol}).", usuario.Id, usuario.Rol.Codigo);
        return LoginResult.Ok(new LoginResponse(dto, token));
    }

    private void RegistrarFallo(string email, int? usuarioId)
    {
        if (_intentos.RegistrarFallo(email))
        {
            _logger.LogWarning(
                "Cuenta bloqueada temporalmente tras {Fallos} intentos fallidos (id={UsuarioId}).",
                LoginAttemptTracker.MaxFallos, usuarioId);
        }
    }

    public async Task<UsuarioDto?> ObtenerPorIdAsync(int usuarioId, CancellationToken ct = default)
    {
        var usuario = await _usuarios.FindByIdAsync(usuarioId, ct);
        return usuario is null ? null : UsuarioDto.From(usuario);
    }
}
