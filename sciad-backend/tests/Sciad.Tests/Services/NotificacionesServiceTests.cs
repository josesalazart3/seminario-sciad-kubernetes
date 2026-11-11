using Moq;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Notificaciones;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;
using Sciad.Domain.Entities;
using Sciad.Tests.Support;

namespace Sciad.Tests.Services;

/// <summary>
/// Lectura y gestión de notificaciones (CU-09): regla de visibilidad (gerencia ve solo las suyas,
/// admin ve todas), saneamiento de paginación, y protección de modificación — un usuario no puede
/// marcar como leída una notificación de otro destinatario salvo que sea Administrador.
/// </summary>
public sealed class NotificacionesServiceTests
{
    private readonly Mock<INotificacionRepository> _notificaciones = new();

    private NotificacionesService Servicio() => new(_notificaciones.Object, TestData.LoggerNulo<NotificacionesService>());

    // ========== Listar ==========
    [Fact]
    public async Task Listar_GerenciaVeSoloSusNotificaciones()
    {
        _notificaciones.Setup(m => m.ListarAsync(5, true, 1, 20, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Notificacion>(), 0));

        await Servicio().ListarAsync(leida: true, pagina: 1, tamanoPagina: 20, usuarioId: 5, esAdministrador: false);

        // el filtro de usuario se propaga al repositorio (no ve las de otros).
        _notificaciones.Verify(m => m.ListarAsync(5, true, 1, 20, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Listar_AdministradorVeTodasSinFiltroDeUsuario()
    {
        _notificaciones.Setup(m => m.ListarAsync(null, null, 1, 20, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Notificacion> { NotificacionDe(10, 5, "concentracion") }, 1));

        var resultado = await Servicio().ListarAsync(leida: null, pagina: 1, tamanoPagina: 20, usuarioId: 5, esAdministrador: true);

        Assert.True(resultado.Exitoso);
        Assert.Single(resultado.Dato!.Items);
        _notificaciones.Verify(m => m.ListarAsync(null, null, 1, 20, It.IsAny<CancellationToken>()), Times.Once);
    }

    // Saneamiento combinado: página inválida → 1; tamaño fuera de [1,100] → 20; el resto intacto.
    [Theory]
    [InlineData(0, 0, 1, 20)]       // página y tamaño inválidos
    [InlineData(-3, 0, 1, 20)]      // página negativa
    [InlineData(2, 150, 2, 20)]     // tamaño demasiado grande
    [InlineData(2, 500, 2, 20)]
    [InlineData(3, 99, 3, 99)]      // ambos válidos: se conservan
    public async Task Listar_SaneaPaginacionInvalida(int pagina, int tamano, int paginaEsperada, int tamanoEsperado)
    {
        _notificaciones.Setup(m => m.ListarAsync(It.IsAny<int?>(), It.IsAny<bool?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Notificacion>(), 0));

        var resultado = await Servicio().ListarAsync(leida: null, pagina: pagina, tamanoPagina: tamano, usuarioId: 1, esAdministrador: true);

        Assert.True(resultado.Exitoso);
        _notificaciones.Verify(m => m.ListarAsync(null, null, paginaEsperada, tamanoEsperado, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Listar_Exito_DevuelvePaginadoMapeado()
    {
        _notificaciones.Setup(m => m.ListarAsync(null, false, 1, 20, It.IsAny<CancellationToken>()))
            .ReturnsAsync((
                new List<Notificacion> { NotificacionDe(7, 2, "token_revocado", persona: TestData.PersonaActiva(9, "Ana López")) },
                1));

        var resultado = await Servicio().ListarAsync(leida: false, pagina: 1, tamanoPagina: 20, usuarioId: 1, esAdministrador: true);

        Assert.True(resultado.Exitoso);
        var item = resultado.Dato!.Items.Single();
        Assert.Equal("7", item.Id);
        Assert.Equal("token_revocado", item.Tipo);
        Assert.Equal(2, item.UsuarioId);
        Assert.Equal(9, item.PersonaId);
        Assert.Equal("Ana López", item.PersonaNombre);
        Assert.Equal(1, resultado.Dato.Total);
        Assert.Equal(1, resultado.Dato.TotalPaginas);
    }

    // ========== MarcarLeida ==========
    [Fact]
    public async Task MarcarLeida_NoExiste_DevuelveNoEncontrado()
    {
        _notificaciones.Setup(m => m.FindByIdAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync((Notificacion?)null);

        var resultado = await Servicio().MarcarLeidaAsync(99, new NotificacionLeidaRequest { Leida = true }, usuarioId: 1, esAdministrador: true);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.NoEncontrado, resultado.CodigoError);
    }

    [Fact]
    public async Task MarcarLeida_DeOtroUsuarioNoAdmin_DevuelveValidacion()
    {
        // La notificación pertenece al usuario 5; la modifica el usuario 2 (no admin).
        _notificaciones.Setup(m => m.FindByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(NotificacionDe(7, 5, "concentracion"));

        var resultado = await Servicio().MarcarLeidaAsync(7, new NotificacionLeidaRequest { Leida = true }, usuarioId: 2, esAdministrador: false);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
        _notificaciones.Verify(m => m.ActualizarAsync(It.IsAny<Notificacion>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task MarcarLeida_DelMismoUsuario_DevuelveExito()
    {
        var notificacion = NotificacionDe(7, 5, "concentracion");
        _notificaciones.Setup(m => m.FindByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(notificacion);
        _notificaciones.Setup(m => m.ActualizarAsync(notificacion, It.IsAny<CancellationToken>())).ReturnsAsync(notificacion);

        var resultado = await Servicio().MarcarLeidaAsync(7, new NotificacionLeidaRequest { Leida = true }, usuarioId: 5, esAdministrador: false);

        Assert.True(resultado.Exitoso);
        Assert.True(notificacion.Leida);
        Assert.True(resultado.Dato!.Leida);
    }

    [Fact]
    public async Task MarcarLeida_AdminSobreNotificacionDeOtro_DevuelveExito()
    {
        var notificacion = NotificacionDe(7, 5, "concentracion");
        _notificaciones.Setup(m => m.FindByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(notificacion);
        _notificaciones.Setup(m => m.ActualizarAsync(notificacion, It.IsAny<CancellationToken>())).ReturnsAsync(notificacion);

        var resultado = await Servicio().MarcarLeidaAsync(7, new NotificacionLeidaRequest { Leida = false }, usuarioId: 2, esAdministrador: true);

        Assert.True(resultado.Exitoso);
        Assert.False(notificacion.Leida);
    }

    // ========== helpers ==========
    private static Notificacion NotificacionDe(int id, int usuarioId, string tipo, Persona? persona = null) => new()
    {
        Id = id,
        UsuarioId = usuarioId,
        PersonaId = persona?.Id ?? null,
        Persona = persona,
        Tipo = tipo,
        Mensaje = $"Evento {tipo}",
        Leida = false,
        Fecha = DateTime.UtcNow,
    };
}