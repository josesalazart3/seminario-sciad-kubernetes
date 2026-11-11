using Moq;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;
using Sciad.Domain.Entities;
using Sciad.Tests.Support;

namespace Sciad.Tests.Services;

/// <summary>
/// Pruebas unitarias de la auditoría de integridad de bitácoras (CU-08, Fase 2D).
/// Cada criterio de <see cref="AuditoriaService.VerificarAsync"/> se prueba de forma
/// aislada con datos controlados: ingreso sin egreso de días anteriores, duplicados,
/// campos nulos/inconsistentes y concentración inusual por ventana rodante (umbral 10
/// en 30 minutos). También el saneamiento de paginación y el cambio de estado de un
/// hallazgo. La BD se aísla con mocks (sin PostgreSQL — eso lo cubren verify-*.mjs).
/// </summary>
public sealed class AuditoriaServiceTests
{
    private readonly Mock<IRegistroAccesoRepository> _registros = new();
    private readonly Mock<IAuditoriaRepository> _auditoria = new();
    private readonly Mock<INotificacionRepository> _notificaciones = new();
    private readonly Mock<IUsuarioRepository> _usuarios = new();

    private AuditoriaService Servicio() =>
        new(_registros.Object, _auditoria.Object, _notificaciones.Object, _usuarios.Object, TestData.LoggerNulo<AuditoriaService>());

    // ========== 1) Criterio: ingreso sin egreso de días anteriores → hallazgo ==========
    [Fact]
    public async Task Verificar_IngresoSinEgresoDeDiasAnteriores_CreaHallazgo()
    {
        // Ingreso de hace 2 días sin egreso correspondiente (el de hoy NO es anomalía).
        var anteayer = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(-2));
        _registros.Setup(m => m.IngresosSinEgresoAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>
            {
                TestData.Registro(7, 1, "ingreso", anteayer, new TimeOnly(8, 0), persona: TestData.PersonaActiva(7, "Ana López")),
            });
        _registros.Setup(m => m.RegistrosDuplicadosAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosInconsistentesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.ListarIngresosDelDiaAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>());

        List<Auditoria>? recibidos = null;
        _auditoria.Setup(m => m.AgregarHallazgosAsync(It.IsAny<List<Auditoria>>(), It.IsAny<CancellationToken>()))
            .Callback<List<Auditoria>, CancellationToken>((l, _) => recibidos = l)
            .ReturnsAsync((List<Auditoria> l, CancellationToken _) => l);

        var resultado = await Servicio().VerificarAsync();

