using Moq;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;
using Sciad.Domain.Entities;
using Sciad.Tests.Support;

namespace Sciad.Tests.Services;

/// <summary>
/// Autenticación (CU-10): usuario inexistente e inactivo, contraseña incorrecta, respuestas
/// genéricas que no revelan si el correo existe (SEC-02/sin enumeración de usuarios), y el
/// flujo feliz que emite el JWT con el rol correcto.
/// </summary>
public sealed class AuthServiceTests
{
    private const string PasswordValida = "Clave#Segura1";

    private readonly Mock<IUsuarioRepository> _usuarios = new();
    private readonly Mock<ITokenService> _token = new();

    private AuthService Servicio() => new(_usuarios.Object, _token.Object, TestData.LoggerNulo<AuthService>());

    [Fact]
    public async Task Login_CorreoDesconocido_DevuelveCredencialesInvalidas_SinRevelarExistencia()
    {
        _usuarios.Setup(m => m.FindByCorreoAsync("nadie@sciad.gt", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Usuario?)null);

        var resultado = await Servicio().LoginAsync("nadie@sciad.gt", PasswordValida);

        Assert.False(resultado.Exitoso);
        Assert.Equal(LoginResult.CredencialesInvalidas, resultado.CodigoError);
        _token.Verify(m => m.GenerarToken(It.IsAny<int>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Login_UsuarioInactivo_DevuelveUsuarioInactivo()
    {
        var usuario = TestData.UsuarioRol("ADMIN");
        usuario.Estado = "inactivo";
        _usuarios.Setup(m => m.FindByCorreoAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(usuario);

        var resultado = await Servicio().LoginAsync("admin@sciad.gt", PasswordValida);

        Assert.False(resultado.Exitoso);
        Assert.Equal(LoginResult.UsuarioInactivo, resultado.CodigoError);
    }

    [Fact]
    public async Task Login_ContrasenaIncorrecta_DevuelveCredencialesInvalidas()
    {
        var usuario = TestData.UsuarioRol("SEGURIDAD");
        usuario.PasswordHash = BCrypt.Net.BCrypt.HashPassword(PasswordValida, workFactor: 10);
        _usuarios.Setup(m => m.FindByCorreoAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(usuario);

        var resultado = await Servicio().LoginAsync("seguridad@sciad.gt", "Contrasena-Mala");

        Assert.False(resultado.Exitoso);
        Assert.Equal(LoginResult.CredencialesInvalidas, resultado.CodigoError);
    }

    [Fact]
    public async Task Login_Exitoso_EmiteTokenConElRolDelUsuario()
    {
        var usuario = TestData.UsuarioRol("GERENCIA");
        usuario.PasswordHash = BCrypt.Net.BCrypt.HashPassword(PasswordValida, workFactor: 10);
        _usuarios.Setup(m => m.FindByCorreoAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(usuario);
        _token.Setup(m => m.GenerarToken(usuario.Id, usuario.Nombre, "GERENCIA")).Returns("jwt-firma");

        var resultado = await Servicio().LoginAsync("gerencia@sciad.gt", PasswordValida);

        Assert.True(resultado.Exitoso);
        Assert.Equal("jwt-firma", resultado.Response!.Token);
        Assert.Equal("GERENCIA", resultado.Response.User.Rol);
        Assert.True(resultado.Response.User.Activo);
        _token.Verify(m => m.GenerarToken(usuario.Id, usuario.Nombre, "GERENCIA"), Times.Once);
    }

    [Fact]
    public async Task ObtenerPorId_UsuarioNoExiste_DevuelveNull()
    {
        _usuarios.Setup(m => m.FindByIdAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync((Usuario?)null);

        var resultado = await Servicio().ObtenerPorIdAsync(99);

        Assert.Null(resultado);
    }
}