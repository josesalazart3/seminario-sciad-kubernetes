using Moq;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Zonas;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;
using Sciad.Domain.Entities;
using Sciad.Tests.Support;

namespace Sciad.Tests.Services;

/// <summary>
/// CRUD de zonas de acceso (adenda Fase 2B): alta con <c>activo</c> por defecto, actualización
/// de capacidad/niveles, y baja lógica por estado (mismo patrón que usuarios/personas).
/// </summary>
public sealed class ZonasServiceTests
{
    private readonly Mock<IZonaRepository> _zonas = new();

    private ZonasService Servicio() => new(_zonas.Object, TestData.LoggerNulo<ZonasService>());

    [Fact]
    public async Task Listar_DevuelveTodasLasZonasMapeadas()
    {
        _zonas.Setup(m => m.ListarAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ZonaAcceso> { TestData.ZonaActiva(1, "Oficinas"), TestData.ZonaInactiva(2) });

        var resultado = await Servicio().ListarAsync();

        Assert.True(resultado.Exitoso);
        Assert.Equal(2, resultado.Dato!.Count);
        Assert.Equal("Oficinas", resultado.Dato[0].Nombre);
        // Incluye también las inactivas (la baja lógica no las oculta del listado administrativo).
        Assert.Equal("inactivo", resultado.Dato[1].Estado);
    }

    [Fact]
    public async Task Crear_Exito_DevuelveConEstadoActivo()
    {
        _zonas.Setup(m => m.AgregarAsync(It.IsAny<ZonaAcceso>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ZonaAcceso z, CancellationToken _) => { z.Id = 3; return z; });

        var resultado = await Servicio().CrearAsync(new CrearZonaRequest
        {
            Nombre = "  Rectoría  ",
            NivelSeguridad = " ALTO ",
            Capacidad = 100,
            NivelRiesgo = " ALTO ",
        });

        Assert.True(resultado.Exitoso);
        var dto = resultado.Dato!;
        Assert.Equal("3", dto.Id);
        Assert.Equal("Rectoría", dto.Nombre); // recorte de espacios
        Assert.Equal("ALTO", dto.NivelSeguridad);
        Assert.Equal(100, dto.Capacidad);
        Assert.Equal("activo", dto.Estado);
    }

    [Fact]
    public async Task Actualizar_ZonaNoExiste_DevuelveNoEncontrado()
    {
        _zonas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync((ZonaAcceso?)null);

        var resultado = await Servicio().ActualizarAsync(9, new ActualizarZonaRequest());

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.NoEncontrado, resultado.CodigoError);
    }

    [Fact]
    public async Task Actualizar_Exito_ActualizaCapacidadYNiveles()
    {
        var zona = TestData.ZonaActiva(9, "Oficinas");
        _zonas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(zona);
        _zonas.Setup(m => m.ActualizarAsync(zona, It.IsAny<CancellationToken>())).ReturnsAsync(zona);

        var resultado = await Servicio().ActualizarAsync(9, new ActualizarZonaRequest
        {
            Nombre = "Laboratorios",
            NivelSeguridad = "CRITICO",
            Capacidad = 15,
            NivelRiesgo = "CRITICO",
        });

        Assert.True(resultado.Exitoso);
        Assert.Equal("Laboratorios", zona.Nombre);
        Assert.Equal(15, zona.Capacidad);
        Assert.Equal("CRITICO", zona.NivelSeguridad);
        Assert.Equal("CRITICO", zona.NivelRiesgo);
    }

    [Fact]
    public async Task CambiarEstado_ZonaNoExiste_DevuelveNoEncontrado()
    {
        _zonas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync((ZonaAcceso?)null);

        var resultado = await Servicio().CambiarEstadoAsync(9, new CambiarEstadoRequest { Estado = "inactivo" });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.NoEncontrado, resultado.CodigoError);
    }

    [Theory]
    [InlineData("cerrada")]
    [InlineData("")]
    public async Task CambiarEstado_EstadoInvalido_DevuelveValidacion(string estado)
    {
        _zonas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(TestData.ZonaActiva(9));

        var resultado = await Servicio().CambiarEstadoAsync(9, new CambiarEstadoRequest { Estado = estado });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
    }

    [Fact]
    public async Task CambiarEstado_Exito_AplicaElEstado()
    {
        var zona = TestData.ZonaActiva(9);
        _zonas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(zona);
        _zonas.Setup(m => m.ActualizarAsync(zona, It.IsAny<CancellationToken>())).ReturnsAsync(zona);

        var resultado = await Servicio().CambiarEstadoAsync(9, new CambiarEstadoRequest { Estado = "inactivo" });

        Assert.True(resultado.Exitoso);
        Assert.Equal("inactivo", zona.Estado);
        Assert.Equal("inactivo", resultado.Dato!.Estado);
    }
}