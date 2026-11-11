using Moq;
using Sciad.Application.Dtos.Auth;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Usuarios;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;
using Sciad.Domain.Entities;
using Sciad.Tests.Support;

namespace Sciad.Tests.Services;

/// <summary>
/// CRUD administrativo de usuarios (CU-01): unicidad de correo, resolución del rol por código,
/// hash de contraseña (BCrypt) y baja lógica por estado. La integridad del hash es responsabilidad
/// de <see cref="AuthService"/>, probado aparte; aquí se verifica que Crear/Actualizar SIEMPRE
/// re-hashee cuando hay contraseña y que el rol inválido se rechaza.
/// </summary>
public sealed class UsuariosServiceTests
{
    private readonly Mock<IUsuarioRepository> _usuarios = new();

    private UsuariosService Servicio() => new(_usuarios.Object, TestData.LoggerNulo<UsuariosService>());

    // ========== Listar ==========
    [Fact]
    public async Task Listar_DevuelvePaginadoConTotalDePaginas()
    {
        _usuarios.Setup(m => m.ListarPaginadoAsync(1, 20, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new[] { TestData.UsuarioRol("ADMIN", 1), TestData.UsuarioRol("GERENCIA", 2) }, 2));

        var resultado = await Servicio().ListarAsync(1, 20);

        Assert.True(resultado.Exitoso);
        var paginado = resultado.Dato!;
        Assert.Equal(2, paginado.Total);
        Assert.Equal(1, paginado.TotalPaginas);
        Assert.Equal("ADMIN", paginado.Items[0].Rol);
        Assert.Equal("UA", paginado.Items[0].AvatarInitials); // "Usuario ADMIN" → iniciales
    }

