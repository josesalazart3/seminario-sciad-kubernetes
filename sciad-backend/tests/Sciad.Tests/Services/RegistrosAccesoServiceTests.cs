using Microsoft.Extensions.Logging;
using Moq;
using Sciad.Application.Dtos.RegistrosAcceso;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;
using Sciad.Domain.Entities;
using Sciad.Tests.Support;

namespace Sciad.Tests.Services;

/// <summary>
/// Pruebas unitarias del núcleo de control de acceso (Fase 2C — CU-04/CU-05).
/// Cubren cada rama de <see cref="RegistrosAccesoService.RegistrarAccesoAsync"/>:
/// token inexistente, credencial revocada/vencida (con notificación de reuso),
/// persona inactiva, zona inexistente/inactiva, sin perfil, perfil fuera de vigencia
/// (con notificación fuera_horario), inferencia ingreso/egreso, doble ingreso por
/// condición de carrera (409) y persistencia exitosa. Más los reportes del día y el
/// historial (CU-06) con su saneamiento de paginación.
///
/// La BD se aísla con mocks de los repositorios: aquí se prueba la lógica de negocio,
/// no EF Core (eso ya lo cubren los verify-*.mjs contra PostgreSQL real).
/// </summary>
public sealed class RegistrosAccesoServiceTests
{
    private const int UsuarioOperador = 42;

    // Mocks bajo prueba. xUnit crea una instancia de la clase por test → estado limpio siempre.
    private readonly Mock<ICredencialRepository> _credenciales = new();
    private readonly Mock<IZonaRepository> _zonas = new();
    private readonly Mock<IPerfilAccesoRepository> _perfiles = new();
    private readonly Mock<IRegistroAccesoRepository> _registros = new();
    private readonly Mock<IUsuarioRepository> _usuarios = new();

    private RegistrosAccesoService Servicio() =>
        new(_credenciales.Object, _zonas.Object, _perfiles.Object, _registros.Object, _usuarios.Object, TestData.CifradoQr, TestData.LoggerNulo<RegistrosAccesoService>());

    /// <summary>QR (sobre cifrado) con que se escanea en cada prueba; por defecto, el de una credencial que no existe.</summary>
    private string _sobre = TestData.Sobre(TestData.CredencialActiva(999, 999));

