using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Sciad.Application.Interfaces;
using Sciad.Application.Options;

namespace Sciad.Application.Services;

/// <summary>
/// Emisión de JWTs HS256. Claims: <c>sub</c> (user_id), <c>name</c>, <c>role</c> y <c>rol</c>.
/// El rol se emite como <c>ClaimTypes.Role</c> para que funcione
/// <c>[Authorize(Roles=...)]</c>, además de un claim <c>rol</c> legible para el cliente.
/// </summary>
public sealed class TokenService : ITokenService
{
    private readonly JwtOptions _options;

    public TokenService(IOptions<JwtOptions> options)
    {
        _options = options.Value;
        _options.Validar();
    }

    public string GenerarToken(int usuarioId, string nombre, string rol)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Secreto));
        var credenciales = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, usuarioId.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(ClaimTypes.Name, nombre),
            // Claim de rol estándar (para [Authorize]) + claim custom legible:
            new(ClaimTypes.Role, rol),
            new("rol", rol),
        };

        var ahora = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: _options.Emisor,
            audience: _options.Audiencia,
            claims: claims,
            notBefore: ahora,
            expires: ahora.AddMinutes(_options.MinutosExpiracion),
            signingCredentials: credenciales);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
