using Moq;
using Sciad.Application.Dtos.Reportes;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;
using Sciad.Domain.Entities;
using Sciad.Tests.Support;

namespace Sciad.Tests.Services;

/// <summary>
/// Reportes de auditoría (CU-07): validación de filtros (rango de fechas invertido, tipo de evento
/// inválido), construcción del CSV con escape RFC 4180 (para nombres con comas/comillas), y
/// persistencia de los metadatos del reporte (periodo, total, quién lo generó).
/// </summary>
public sealed class ReportesServiceTests
{
    private readonly Mock<IRegistroAccesoRepository> _registros = new();
    private readonly Mock<IReporteRepository> _reportes = new();

    private ReportesService Servicio() =>
        new(_registros.Object, _reportes.Object, TestData.LoggerNulo<ReportesService>());

    // ========== Generar ==========
    [Fact]
    public async Task Generar_DesdePosteriorAHasta_DevuelveValidacion()
    {
        var req = new GenerarReporteRequest
        {
            Desde = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(+5)),
            Hasta = DateOnly.FromDateTime(GuatemalaTime.Now),
        };

        var resultado = await Servicio().GenerarAsync(req, usuarioId: 1);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
        _reportes.Verify(m => m.AgregarAsync(It.IsAny<Reporte>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData("salida")]
    [InlineData("ingreso Y egreso")]
    public async Task Generar_TipoEventoInvalido_DevuelveValidacion(string tipo)
    {
        var req = new GenerarReporteRequest
        {
            Desde = DateOnly.FromDateTime(GuatemalaTime.Now),
            Hasta = DateOnly.FromDateTime(GuatemalaTime.Now),
            TipoEvento = tipo,
        };

        var resultado = await Servicio().GenerarAsync(req, usuarioId: 1);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
    }

    [Fact]
    public async Task Generar_TipoEventoValidoConMayusculas_NoRechaza()
    {
        var req = new GenerarReporteRequest
        {
            Desde = DateOnly.FromDateTime(GuatemalaTime.Now),
            Hasta = DateOnly.FromDateTime(GuatemalaTime.Now),
            TipoEvento = "  INGRESO  ",
        };
        // El servicio valida el tipo normalizado pero pasa el valor crudo al repositorio.
        _registros.Setup(m => m.ListarParaReporteAsync(It.IsAny<int?>(), It.IsAny<int?>(), It.IsAny<DateOnly>(), It.IsAny<DateOnly>(), "  INGRESO  ", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>());
        _reportes.Setup(m => m.AgregarAsync(It.IsAny<Reporte>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Reporte r, CancellationToken _) => r);

        var resultado = await Servicio().GenerarAsync(req, usuarioId: 1);

        Assert.True(resultado.Exitoso);
    }

    [Fact]
    public async Task Generar_Exito_ConstruyeCsvConEncabezadosY_GuardaLosMetadatos()
    {
        var registro = new RegistroAcceso
        {
            Id = 1,
            PersonaId = 2,
            Persona = TestData.PersonaActiva(2, "Ana, López"), // nombre con coma → requiere escape
            ZonaId = 3,
            Zona = TestData.ZonaActiva(3, "Oficinas"),
            Fecha = new DateOnly(2026, 9, 8),
            Hora = new TimeOnly(8, 30),
            Tipo = "ingreso",
            UsuarioId = 4,
            Usuario = TestData.UsuarioRol("SEGURIDAD", 4),
        };
        _registros.Setup(m => m.ListarParaReporteAsync(2, 3, It.IsAny<DateOnly>(), It.IsAny<DateOnly>(), null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso> { registro });
        _reportes.Setup(m => m.AgregarAsync(It.IsAny<Reporte>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Reporte r, CancellationToken _) => r);

        var req = new GenerarReporteRequest
        {
            Desde = new DateOnly(2026, 9, 1),
            Hasta = new DateOnly(2026, 9, 30),
            PersonaId = 2,
            ZonaId = 3,
        };

        var resultado = await Servicio().GenerarAsync(req, usuarioId: 9);

        Assert.True(resultado.Exitoso);
        var csv = resultado.Dato!;

        // Encabezados + una fila de datos.
        var linea1 = csv.Split('\n')[0];
        Assert.Equal("Fecha,Hora,Persona,Zona,Tipo,RegistradoPor", linea1);

        // El nombre con coma se escapa entre comillas (RFC 4180).
        Assert.Contains("\"Ana, López\"", csv);
        Assert.Contains("2026-09-08,08:30", csv);
        Assert.Contains(",ingreso,", csv);

        // Los metadatos del reporte se guardan con período, total y quién lo generó.
        _reportes.Verify(m => m.AgregarAsync(It.Is<Reporte>(r =>
            r.Periodo == "2026-09-01 a 2026-09-30" &&
            r.TotalRegistros == 1 &&
            r.UsuarioId == 9), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Generar_NombresQueExigenEscapeDobleDeComillas()
    {
        var registro = new RegistroAcceso
        {
            Id = 1,
            PersonaId = 2,
            Persona = TestData.PersonaActiva(2, "Ana \"La Jefa\" López"),
            ZonaId = 3,
            Zona = TestData.ZonaActiva(3, "Oficinas"),
            Fecha = new DateOnly(2026, 9, 8),
            Hora = new TimeOnly(9, 0),
            Tipo = "egreso",
            UsuarioId = 4,
            Usuario = TestData.UsuarioRol("SEGURIDAD", 4),
        };
        _registros.Setup(m => m.ListarParaReporteAsync(null, null, It.IsAny<DateOnly>(), It.IsAny<DateOnly>(), null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso> { registro });
        _reportes.Setup(m => m.AgregarAsync(It.IsAny<Reporte>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Reporte r, CancellationToken _) => r);

        var resultado = await Servicio().GenerarAsync(new GenerarReporteRequest
        {
            Desde = new DateOnly(2026, 9, 1),
            Hasta = new DateOnly(2026, 9, 30),
        }, usuarioId: 1);

        Assert.True(resultado.Exitoso);
        Assert.Contains("\"Ana \"\"La Jefa\"\" López\"", resultado.Dato!);
    }

    // ========== Listar ==========
    [Fact]
    public async Task Listar_SaneaPaginacionYDevuelvePaginado()
    {
        _reportes.Setup(m => m.ListarPaginadoAsync(1, 20, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Reporte>
            {
                new Reporte
                {
                    Id = 5,
                    Periodo = "2026-08-01 a 2026-08-31",
                    TotalRegistros = 3,
                    Generado = new DateOnly(2026, 9, 1),
                    UsuarioId = 2,
                    Usuario = new Usuario { Nombre = "Gerente" },
                },
            }, 1));

        var resultado = await Servicio().ListarAsync(pagina: 0, tamanoPagina: 500);

        Assert.True(resultado.Exitoso);
        var dto = resultado.Dato!;
        Assert.Single(dto.Items);
        Assert.Equal("5", dto.Items[0].Id);
        Assert.Equal(3, dto.Items[0].TotalRegistros);
        Assert.Equal("Gerente", dto.Items[0].GeneradoPor);
        Assert.Equal(1, dto.Total);
        // La lista se saneó: página 0 → 1, tamaño 500 → 20.
        _reportes.Verify(m => m.ListarPaginadoAsync(1, 20, It.IsAny<CancellationToken>()), Times.Once);
    }
}