    /// <summary>Configura la credencial que devuelve el repositorio (búsqueda por id) y el QR con que se escanea.</summary>
    private void ConCredencial(CredencialQr? c)
    {
        _credenciales.Setup(m => m.FindByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>())).ReturnsAsync(c);
        if (c is not null) _sobre = TestData.Sobre(c);
    }

    // ========== 1) Rama: token inexistente ==========
    [Fact]
    public async Task Registrar_TokenInexistente_DevuelveTokenInvalido()
    {
        ConCredencial((CredencialQr?)null);

        var resultado = await Servicio().RegistrarAccesoAsync(Request(_sobre, 1), UsuarioOperador);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.TokenInvalido, resultado.CodigoError);
    }

    // ========== 1b) Sobre del QR inválido: misma respuesta que un token inexistente, sin consultar la BD ==========
    public static TheoryData<string> SobresInvalidos()
    {
        var valido = TestData.Sobre(TestData.CredencialActiva(3, 7));
        var otraClave = new CifradoQr(Convert.ToBase64String(new byte[32])).Cifrar(3, TestData.TokenHex("activa-3"));
        return new TheoryData<string>
        {
            TestData.TokenHex("activa-3"),              // formato antiguo: 64 hex
            valido[..^1],                               // truncado
            valido.Replace("SCIAD1.", "SCIAD2."),       // otra versión
            otraClave,                                  // cifrado con otra clave
            valido[..20] + (valido[20] == 'A' ? 'B' : 'A') + valido[21..], // alterado
        };
    }

    [Theory]
    [MemberData(nameof(SobresInvalidos))]
    public async Task Registrar_SobreInvalido_DevuelveTokenInvalido_SinConsultarLaBd(string sobre)
    {
        var resultado = await Servicio().RegistrarAccesoAsync(Request(sobre, 1), UsuarioOperador);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.TokenInvalido, resultado.CodigoError);
        Assert.Equal("El token de la credencial QR no es válido.", resultado.Mensaje);
        _credenciales.Verify(m => m.FindByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Registrar_SobreValidoConTokenDistintoAlDeLaBd_DevuelveTokenInvalido()
    {
        var enBd = TestData.CredencialActiva(3, 7);
        var sobreAjeno = TestData.CifradoQr.Cifrar(3, TestData.TokenHex("otro-token")); // mismo id, token distinto
        _credenciales.Setup(m => m.FindByIdAsync(3, It.IsAny<CancellationToken>())).ReturnsAsync(enBd);

        var resultado = await Servicio().RegistrarAccesoAsync(Request(sobreAjeno, 1), UsuarioOperador);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.TokenInvalido, resultado.CodigoError);
        Assert.Equal("El token de la credencial QR no es válido.", resultado.Mensaje);
    }

    // ========== 2) Rama: credencial revocada/vencida → notificación de reuso ==========
    [Theory]
    [InlineData("revocada")]
    [InlineData("vencida")]
    public async Task Registrar_CredencialNoActiva_DevuelveCredencialRevocada_Y_NotificaTokenRevocado(string estado)
    {
        var persona = TestData.PersonaActiva(7);
        ConCredencial(TestData.CredencialEnEstado(estado, id: 3, personaId: 7, persona: persona));
        _usuarios.Setup(m => m.ObtenerActivoPorRolAsync("GERENCIA", It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestData.UsuarioGerencia(1));

        Notificacion? notificacion = null;
        _registros.Setup(m => m.AgregarNotificacionAsync(It.IsAny<Notificacion>(), It.IsAny<CancellationToken>()))
            .Callback<Notificacion, CancellationToken>((n, _) => notificacion = n)
            .Returns(Task.CompletedTask);

        var resultado = await Servicio().RegistrarAccesoAsync(Request(_sobre, 1), UsuarioOperador);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.CredencialRevocada, resultado.CodigoError);
        Assert.NotNull(notificacion);
        Assert.Equal("token_revocado", notificacion!.Tipo);
        Assert.Equal(7, notificacion.PersonaId);
        Assert.Equal(1, notificacion.UsuarioId); // dirigida a Gerencia
        Assert.False(notificacion.Leida);
        Assert.Contains(estado, notificacion.Mensaje, StringComparison.OrdinalIgnoreCase);
    }

    // ========== 3) Rama: persona inactiva (credencial válida) ==========
    [Fact]
    public async Task Registrar_PersonaInactiva_DevuelvePersonaInactiva_SinNotificacion()
    {
        ConCredencial(TestData.CredencialEnEstado("activa", id: 3, personaId: 9, persona: TestData.PersonaInactiva(9)));

        var resultado = await Servicio().RegistrarAccesoAsync(Request(_sobre, 1), UsuarioOperador);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.PersonaInactiva, resultado.CodigoError);
        _registros.Verify(m => m.AgregarNotificacionAsync(It.IsAny<Notificacion>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ========== 4) Rama: zona inexistente ==========
    [Fact]
    public async Task Registrar_ZonaNoExiste_DevuelveZonaNoAutorizada()
    {
        ConCredencial(TestData.CredencialActiva(3, 7));
        _zonas.Setup(m => m.FindByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ZonaAcceso?)null);

        var resultado = await Servicio().RegistrarAccesoAsync(Request(_sobre, 1), UsuarioOperador);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.ZonaNoAutorizada, resultado.CodigoError);
    }

    // ========== 5) Rama: zona inactiva ==========
    [Fact]
    public async Task Registrar_ZonaInactiva_DevuelveZonaNoAutorizada()
    {
        ConCredencial(TestData.CredencialActiva(3, 7));
        _zonas.Setup(m => m.FindByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestData.ZonaInactiva(1));

        var resultado = await Servicio().RegistrarAccesoAsync(Request(_sobre, 1), UsuarioOperador);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.ZonaNoAutorizada, resultado.CodigoError);
    }

    // ========== 6) Rama: sin perfil para la zona → zona no autorizada (sin notificación) ==========
    [Fact]
    public async Task Registrar_SinPerfilParaZona_DevuelveZonaNoAutorizada_SinNotificacion()
    {
        ConCredencial(TestData.CredencialActiva(3, 7));
        _zonas.Setup(m => m.FindByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestData.ZonaActiva(1));
        _perfiles.Setup(m => m.ListarAsync(7, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<PerfilAcceso>());

        var resultado = await Servicio().RegistrarAccesoAsync(Request(_sobre, 1), UsuarioOperador);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.ZonaNoAutorizada, resultado.CodigoError);
        _registros.Verify(m => m.AgregarNotificacionAsync(It.IsAny<Notificacion>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ========== 7) Rama: perfil existente pero fuera de vigencia → notificación fuera_horario ==========
    [Theory]
    [InlineData("VENCIDO")]
    [InlineData("futuro")]
    public async Task Registrar_PerfilFueraDeVigencia_DevuelveFueraVigencia_Y_NotificaFueraHorario(string caso)
    {
        ConCredencial(TestData.CredencialActiva(3, 7));
        _zonas.Setup(m => m.FindByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestData.ZonaActiva(1));
        var perfil = caso == "VENCIDO"
            ? TestData.PerfilVencido(10, 7, 1)
            : TestData.PerfilFuturo(10, 7, 1);
        _perfiles.Setup(m => m.ListarAsync(7, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<PerfilAcceso> { perfil });
        _usuarios.Setup(m => m.ObtenerActivoPorRolAsync("GERENCIA", It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestData.UsuarioGerencia(1));

        Notificacion? notificacion = null;
        _registros.Setup(m => m.AgregarNotificacionAsync(It.IsAny<Notificacion>(), It.IsAny<CancellationToken>()))
            .Callback<Notificacion, CancellationToken>((n, _) => notificacion = n)
            .Returns(Task.CompletedTask);

        var resultado = await Servicio().RegistrarAccesoAsync(Request(_sobre, 1), UsuarioOperador);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.FueraVigencia, resultado.CodigoError);
        Assert.NotNull(notificacion);
        Assert.Equal("fuera_horario", notificacion!.Tipo);
        Assert.Equal(7, notificacion.PersonaId);
    }

    // ========== 8) Rama: perfil mixto (uno vigente entre varios vencidos) → fluye ==========
    [Fact]
    public async Task Registrar_ConUnPerfilVigenteEntreVarios_Fluye()
    {
        ConCredencial(TestData.CredencialActiva(3, 7));
        _zonas.Setup(m => m.FindByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestData.ZonaActiva(1));
        _perfiles.Setup(m => m.ListarAsync(7, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<PerfilAcceso>
            {
                TestData.PerfilVencido(10, 7, 1),
                TestData.PerfilVigente(11, 7, 1),
            });
        _registros.Setup(m => m.ContarMovimientosAsync(7, 1, It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((0, 0));
        _registros.Setup(m => m.RegistrarConTransaccionAsync(It.IsAny<RegistroAcceso>(), It.IsAny<Notificacion?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((RegistroAcceso r, Notificacion? _, CancellationToken _) => { r.Id = 1; return r; });

        var resultado = await Servicio().RegistrarAccesoAsync(Request(_sobre, 1), UsuarioOperador);

        Assert.True(resultado.Exitoso);
        Assert.Equal("ingreso", resultado.Dato!.Tipo);
    }

    // ========== 9) Rama: inferencia — sin movimientos hoy → ingreso ==========
    [Fact]
    public async Task Registrar_SinMovimientosHoy_InfringeIngreso()
    {
        var (resultado, registro) = await EjecutarAccesoExitoso(ingresos: 0, egresos: 0);

        Assert.True(resultado.Exitoso);
        Assert.Equal("ingreso", resultado.Dato!.Tipo);
        Assert.Equal("ingreso", registro!.Tipo);
    }

    // ========== 10) Rama: inferencia — ingreso abierto hoy (ingresos > egresos) → egreso ==========
    [Theory]
    [InlineData(1, 0)] // un ingreso sin egreso → egreso
    [InlineData(2, 1)] // tiene un egreso pero queda un ingreso abierto → egreso
    public async Task Registrar_ConIngresoAbierto_InfringeEgreso(int ingresos, int egresos)
    {
        var (resultado, registro) = await EjecutarAccesoExitoso(ingresos, egresos);

        Assert.True(resultado.Exitoso);
        Assert.Equal("egreso", resultado.Dato!.Tipo);
        Assert.Equal("egreso", registro!.Tipo);
    }

    private async Task<(ServicioResultado<RegistroAccesoResultadoDto> Resultado, RegistroAcceso? Registro)> EjecutarAccesoExitoso(int ingresos, int egresos)
    {
        ConCredencial(TestData.CredencialActiva(3, 7, persona: TestData.PersonaActiva(7, "Ana López")));
        _zonas.Setup(m => m.FindByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestData.ZonaActiva(1, "Oficinas"));
        _perfiles.Setup(m => m.ListarAsync(7, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<PerfilAcceso> { TestData.PerfilVigente(10, 7, 1) });
        _registros.Setup(m => m.ContarMovimientosAsync(7, 1, It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ingresos, egresos));

        RegistroAcceso? pasado = null;
        _registros.Setup(m => m.RegistrarConTransaccionAsync(It.IsAny<RegistroAcceso>(), It.IsAny<Notificacion?>(), It.IsAny<CancellationToken>()))
            .Callback<RegistroAcceso, Notificacion?, CancellationToken>((r, _, _) => { r.Id = 99; pasado = r; })
            .ReturnsAsync((RegistroAcceso r, Notificacion? _, CancellationToken _) => r);

        var resultado = await Servicio().RegistrarAccesoAsync(Request(_sobre, 1), UsuarioOperador);
        return (resultado, pasado);
    }

    // ========== 11) Rama: doble ingreso por condición de carrera → 409 CONFLICTO ==========
    [Fact]
    public async Task Registrar_DobleIngresoPorCarrera_DevuelveConflicto()
    {
        ConCredencial(TestData.CredencialActiva(3, 7));
        _zonas.Setup(m => m.FindByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestData.ZonaActiva(1));
        _perfiles.Setup(m => m.ListarAsync(7, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<PerfilAcceso> { TestData.PerfilVigente(10, 7, 1) });
        _registros.Setup(m => m.ContarMovimientosAsync(7, 1, It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((1, 0));
        _registros.Setup(m => m.RegistrarConTransaccionAsync(It.IsAny<RegistroAcceso>(), It.IsAny<Notificacion?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((RegistroAcceso?)null); // UNIQUE uq_ingreso_diario → 409

        var resultado = await Servicio().RegistrarAccesoAsync(Request(_sobre, 1), UsuarioOperador);

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Conflicto, resultado.CodigoError);
    }

    // ========== 12) Rama: éxito — el registro persistido lleva los campos de negocio correctos ==========
    [Fact]
    public async Task Registrar_Exito_PersisteRegistroConCamposCorrectos_Y_DevuelveDto()
    {
        var (resultado, registro) = await EjecutarAccesoExitoso(0, 0);
        var hoy = DateOnly.FromDateTime(GuatemalaTime.Now);

        Assert.True(resultado.Exitoso);
        Assert.NotNull(registro);
        Assert.Equal(7, registro!.PersonaId);
        Assert.Equal(1, registro.ZonaId);
        Assert.Equal(hoy, registro.Fecha);
        Assert.Equal(UsuarioOperador, registro.UsuarioId);

        var dto = resultado.Dato!;
        Assert.Equal("99", dto.Id);
        Assert.Equal(7, dto.PersonaId);
        Assert.Equal("Ana López", dto.PersonaNombre);
        Assert.Equal(1, dto.ZonaId);
        Assert.Equal("Oficinas", dto.ZonaNombre);
        Assert.Equal("ingreso", dto.Tipo);
        Assert.Equal(hoy, dto.Fecha);
        Assert.Equal("autorizado", dto.Estado);
        Assert.NotEqual(default, dto.Hora);
    }

    // ========== 13) Accesos del día (CU-05): agrupación e inferencia de "Dentro" ==========
    [Fact]
    public async Task ListarDelDia_AgrupaPorPersonaYZona_Y_InfiereDentro()
    {
        var hoy = DateOnly.FromDateTime(GuatemalaTime.Now);
        var persona1 = TestData.PersonaActiva(1, "Ana López");
        var persona2 = TestData.PersonaActiva(2, "Bruno Ruiz");
        var zona1 = TestData.ZonaActiva(1, "Oficinas");
        var zona2 = TestData.ZonaActiva(2, "Laboratorio");

        // persona1/zona1: ingreso 08:00 → egreso 09:00 → ingreso 10:00 (dentro)
        // persona2/zona2: egreso 11:00 (fuera, sin ingreso del día en la muestra)
        _registros.Setup(m => m.ListarDelDiaAsync(It.IsAny<int?>(), hoy, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>
            {
                TestData.Registro(1, 1, "ingreso", hoy, new TimeOnly(8, 0), persona1, zona1),
                TestData.Registro(1, 1, "egreso", hoy, new TimeOnly(9, 0), persona1, zona1),
                TestData.Registro(1, 1, "ingreso", hoy, new TimeOnly(10, 0), persona1, zona1),
                TestData.Registro(2, 2, "egreso", hoy, new TimeOnly(11, 0), persona2, zona2),
            });

        var resultado = await Servicio().ListarDelDiaAsync(null);

        Assert.True(resultado.Exitoso);
        var filas = resultado.Dato!;
        Assert.Equal(2, filas.Count);

        var fila1 = filas[0]; // ordenado por persona nombre
        Assert.Equal(1, fila1.PersonaId);
        Assert.Equal("Ana López", fila1.PersonaNombre);
        Assert.Equal("ingreso", fila1.UltimoTipo);
        Assert.Equal(new TimeOnly(10, 0), fila1.UltimaHora);
        Assert.True(fila1.Dentro); // 2 ingresos > 1 egreso

        var fila2 = filas[1];
        Assert.Equal(2, fila2.PersonaId);
        Assert.Equal("Bruno Ruiz", fila2.PersonaNombre);
        Assert.Equal("egreso", fila2.UltimoTipo);
        Assert.False(fila2.Dentro);
    }

    [Fact]
    public async Task ListarDelDia_PropagaElFiltroDeZona()
    {
        var hoy = DateOnly.FromDateTime(GuatemalaTime.Now);
        _registros.Setup(m => m.ListarDelDiaAsync(It.IsAny<int?>(), hoy, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>());

        var resultado = await Servicio().ListarDelDiaAsync(zonaId: 5);

        Assert.True(resultado.Exitoso);
        _registros.Verify(m => m.ListarDelDiaAsync(5, hoy, It.IsAny<CancellationToken>()), Times.Once);
    }

    // ========== 14) Historial (CU-06): saneamiento de paginación y validaciones ==========
    [Fact]
    public async Task Historial_PaginaCero_SaneaAUno()
    {
        _registros.Setup(m => m.ListarHistorialAsync(It.IsAny<int?>(), It.IsAny<int?>(), It.IsAny<DateOnly?>(), It.IsAny<DateOnly?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<RegistroAcceso>(), 0));

        var resultado = await Servicio().ListarHistorialAsync(CrearRequest(pagina: 0, tamano: 20));

        Assert.True(resultado.Exitoso);
        _registros.Verify(m => m.ListarHistorialAsync(It.IsAny<int?>(), It.IsAny<int?>(), It.IsAny<DateOnly?>(), It.IsAny<DateOnly?>(), It.IsAny<string?>(), 1, It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(101)]
    public async Task Historial_TamanoPaginaInvalido_SaneaAVeinte(int tamano)
    {
        _registros.Setup(m => m.ListarHistorialAsync(It.IsAny<int?>(), It.IsAny<int?>(), It.IsAny<DateOnly?>(), It.IsAny<DateOnly?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<RegistroAcceso>(), 0));

        var resultado = await Servicio().ListarHistorialAsync(CrearRequest(pagina: 1, tamano: tamano));

        Assert.True(resultado.Exitoso);
        _registros.Verify(m => m.ListarHistorialAsync(It.IsAny<int?>(), It.IsAny<int?>(), It.IsAny<DateOnly?>(), It.IsAny<DateOnly?>(), It.IsAny<string?>(), It.IsAny<int>(), 20, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Historial_DesdePosteriorAHasta_DevuelveValidacion()
    {
        var desde = DateOnly.FromDateTime(GuatemalaTime.Now);
        var resultado = await Servicio().ListarHistorialAsync(
            new HistorialAccesosRequest(null, null, desde, desde.AddDays(-1), null, 1, 20));

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
    }

    [Theory]
    [InlineData("salida")]
    [InlineData("INGRESOS")]
    public async Task Historial_TipoInvalido_DevuelveValidacion(string tipo)
    {
        var resultado = await Servicio().ListarHistorialAsync(
            new HistorialAccesosRequest(null, null, null, null, tipo, 1, 20));

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
    }

    [Fact]
    public async Task Historial_Exito_CalculaTotalPaginas()
    {
        var items = new List<RegistroAcceso> { TestData.Registro(1, 1, "ingreso"), TestData.Registro(2, 1, "egreso"), TestData.Registro(3, 1, "ingreso") };
        _registros.Setup(m => m.ListarHistorialAsync(It.IsAny<int?>(), It.IsAny<int?>(), It.IsAny<DateOnly?>(), It.IsAny<DateOnly?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((items, 7));

        var resultado = await Servicio().ListarHistorialAsync(CrearRequest(pagina: 2, tamano: 3));

        Assert.True(resultado.Exitoso);
        Assert.Equal(3, resultado.Dato!.TotalPaginas); // ceil(7/3)
        Assert.Equal(2, resultado.Dato.Pagina);
        Assert.Equal(3, resultado.Dato.TamanoPagina);
        Assert.Equal(3, resultado.Dato.Items.Count);
    }

    private static RegistrarAccesoRequest Request(string token, int zonaId) => new() { Token = token, ZonaId = zonaId };
    private static HistorialAccesosRequest CrearRequest(int pagina, int tamano)
        => new(null, null, null, null, null, pagina, tamano);
}