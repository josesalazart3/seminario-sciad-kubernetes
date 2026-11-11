namespace Sciad.Application.Interfaces;

/// <summary>Genera y valida JWTs.</summary>
public interface ITokenService
{
    /// <summary>Crea un JWT HS256 con claims (user_id, rol, exp) de 8 h.</summary>
    string GenerarToken(int usuarioId, string nombre, string rol);
}
