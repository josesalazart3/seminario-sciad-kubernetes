using Moq;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Personas;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;
using Sciad.Domain.Entities;
using Sciad.Tests.Support;

namespace Sciad.Tests.Services;

/// <summary>
/// CRUD administrativo de personas: validación de filtros en el listado (tipo/estado),
/// unicidad de DPI al crear/actualizar, baja lógica por estado y persistencia de campos.
/// </summary>
public sealed class PersonasServiceTests
{
    private readonly Mock<IPersonaRepository> _personas = new();

    private PersonasService Servicio() => new(_personas.Object, TestData.LoggerNulo<PersonasService>());

    // ========== Listar ==========
    [Theory]
    [InlineData(0)]
    [InlineData(3)]
    [InlineData(-1)]
    public async Task Listar_TipoInvalido_DevuelveValidacion(int tipo)
    {
        var resultado = await Servicio().ListarAsync(tipo, estado: null, pagina: 1, tamanoPagina: 20);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
        _personas.Verify(m => m.ListarPaginadoAsync(It.IsAny<int?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData("ACTIVO")]     // patrón case-sensitive contra el valor crudo → inválido
    [InlineData("activos")]
    [InlineData("baja")]
    public async Task Listar_EstadoInvalido_DevuelveValidacion(string estado)
    {
        var resultado = await Servicio().ListarAsync(tipo: null, estado, pagina: 1, tamanoPagina: 20);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
        // La validación corta antes de tocar el repositorio.
        _personas.Verify(m => m.ListarPaginadoAsync(It.IsAny<int?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Listar_Exito_DevuelvePaginadoMapeado()
    {
        _personas.Setup(m => m.ListarPaginadoAsync(1, "activo", 2, 15, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Persona> { TestData.PersonaActiva(1), TestData.PersonaActiva(2) }, 2));

        var resultado = await Servicio().ListarAsync(tipo: 1, estado: "activo", pagina: 2, tamanoPagina: 15);

        Assert.True(resultado.Exitoso);
        var paginado = resultado.Dato!;
        Assert.Equal(2, paginado.Items.Count);
        Assert.Equal(2, paginado.Total);
        Assert.Equal(2, paginado.Pagina);
        Assert.Equal(15, paginado.TamanoPagina);
        Assert.Equal(1, paginado.TotalPaginas);
        Assert.Equal("1", paginado.Items[0].Id);
    }

    [Fact]
    public async Task Listar_TotalCero_DevuelveCeroPaginas()
    {
        _personas.Setup(m => m.ListarPaginadoAsync(null, null, 1, 20, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Persona>(), 0));

        var resultado = await Servicio().ListarAsync(tipo: null, estado: null, pagina: 1, tamanoPagina: 20);

        Assert.True(resultado.Exitoso);
        Assert.Equal(0, resultado.Dato!.TotalPaginas);
    }

    [Fact]
    public async Task Listar_EstadoEnBlanco_SeTrataComoSinFiltro()
    {
        // Estado vacío/especificado con espacios NO se valida como error: se normaliza a null
        // (sin filtro) y se consulta. El patrón de estado es case-sensitive contra el valor crudo,
        // así que el recorte/lower solo aplica una vez que "activo"/"inactivo" pasaron el patrón.
        _personas.Setup(m => m.ListarPaginadoAsync(null, null, 1, 20, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Persona>(), 0));

        var resultado = await Servicio().ListarAsync(tipo: null, estado: "   ", pagina: 1, tamanoPagina: 20);

        Assert.True(resultado.Exitoso);
        _personas.Verify(m => m.ListarPaginadoAsync(null, null, 1, 20, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Listar_EstadoActivoComoFiltro_SeConsultaConEstado()
    {
        _personas.Setup(m => m.ListarPaginadoAsync(null, "activo", 1, 20, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Persona>(), 0));

        await Servicio().ListarAsync(tipo: null, estado: "activo", pagina: 1, tamanoPagina: 20);

        // El filtro válido se propaga tal cual al repositorio.
        _personas.Verify(m => m.ListarPaginadoAsync(null, "activo", 1, 20, It.IsAny<CancellationToken>()), Times.Once);
    }

    // ========== Crear ==========
    [Fact]
    public async Task Crear_DpiDuplicado_DevuelveConflicto()
    {
        _personas.Setup(m => m.ExisteDpiAsync("1234567890123", null, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var resultado = await Servicio().CrearAsync(new CrearPersonaRequest { Nombre = "Ana", DpiCodigo = "1234567890123", Tipo = 1 });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Conflicto, resultado.CodigoError);
    }

    [Fact]
    public async Task Crear_Exito_DevuelveConEstadoActivoYCamposRecortados()
    {
        _personas.Setup(m => m.ExisteDpiAsync("1234567890123", null, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _personas.Setup(m => m.AgregarAsync(It.IsAny<Persona>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Persona p, CancellationToken _) => { p.Id = 42; return p; });

        var resultado = await Servicio().CrearAsync(new CrearPersonaRequest { Nombre = "  Ana López  ", DpiCodigo = " 1234567890123 ", Tipo = 1 });

        Assert.True(resultado.Exitoso);
        var dto = resultado.Dato!;
        Assert.Equal("42", dto.Id);
        Assert.Equal("Ana López", dto.Nombre);
        Assert.Equal("1234567890123", dto.DpiCodigo);
        Assert.Equal("activo", dto.Estado);
        Assert.Equal(1, dto.Tipo);
    }

    // ========== Actualizar ==========
    [Fact]
    public async Task Actualizar_PersonaNoExiste_DevuelveNoEncontrado()
    {
        _personas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync((Persona?)null);

        var resultado = await Servicio().ActualizarAsync(9, new ActualizarPersonaRequest());

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.NoEncontrado, resultado.CodigoError);
    }

    [Fact]
    public async Task Actualizar_DpiDeOtraPersona_DevuelveConflicto()
    {
        var existente = TestData.PersonaActiva(9, "Antes");
        _personas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(existente);
        // El DPI pertenece a otra persona (id != 9): se rechaza.
        _personas.Setup(m => m.ExisteDpiAsync("2412348820101", 9, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var resultado = await Servicio().ActualizarAsync(9, new ActualizarPersonaRequest { Nombre = "Después", DpiCodigo = "2412348820101", Tipo = 2 });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Conflicto, resultado.CodigoError);
    }

    [Fact]
    public async Task Actualizar_DpiDelMismoIdExcluido_DevuelveExito()
    {
        var existente = TestData.PersonaActiva(9, "Ana López");
        _personas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(existente);
        // El mismo DPI con excluirId=9: no conflictivo.
        _personas.Setup(m => m.ExisteDpiAsync(existente.DpiCodigo, 9, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _personas.Setup(m => m.ActualizarAsync(existente, It.IsAny<CancellationToken>())).ReturnsAsync(existente);

        var resultado = await Servicio().ActualizarAsync(9, new ActualizarPersonaRequest { Nombre = "Ana López", DpiCodigo = existente.DpiCodigo, Tipo = 1 });

        Assert.True(resultado.Exitoso);
        Assert.Equal(existente.Nombre, resultado.Dato!.Nombre);
    }

    // ========== CambiarEstado (baja lógica) ==========
    [Fact]
    public async Task CambiarEstado_PersonaNoExiste_DevuelveNoEncontrado()
    {
        _personas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync((Persona?)null);

        var resultado = await Servicio().CambiarEstadoAsync(9, new CambiarEstadoRequest { Estado = "inactivo" });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.NoEncontrado, resultado.CodigoError);
    }

    [Theory]
    [InlineData("")]
    [InlineData("suspendido")]
    [InlineData("eliminado")]
    [InlineData("ACTIVADO")]
    public async Task CambiarEstado_EstadoInvalido_DevuelveValidacion(string estado)
    {
        _personas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(TestData.PersonaActiva(9));

        var resultado = await Servicio().CambiarEstadoAsync(9, new CambiarEstadoRequest { Estado = estado });

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
    }

    [Theory]
    [InlineData("inactivo")]
    [InlineData("activo")]
    public async Task CambiarEstado_Valido_AplicaElNuevoEstado(string estado)
    {
        var existente = TestData.PersonaActiva(9);
        _personas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(existente);
        _personas.Setup(m => m.ActualizarAsync(existente, It.IsAny<CancellationToken>())).ReturnsAsync(existente);

        var resultado = await Servicio().CambiarEstadoAsync(9, new CambiarEstadoRequest { Estado = estado });

        Assert.True(resultado.Exitoso);
        Assert.Equal(estado, existente.Estado);
        Assert.Equal(estado, resultado.Dato!.Estado);
    }
}