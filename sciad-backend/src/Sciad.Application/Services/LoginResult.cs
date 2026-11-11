using Sciad.Application.Dtos.Auth;

namespace Sciad.Application.Services;

/// <summary>
/// Resultado de autenticación. <see cref="CodigoError"/> se mapea a una respuesta
/// HTTP consistente: <c>CREDENCIALES_INVALIDAS</c> → 401, <c>USUARIO_INACTIVO</c> → 403.
/// </summary>
public sealed record LoginResult(bool Exitoso, string? CodigoError = null, LoginResponse? Response = null)
{
    public static LoginResult Ok(LoginResponse response) => new(true, null, response);
    public static LoginResult Fallo(string codigoError) => new(false, codigoError);

    public const string CredencialesInvalidas = "CREDENCIALES_INVALIDAS";
    public const string UsuarioInactivo = "USUARIO_INACTIVO";
}
