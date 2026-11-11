using Moq;
using Sciad.Application.Dtos.PerfilesAcceso;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;
using Sciad.Domain.Entities;
using Sciad.Tests.Support;

namespace Sciad.Tests.Services;

/// <summary>
/// Perfiles de acceso (CU-02): reglas de asignación zona-persona. Cada condición de bloqueo se
/// prueba de forma aislada — vigencia invertida, persona/zona inexistentes, persona/zona inactivas —
/// y el flujo feliz persiste la asignación con la vigencia correcta. La baja es DELETE físico
/// (decisión anotada en bitácora 2B): perfil inexistente → NoEncontrado, si existe → eliminado.
/// </summary>
public sealed class PerfilesAccesoServiceTests
{
    private readonly Mock<IPerfilAccesoRepository> _perfiles = new();
    private readonly Mock<IPersonaRepository> _personas = new();
    private readonly Mock<IZonaRepository> _zonas = new();

    private PerfilesAccesoService Servicio() =>
        new(_perfiles.Object, _personas.Object, _zonas.Object, TestData.LoggerNulo<PerfilesAccesoService>());

    // ========== Listar ==========
    [Fact]
    public async Task Listar_PasaFiltrosYDevuelveMapeados()
    {
        var perfil = PerfilAccesoConNavegacion();
        _perfiles.Setup(m => m.ListarAsync(2, 3, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<PerfilAcceso> { perfil });

        var resultado = await Servicio().ListarAsync(2, 3);

        Assert.True(resultado.Exitoso);
        var dto = resultado.Dato!.Single();
        Assert.Equal(perfil.Id.ToString(), dto.Id);
        Assert.Equal(TestData.PersonaActiva(2).Nombre, dto.PersonaNombre);
        Assert.Equal("Oficinas", dto.ZonaNombre);
        Assert.Equal(perfil.VigenciaInicio, dto.VigenciaInicio);
        Assert.Equal(perfil.VigenciaFin, dto.VigenciaFin);
    }

    // ========== Crear ==========
    [Fact]
    public async Task Crear_VigenciaFinAnteriorAInicio_DevuelveValidacion()
    {
        var req = new CrearPerfilAccesoRequest
        {
            PersonaId = 1,
            ZonaId = 1,
            VigenciaInicio = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(+10)),
            VigenciaFin = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(+5)),
        };

        var resultado = await Servicio().CrearAsync(req);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
        // Ninguna consulta adicional se ejecuta: la validación corta antes.
        _personas.Verify(m => m.FindByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
        _zonas.Verify(m => m.FindByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Crear_PersonaNoExiste_DevuelveNoEncontrado()
    {
        _personas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync((Persona?)null);

        var resultado = await Servicio().CrearAsync(ReqBasico(personaId: 9));

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.NoEncontrado, resultado.CodigoError);
    }

    [Fact]
    public async Task Crear_PersonaInactiva_DevuelveValidacion()
    {
        _personas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(TestData.PersonaInactiva(9));

        var resultado = await Servicio().CrearAsync(ReqBasico(personaId: 9));

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
        _zonas.Verify(m => m.FindByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Crear_PersonaActivaZonaNoExiste_DevuelveNoEncontrado()
    {
        _personas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(TestData.PersonaActiva(9));
        _zonas.Setup(m => m.FindByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync((ZonaAcceso?)null);

        var resultado = await Servicio().CrearAsync(ReqBasico(personaId: 9, zonaId: 7));

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.NoEncontrado, resultado.CodigoError);
    }

    [Fact]
    public async Task Crear_ZonaInactiva_DevuelveValidacion()
    {
        _personas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(TestData.PersonaActiva(9));
        _zonas.Setup(m => m.FindByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(TestData.ZonaInactiva(7));

        var resultado = await Servicio().CrearAsync(ReqBasico(personaId: 9, zonaId: 7));

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
    }

    [Fact]
    public async Task Crear_Exito_PersisteAsignacionConVigencia()
    {
        _personas.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(TestData.PersonaActiva(9, "Ana López"));
        _zonas.Setup(m => m.FindByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(TestData.ZonaActiva(7, "Oficinas"));
        var inicio = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(-1));
        var fin = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(+20));
        _perfiles.Setup(m => m.AgregarAsync(It.IsAny<PerfilAcceso>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PerfilAcceso p, CancellationToken _) => { p.Id = 4; p.Persona = TestData.PersonaActiva(9, "Ana López"); p.Zona = TestData.ZonaActiva(7, "Oficinas"); return p; });

        var resultado = await Servicio().CrearAsync(new CrearPerfilAccesoRequest
        {
            PersonaId = 9,
            ZonaId = 7,
            VigenciaInicio = inicio,
            VigenciaFin = fin,
        });

        Assert.True(resultado.Exitoso);
        _perfiles.Verify(m => m.AgregarAsync(It.Is<PerfilAcceso>(p =>
            p.PersonaId == 9 && p.ZonaId == 7 && p.VigenciaInicio == inicio && p.VigenciaFin == fin),
            It.IsAny<CancellationToken>()), Times.Once);
        var dto = resultado.Dato!;
        Assert.Equal("4", dto.Id);
        Assert.Equal("Ana López", dto.PersonaNombre);
        Assert.Equal("Oficinas", dto.ZonaNombre);
    }

    // ========== Eliminar (DELETE físico) ==========
    [Fact]
    public async Task Eliminar_NoExiste_DevuelveNoEncontrado()
    {
        _perfiles.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync((PerfilAcceso?)null);

        var resultado = await Servicio().EliminarAsync(9);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.NoEncontrado, resultado.CodigoError);
    }

    [Fact]
    public async Task Eliminar_Existe_EliminaYDevuelveVerdadero()
    {
        var perfil = new PerfilAcceso { Id = 9, PersonaId = 1, ZonaId = 1 };
        _perfiles.Setup(m => m.FindByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(perfil);

        var resultado = await Servicio().EliminarAsync(9);

        Assert.True(resultado.Exitoso);
        Assert.True(resultado.Dato);
        _perfiles.Verify(m => m.EliminarAsync(perfil, It.IsAny<CancellationToken>()), Times.Once);
    }

    // ========== helpers ==========
    private static CrearPerfilAccesoRequest ReqBasico(int personaId = 1, int zonaId = 1, int dias = 30) => new()
    {
        PersonaId = personaId,
        ZonaId = zonaId,
        VigenciaInicio = DateOnly.FromDateTime(GuatemalaTime.Now),
        VigenciaFin = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(dias)),
    };

    private static PerfilAcceso PerfilAccesoConNavegacion() => new()
    {
        Id = 12,
        PersonaId = 2,
        Persona = TestData.PersonaActiva(2),
        ZonaId = 3,
        Zona = TestData.ZonaActiva(3, "Oficinas"),
        VigenciaInicio = DateOnly.FromDateTime(GuatemalaTime.Now),
        VigenciaFin = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(30)),
    };
}