        Assert.True(resultado.Exitoso);
        var hallazgo = Assert.Single(resultado.Dato!.PorTipo);
        Assert.Equal(1, hallazgo.Value);
        Assert.Equal("acceso_sin_egreso", hallazgo.Key);
        Assert.Equal(0, resultado.Dato.NotificacionesGeneradas);
        Assert.NotNull(recibidos);
        var h = Assert.Single(recibidos!);
        Assert.Equal("acceso_sin_egreso", h.Tipo);
        Assert.Equal(7, h.PersonaId);
        Assert.Equal("abierto", h.Estado);
        Assert.Contains("Ana López", h.Descripcion);
        Assert.Contains(anteayer.ToString("yyyy-MM-dd"), h.Descripcion);
    }

    [Fact]
    public async Task Verificar_SinIngresosSinEgreso_NoCreaHallazgoDeEseTipo()
    {
        SetupVacio();
        List<Auditoria>? recibidos = null;
        _auditoria.Setup(m => m.AgregarHallazgosAsync(It.IsAny<List<Auditoria>>(), It.IsAny<CancellationToken>()))
            .Callback<List<Auditoria>, CancellationToken>((l, _) => recibidos = l)
            .ReturnsAsync((List<Auditoria> l, CancellationToken _) => l);

        var resultado = await Servicio().VerificarAsync();

        Assert.True(resultado.Exitoso);
        Assert.Empty(recibidos!);
        Assert.Equal(0, resultado.Dato!.HallazgosCreados);
    }

    // ========== 2) Criterio: duplicados en la bitácora → hallazgo ==========
    [Fact]
    public async Task Verificar_Duplicados_CreaHallazgoRegistroDuplicado()
    {
        _registros.Setup(m => m.IngresosSinEgresoAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosDuplicadosAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>
            {
                TestData.Registro(7, 1, "ingreso", persona: TestData.PersonaActiva(7, "Ana López")),
            });
        _registros.Setup(m => m.RegistrosInconsistentesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.ListarIngresosDelDiaAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>());

        List<Auditoria>? recibidos = null;
        _auditoria.Setup(m => m.AgregarHallazgosAsync(It.IsAny<List<Auditoria>>(), It.IsAny<CancellationToken>()))
            .Callback<List<Auditoria>, CancellationToken>((l, _) => recibidos = l)
            .ReturnsAsync((List<Auditoria> l, CancellationToken _) => l);

        var resultado = await Servicio().VerificarAsync();

        var h = Assert.Single(recibidos!);
        Assert.Equal("registro_duplicado", h.Tipo);
        Assert.Equal(7, h.PersonaId);
        Assert.Contains("Ana López", h.Descripcion);
    }

    // ========== 3) Criterio: campos nulos/inconsistentes → hallazgo ==========
    [Fact]
    public async Task Verificar_RegistrosInconsistentes_CreaHallazgoCampoInconsistente()
    {
        _registros.Setup(m => m.IngresosSinEgresoAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosDuplicadosAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosInconsistentesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>
            {
                // Referencia rota: persona_id <= 0 → el hallazgo queda sin PersonaId (null).
                TestData.Registro(0, 1, "ingreso"),
            });
        _registros.Setup(m => m.ListarIngresosDelDiaAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso>());

        List<Auditoria>? recibidos = null;
        _auditoria.Setup(m => m.AgregarHallazgosAsync(It.IsAny<List<Auditoria>>(), It.IsAny<CancellationToken>()))
            .Callback<List<Auditoria>, CancellationToken>((l, _) => recibidos = l)
            .ReturnsAsync((List<Auditoria> l, CancellationToken _) => l);

        var resultado = await Servicio().VerificarAsync();

        var h = Assert.Single(recibidos!);
        Assert.Equal("campo_inconsistente", h.Tipo);
        Assert.Null(h.PersonaId);
    }

    // ========== 4) Criterio: concentración inusual — bajo el umbral no se dispara ==========
    [Fact]
    public async Task Verificar_ConcentracionPorDebajoDelUmbral_NoDispara()
    {
        var referencia = ConstruirReferencia();
        // 9 ingresos en la ventana (umbral = 10) → no debe marcar.
        var registros = Enumerable.Range(0, 9)
            .Select(i => TestData.Registro(100 + i, 1, "ingreso", referencia.dentro.fecha, referencia.dentro.hora.AddMinutes(-i), zona: TestData.ZonaActiva(1, "Oficinas")))
            .ToList();

        _registros.Setup(m => m.IngresosSinEgresoAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosDuplicadosAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosInconsistentesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.ListarIngresosDelDiaAsync(referencia.dentro.fecha, It.IsAny<CancellationToken>())).ReturnsAsync(registros);

        List<Auditoria>? recibidos = null;
        _auditoria.Setup(m => m.AgregarHallazgosAsync(It.IsAny<List<Auditoria>>(), It.IsAny<CancellationToken>()))
            .Callback<List<Auditoria>, CancellationToken>((l, _) => recibidos = l)
            .ReturnsAsync((List<Auditoria> l, CancellationToken _) => l);

        var resultado = await Servicio().VerificarAsync();

        Assert.Empty(recibidos!);
        _notificaciones.Verify(m => m.AgregarAsync(It.IsAny<Notificacion>(), It.IsAny<CancellationToken>()), Times.Never);
        Assert.Equal(0, resultado.Dato!.NotificacionesGeneradas);
    }

    // ========== 5) Criterio: concentración inusual — umbral alcanzado → hallazgo + notificación a Gerencia ==========
    [Fact]
    public async Task Verificar_ConcentracionEnElUmbral_CreaHallazgoYNotificaGerencia()
    {
        var referencia = ConstruirReferencia();
        var registros = Enumerable.Range(0, AuditoriaService.UmbralConcentracion)
            .Select(i => TestData.Registro(100 + i, 1, "ingreso", referencia.dentro.fecha, referencia.dentro.hora.AddMinutes(-i), zona: TestData.ZonaActiva(1, "Oficinas")))
            .ToList();
        // Otra zona con 2 ingresos → no debe producir hallazgo propio.
        registros.Add(TestData.Registro(200, 2, "ingreso", referencia.dentro.fecha, referencia.dentro.hora, zona: TestData.ZonaActiva(2, "Laboratorio")));
        registros.Add(TestData.Registro(201, 2, "ingreso", referencia.dentro.fecha, referencia.dentro.hora.AddMinutes(-1), zona: TestData.ZonaActiva(2, "Laboratorio")));
        // Zona 1 con un ingreso FUERA de la ventana (45 min atrás) → no suma al conteo.
        registros.Add(TestData.Registro(300, 1, "ingreso", referencia.fuera.fecha, referencia.fuera.hora, zona: TestData.ZonaActiva(1, "Oficinas")));

        _usuarios.Setup(m => m.ObtenerActivoPorRolAsync("GERENCIA", It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestData.UsuarioGerencia(1));
        _registros.Setup(m => m.IngresosSinEgresoAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosDuplicadosAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosInconsistentesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.ListarIngresosDelDiaAsync(referencia.dentro.fecha, It.IsAny<CancellationToken>())).ReturnsAsync(registros);

        Notificacion? notificacion = null;
        _notificaciones.Setup(m => m.AgregarAsync(It.IsAny<Notificacion>(), It.IsAny<CancellationToken>()))
            .Callback<Notificacion, CancellationToken>((n, _) => notificacion = n)
            .ReturnsAsync((Notificacion n, CancellationToken _) => n);

        List<Auditoria>? recibidos = null;
        _auditoria.Setup(m => m.AgregarHallazgosAsync(It.IsAny<List<Auditoria>>(), It.IsAny<CancellationToken>()))
            .Callback<List<Auditoria>, CancellationToken>((l, _) => recibidos = l)
            .ReturnsAsync((List<Auditoria> l, CancellationToken _) => l);

        var resultado = await Servicio().VerificarAsync();

        // 1 hallazgo "concentracion" (solo zona 1, y el ingreso fuera de ventana no cuenta).
        var concentracion = Assert.Single(recibidos!);
        Assert.Equal("concentracion", concentracion.Tipo);
        Assert.Contains("Oficinas", concentracion.Descripcion);
        Assert.Contains(AuditoriaService.UmbralConcentracion.ToString(), concentracion.Descripcion);
        Assert.Equal(1, resultado.Dato!.NotificacionesGeneradas);

        Assert.NotNull(notificacion);
        Assert.Equal("concentracion", notificacion!.Tipo);
        Assert.Equal(1, notificacion.UsuarioId); // dirigida a Gerencia
        Assert.Null(notificacion.PersonaId);
    }

    // ========== 6) Criterio: muchos ingresos presentes pero fuera de la ventana → no se dispara ==========
    [Fact]
    public async Task Verificar_IngresosFueraDeLaVentanaRodante_NoSeCuentanParaElUmbral()
    {
        var referencia = ConstruirReferencia();
        // 8 dentro + 4 fuera (45 min atrás) = 12 registros, pero solo 8 en la ventana → < 10.
        var registros = Enumerable.Range(0, 8)
            .Select(i => TestData.Registro(100 + i, 1, "ingreso", referencia.dentro.fecha, referencia.dentro.hora.AddMinutes(-i), zona: TestData.ZonaActiva(1, "Oficinas")))
            .ToList();
        registros.AddRange(Enumerable.Range(0, 4).Select(i =>
            TestData.Registro(200 + i, 1, "ingreso", referencia.fuera.fecha, referencia.fuera.hora, zona: TestData.ZonaActiva(1, "Oficinas"))));

        _registros.Setup(m => m.IngresosSinEgresoAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosDuplicadosAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosInconsistentesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.ListarIngresosDelDiaAsync(referencia.dentro.fecha, It.IsAny<CancellationToken>())).ReturnsAsync(registros);

        _auditoria.Setup(m => m.AgregarHallazgosAsync(It.IsAny<List<Auditoria>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((List<Auditoria> l, CancellationToken _) => l);

        var resultado = await Servicio().VerificarAsync();

        Assert.Empty(resultado.Dato!.PorTipo);
        _notificaciones.Verify(m => m.AgregarAsync(It.IsAny<Notificacion>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ========== 7) Verificación mixta: el resumen PorTipo cuenta correctamente ==========
    [Fact]
    public async Task Verificar_Mixto_ResumenPorTipoCorrecto()
    {
        var anteayer = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(-2));
        var referencia = ConstruirReferencia();

        _registros.Setup(m => m.IngresosSinEgresoAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso> { TestData.Registro(7, 1, "ingreso", anteayer) });
        _registros.Setup(m => m.RegistrosDuplicadosAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso> { TestData.Registro(8, 2, "egreso") });
        _registros.Setup(m => m.RegistrosInconsistentesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RegistroAcceso> { TestData.Registro(0, 3, "ingreso") });

        var registros = Enumerable.Range(0, AuditoriaService.UmbralConcentracion)
            .Select(i => TestData.Registro(100 + i, 4, "ingreso", referencia.dentro.fecha, referencia.dentro.hora.AddMinutes(-i), zona: TestData.ZonaActiva(4, "Bodega")))
            .ToList();
        _usuarios.Setup(m => m.ObtenerActivoPorRolAsync("GERENCIA", It.IsAny<CancellationToken>())).ReturnsAsync(TestData.UsuarioGerencia(1));
        _registros.Setup(m => m.ListarIngresosDelDiaAsync(referencia.dentro.fecha, It.IsAny<CancellationToken>())).ReturnsAsync(registros);
        _notificaciones.Setup(m => m.AgregarAsync(It.IsAny<Notificacion>(), It.IsAny<CancellationToken>())).ReturnsAsync((Notificacion n, CancellationToken _) => n);
        _auditoria.Setup(m => m.AgregarHallazgosAsync(It.IsAny<List<Auditoria>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((List<Auditoria> l, CancellationToken _) => l);

        var resultado = await Servicio().VerificarAsync();

        Assert.True(resultado.Exitoso);
        Assert.Equal(4, resultado.Dato!.HallazgosCreados);
        Assert.Equal(1, resultado.Dato.NotificacionesGeneradas);
        Assert.Equal(4, resultado.Dato.PorTipo.Count);
        Assert.Equal(1, resultado.Dato.PorTipo["acceso_sin_egreso"]);
        Assert.Equal(1, resultado.Dato.PorTipo["registro_duplicado"]);
        Assert.Equal(1, resultado.Dato.PorTipo["campo_inconsistente"]);
        Assert.Equal(1, resultado.Dato.PorTipo["concentracion"]);
    }

    // ========== 8) ListarAsync: saneamiento de paginación ==========
    [Fact]
    public async Task Listar_SaneaPaginacion()
    {
        var hallazgos = new List<Auditoria>
        {
            new() { Id = 1, Tipo = "acceso_sin_egreso", Descripcion = "d", Estado = "abierto", Fecha = DateOnly.FromDateTime(GuatemalaTime.Now) },
        };
        _auditoria.Setup(m => m.ListarAsync(It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((hallazgos, 11));

        var resultado = await Servicio().ListarAsync(null, null, pagina: 0, tamanoPagina: 1000);

        Assert.True(resultado.Exitoso);
        _auditoria.Verify(m => m.ListarAsync(null, null, 1, 20, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(1, resultado.Dato!.TotalPaginas); // ceil(11/20)
    }

    // ========== 9) CambiarEstadoAsync: flujo de estados del hallazgo ==========
    [Fact]
    public async Task CambiarEstado_HallazgoNoExiste_DevuelveNoEncontrado()
    {
        _auditoria.Setup(m => m.FindByIdAsync(99, It.IsAny<CancellationToken>())).ReturnsAsync((Auditoria?)null);

        var resultado = await Servicio().CambiarEstadoAsync(99, Solicitud("resuelto"));

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.NoEncontrado, resultado.CodigoError);
    }

    [Theory]
    [InlineData("cerrado")]
    [InlineData("")]
    [InlineData("EN REVISION")]
    public async Task CambiarEstado_EstadoInvalido_DevuelveValidacion(string estado)
    {
        _auditoria.Setup(m => m.FindByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(Hallazgo());

        var resultado = await Servicio().CambiarEstadoAsync(1, Solicitud(estado));

        Assert.False(resultado.Exitoso);
        Assert.Equal(CodigosError.Validacion, resultado.CodigoError);
    }

    [Theory]
    [InlineData("abierto")]
    [InlineData("en_revision")]
    [InlineData("resuelto")]
    public async Task CambiarEstado_Exito_PersisteYNormaliza(string estado)
    {
        var hallazgo = Hallazgo();
        _auditoria.Setup(m => m.FindByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(hallazgo);
        _auditoria.Setup(m => m.ActualizarAsync(It.IsAny<Auditoria>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(hallazgo);

        var resultado = await Servicio().CambiarEstadoAsync(1, Solicitud(estado));

        Assert.True(resultado.Exitoso);
        Assert.Equal(estado, hallazgo.Estado);
        Assert.Equal(estado, resultado.Dato!.Estado);
        _auditoria.Verify(m => m.ActualizarAsync(hallazgo, It.IsAny<CancellationToken>()), Times.Once);
    }

    // ---------- helpers ----------
    private void SetupVacio()
    {
        _registros.Setup(m => m.IngresosSinEgresoAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosDuplicadosAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.RegistrosInconsistentesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
        _registros.Setup(m => m.ListarIngresosDelDiaAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>())).ReturnsAsync(new List<RegistroAcceso>());
    }

    /// <summary>
    /// Marcas de tiempo de referencia (UTC) para construir registros dentro/fuera de la ventana
    /// rodante de 30 minutos: <c>dentro</c> = ahora (válido), <c>fuera</c> = 45 min atrás.
    /// Una corrida de la verificación dura milisegundos; la referencia se captura en el setup
    /// del test y sigue cayendo dentro de la misma ventana cuando el servicio la evalúa.
    /// </summary>
    private static VentanaReferencia ConstruirReferencia()
    {
        var ahora = GuatemalaTime.Now;
        return new VentanaReferencia(
            (DateOnly.FromDateTime(ahora), TimeOnly.FromDateTime(ahora)),
            (DateOnly.FromDateTime(ahora.AddMinutes(-45)), TimeOnly.FromDateTime(ahora.AddMinutes(-45))));
    }

    private readonly record struct VentanaReferencia(
        (DateOnly fecha, TimeOnly hora) dentro,
        (DateOnly fecha, TimeOnly hora) fuera);

    private static Auditoria Hallazgo() => new()
    {
        Id = 1,
        Tipo = "acceso_sin_egreso",
        Descripcion = "d",
        PersonaId = 7,
        Estado = "abierto",
        Fecha = DateOnly.FromDateTime(GuatemalaTime.Now),
    };

    private static CambiarEstadoRequest Solicitud(string estado) => new() { Estado = estado };
}