    // ========== Crear ==========
    [Fact]
    public async Task Crear_CorreoDuplicado_DevuelveConflicto()
    {
        _usuarios.Setup(m => m.ExisteCorreoAsync("admin@sciad.gt", null, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var resultado = await Servicio().CrearAsync(new CrearUsuarioRequest { Nombre = "Ana", Correo = "admin@sciad.gt", Password = "Clave#Segura1", Rol = "ADMIN" });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Conflicto, resultado.CodigoError);
    }

    [Fact]
    public async Task Crear_RolInexistente_DevuelveValidacion()
    {
        _usuarios.Setup(m => m.ExisteCorreoAsync(It.IsAny<string>(), null, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _usuarios.Setup(m => m.FindRolByCodigoAsync("SUPERVISOR", It.IsAny<CancellationToken>())).ReturnsAsync((Rol?)null);

        var resultado = await Servicio().CrearAsync(new CrearUsuarioRequest { Nombre = "Ana", Correo = "a@sciad.gt", Password = "Clave#Segura1", Rol = "SUPERVISOR" });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
    }

    [Fact]
    public async Task Crear_Exito_GuardaCorreoMinusculoYHashBCrypt()
    {
        _usuarios.Setup(m => m.ExisteCorreoAsync("ana@sciad.gt", null, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _usuarios.Setup(m => m.FindRolByCodigoAsync("SEGURIDAD", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Rol { Id = 2, Nombre = "Seguridad", Codigo = "SEGURIDAD" });
        Usuario? agregado = null;
        _usuarios.Setup(m => m.AgregarAsync(It.IsAny<Usuario>(), It.IsAny<CancellationToken>()))
            .Callback<Usuario, CancellationToken>((u, _) => agregado = u)
            .ReturnsAsync((Usuario u, CancellationToken _) => u);

        var resultado = await Servicio().CrearAsync(new CrearUsuarioRequest
        {
            Nombre = "Ana López",
            Correo = "  ANA@sciad.GT  ",
            Password = "Clave#Segura1",
            Rol = "SEGURIDAD",
            Puesto = "  Guardia  ",
        });

        Assert.True(resultado.Exitoso);
        Assert.NotNull(agregado);
        Assert.Equal("ana@sciad.gt", agregado!.Correo);      // se normaliza a minúsculas
        Assert.Equal("Ana López", agregado.Nombre);           // recorte de espacios
        Assert.Equal("Guardia", agregado.Puesto);
        Assert.Equal("SEGURIDAD", agregado.Rol.Codigo);
        Assert.Equal("activo", agregado.Estado);
        // La contraseña SIEMPRE se almacena hasheada (BCrypt), nunca en claro (SEC).
        Assert.NotEqual("Clave#Segura1", agregado.PasswordHash);
        Assert.True(BCrypt.Net.BCrypt.Verify("Clave#Segura1", agregado.PasswordHash));
    }

    // ========== Actualizar ==========
    [Fact]
    public async Task Actualizar_UsuarioNoExiste_DevuelveNoEncontrado()
    {
        _usuarios.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync((Usuario?)null);

        var resultado = await Servicio().ActualizarAsync(9, new ActualizarUsuarioRequest());

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.NoEncontrado, resultado.CodigoError);
    }

    [Fact]
    public async Task Actualizar_CorreoDeOtroUsuario_DevuelveConflicto()
    {
        _usuarios.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(TestData.UsuarioRol("ADMIN", 9));
        _usuarios.Setup(m => m.ExisteCorreoAsync("otro@sciad.gt", 9, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var resultado = await Servicio().ActualizarAsync(9, new ActualizarUsuarioRequest { Nombre = "X", Correo = "otro@sciad.gt", Rol = "ADMIN" });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Conflicto, resultado.CodigoError);
    }

    [Fact]
    public async Task Actualizar_RolInexistente_DevuelveValidacion()
    {
        _usuarios.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(TestData.UsuarioRol("ADMIN", 9));
        _usuarios.Setup(m => m.ExisteCorreoAsync(It.IsAny<string>(), 9, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _usuarios.Setup(m => m.FindRolByCodigoAsync("NOEXISTE", It.IsAny<CancellationToken>())).ReturnsAsync((Rol?)null);

        var resultado = await Servicio().ActualizarAsync(9, new ActualizarUsuarioRequest { Nombre = "X", Correo = "x@sciad.gt", Rol = "NOEXISTE" });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
    }

    [Fact]
    public async Task Actualizar_SinPasswordNoRehasea_ConPasswordRehasea()
    {
        var existente = TestData.UsuarioRol("ADMIN", 9);
        var hashOriginal = existente.PasswordHash;
        _usuarios.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(existente);
        _usuarios.Setup(m => m.ExisteCorreoAsync(It.IsAny<string>(), 9, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _usuarios.Setup(m => m.FindRolByCodigoAsync("ADMIN", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Rol { Id = 1, Nombre = "Administrador", Codigo = "ADMIN" });
        _usuarios.Setup(m => m.ActualizarAsync(existente, It.IsAny<CancellationToken>())).ReturnsAsync(existente);

        // Sin contraseña: el hash original se conserva.
        var sinPass = await Servicio().ActualizarAsync(9, new ActualizarUsuarioRequest { Nombre = "Nuevo", Correo = "admin@sciad.gt", Rol = "ADMIN" });
        Assert.True(sinPass.Exitoso);
        Assert.Equal(hashOriginal, existente.PasswordHash);

        // Con contraseña: se rehasea.
        var conPass = await Servicio().ActualizarAsync(9, new ActualizarUsuarioRequest { Nombre = "Nuevo", Correo = "admin@sciad.gt", Rol = "ADMIN", Password = "Nueva#Clave99" });
        Assert.True(conPass.Exitoso);
        Assert.NotEqual(hashOriginal, existente.PasswordHash);
        Assert.True(BCrypt.Net.BCrypt.Verify("Nueva#Clave99", existente.PasswordHash));
    }

    [Fact]
    public async Task Actualizar_Exito_ActualizaRolYNormalizaCorreo()
    {
        var existente = TestData.UsuarioRol("SEGURIDAD", 9);
        _usuarios.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(existente);
        _usuarios.Setup(m => m.ExisteCorreoAsync(It.IsAny<string>(), 9, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _usuarios.Setup(m => m.FindRolByCodigoAsync("GERENCIA", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Rol { Id = 3, Nombre = "Gerencia", Codigo = "GERENCIA" });
        _usuarios.Setup(m => m.ActualizarAsync(existente, It.IsAny<CancellationToken>())).ReturnsAsync(existente);

        var resultado = await Servicio().ActualizarAsync(9, new ActualizarUsuarioRequest
        {
            Nombre = "Nueva Gerente",
            Correo = "  GERENTE@sciad.GT  ",
            Rol = "GERENCIA",
            Puesto = "Gerente de Riesgo",
        });

        Assert.True(resultado.Exitoso);
        Assert.Equal("gerente@sciad.gt", existente.Correo);
        Assert.Equal("GERENCIA", existente.Rol.Codigo);
        Assert.Equal("Nueva Gerente", existente.Nombre);
        Assert.Equal("GERENCIA", resultado.Dato!.Rol);
    }

    // ========== CambiarEstado ==========
    [Fact]
    public async Task CambiarEstado_UsuarioNoExiste_DevuelveNoEncontrado()
    {
        _usuarios.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync((Usuario?)null);

        var resultado = await Servicio().CambiarEstadoAsync(9, new CambiarEstadoRequest { Estado = "inactivo" });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.NoEncontrado, resultado.CodigoError);
    }

    [Theory]
    [InlineData("bloqueado")]
    [InlineData(" ")]
    public async Task CambiarEstado_EstadoInvalido_DevuelveValidacion(string estado)
    {
        _usuarios.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(TestData.UsuarioRol("ADMIN", 9));

        var resultado = await Servicio().CambiarEstadoAsync(9, new CambiarEstadoRequest { Estado = estado });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
    }

    [Fact]
    public async Task CambiarEstado_Valido_AplicaYPersiste()
    {
        var usuario = TestData.UsuarioRol("SEGURIDAD", 9);
        _usuarios.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(usuario);
        _usuarios.Setup(m => m.ActualizarAsync(usuario, It.IsAny<CancellationToken>())).ReturnsAsync(usuario);

        var resultado = await Servicio().CambiarEstadoAsync(9, new CambiarEstadoRequest { Estado = "inactivo" });

        Assert.True(resultado.Exitoso);
        Assert.Equal("inactivo", usuario.Estado);
        Assert.False(resultado.Dato!.Activo); // el DTO deriva Activo del estado
    }
}