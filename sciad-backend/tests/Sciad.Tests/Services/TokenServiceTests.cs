using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Sciad.Application.Options;
using Sciad.Application.Services;

namespace Sciad.Tests.Services;

/// <summary>
/// Emisión de JWTs (TokenService): validación fail-fast del secreto (JwtOptions.Validar,
/// lanzada en el constructor y en Program) y contenido de los claims del token, incluido el
/// claim de rol estándar que alimenta [Authorize(Roles=…)].
/// </summary>
public sealed class TokenServiceTests
{
    private const string SecretoSuficiente = "clave-secreta-sciad-2026-super-segura-123456";

    [Theory]
    [InlineData("")]
    [InlineData("         ")]
    [InlineData("corta")]
    public void Constructor_SecretoInvalido_LanzaFailFast(string secreto)
    {
        var options = Options.Create(new JwtOptions { Secreto = secreto });

        var ex = Assert.Throws<InvalidOperationException>(() => new TokenService(options));

        Assert.Contains("SCIAD_JWT_SECRET", ex.Message);
    }

    [Fact]
    public void GenerarToken_EmiteClaimsSubNombreRolY_Jti()
    {
        var servicio = new TokenService(Options.Create(new JwtOptions { Secreto = SecretoSuficiente }));

        var token = servicio.GenerarToken(usuarioId: 7, nombre: "Ana López", rol: "SEGURIDAD");

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal("7", jwt.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal("Ana López", jwt.Claims.First(c => c.Type == ClaimTypes.Name).Value);
        // El rol se emite como ClaimTypes.Role para que [Authorize(Roles=…)] funcione…
        Assert.Equal("SEGURIDAD", jwt.Claims.First(c => c.Type == ClaimTypes.Role).Value);
        // …y también como claim legible "rol" para el cliente.
        Assert.Equal("SEGURIDAD", jwt.Claims.First(c => c.Type == "rol").Value);
        Assert.NotNull(jwt.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Jti));
        Assert.Equal("sciad", jwt.Issuer);
        Assert.Equal("sciad", jwt.Audiences.Single());
    }

    [Fact]
    public void GenerarToken_UsaHs256Y_VigenciaAproximadaALoConfigurado()
    {
        var servicio = new TokenService(Options.Create(new JwtOptions
        {
            Secreto = SecretoSuficiente,
            MinutosExpiracion = 120,
        }));

        var token = servicio.GenerarToken(1, "Ana", "ADMIN");
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        Assert.Equal(SecurityAlgorithms.HmacSha256, jwt.Header.Alg);
        Assert.True(jwt.ValidTo > DateTime.UtcNow.AddMinutes(119.5));
        Assert.True(jwt.ValidTo <= DateTime.UtcNow.AddMinutes(120.5));
    }

    [Fact]
    public void GenerarToken_TokensDistintos_NoSonIguales()
    {
        var servicio = new TokenService(Options.Create(new JwtOptions { Secreto = SecretoSuficiente }));

        var a = servicio.GenerarToken(1, "Ana", "ADMIN");
        var b = servicio.GenerarToken(1, "Ana", "ADMIN");

        Assert.NotEqual(a, b); // jti aleatorio por emisión
    }

    }