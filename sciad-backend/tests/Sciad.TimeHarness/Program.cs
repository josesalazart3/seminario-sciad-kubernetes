// Arnés de regresión de la Fase 4 (zona horaria de Guatemala). Ejecutar: dotnet run --project tests/Sciad.TimeHarness
// Usa el código REAL de RegistrosAccesoService/AuditoriaService/CierreDiario con repositorios en memoria y un reloj simulado.
// Devuelve código de salida 0 si todo pasa. No requiere base de datos.
using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Sciad.Api.Background;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;
using Sciad.Domain.Entities;
using Sciad.Domain.Time;

// Arnés: ejecuta el código REAL de RegistrosAccesoService/AuditoriaService con repositorios en memoria
// y un reloj simulado, para comprobar el comportamiento de zona horaria de Guatemala (UTC-6).
public class Fake : DispatchProxy
{
    public Dictionary<string, Func<object?[], object?>> H = new();
    protected override object? Invoke(MethodInfo? m, object?[]? a)
    {
        if (!H.TryGetValue(m!.Name, out var f)) throw new NotImplementedException(m.Name);
        var r = f(a ?? Array.Empty<object?>());
        var rt = m.ReturnType;
        if (rt == typeof(Task)) return Task.CompletedTask;
        if (rt.IsGenericType && rt.GetGenericTypeDefinition() == typeof(Task<>))
            return typeof(Task).GetMethod("FromResult")!.MakeGenericMethod(rt.GetGenericArguments()[0]).Invoke(null, new[] { r });
        return r;
    }
    public static T Make<T>(Dictionary<string, Func<object?[], object?>> h) where T : class
    { var p = Create<T, Fake>(); ((Fake)(object)p).H = h; return p; }
}
public class ClockFake : TimeProvider { public DateTimeOffset Now; public override DateTimeOffset GetUtcNow() => Now; }

public static class Harness
{
    static int pass, fail;
    static void Check(string n, bool ok, string extra = "") { if (ok) pass++; else fail++; Console.WriteLine($"  {(ok ? "✓" : "✗ FALLO")} {n}{(extra != "" ? "  → " + extra : "")}"); }
    static DateTimeOffset Z(string iso) => DateTimeOffset.Parse(iso + "Z");

    public static int Main()
    {
        var clock = new ClockFake(); GuatemalaTime.Proveedor = clock;
        var persona = new Persona { Id = 7, Nombre = "Juan Pérez López", DpiCodigo = "2412300070101", Tipo = 1, Estado = "activo" };
        var zona = new ZonaAcceso { Id = 1, Nombre = "Entrada Principal", NivelSeguridad = "MEDIO", Estado = "activo" };
        var cred = new CredencialQr { Id = 1, PersonaId = 7, Persona = persona, Token = new string('A', 64), Estado = "activa" };
        var perfil = new PerfilAcceso { Id = 1, PersonaId = 7, ZonaId = 1, VigenciaInicio = new DateOnly(2026, 1, 1), VigenciaFin = new DateOnly(2026, 12, 31) };
        var db = new List<RegistroAcceso>(); var notifs = new List<Notificacion>();

        var registros = Fake.Make<IRegistroAccesoRepository>(new()
        {
            ["ContarMovimientosAsync"] = a => { var (p, z, f) = ((int)a[0]!, (int)a[1]!, (DateOnly)a[2]!); var x = db.Where(r => r.PersonaId == p && r.ZonaId == z && r.Fecha == f).ToList(); return (x.Count(r => r.Tipo == "ingreso"), x.Count(r => r.Tipo == "egreso")); },
            // imita el índice UNIQUE uq_ingreso_diario (persona, fecha) WHERE tipo='ingreso'
            ["RegistrarConTransaccionAsync"] = a => { var r = (RegistroAcceso)a[0]!; if (r.Tipo == "ingreso" && db.Any(x => x.PersonaId == r.PersonaId && x.Fecha == r.Fecha && x.Tipo == "ingreso")) return null; r.Id = db.Count + 1; db.Add(r); return r; },
            ["AgregarNotificacionAsync"] = a => { notifs.Add((Notificacion)a[0]!); return null; },
            ["ListarDelDiaAsync"] = a => { var f = (DateOnly)a[1]!; return db.Where(r => r.Fecha == f).Select(r => { r.Persona = persona; r.Zona = zona; return r; }).OrderBy(r => r.Hora).ToList(); },
        });
        // Clave fija SOLO para este arnés de pruebas (32 bytes en base64).
        var cifrado = new CifradoQr("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=");
        var svc = new RegistrosAccesoService(
            Fake.Make<ICredencialRepository>(new() { ["FindByIdAsync"] = a => cred }),
            Fake.Make<IZonaRepository>(new() { ["FindByIdAsync"] = a => zona }),
            Fake.Make<IPerfilAccesoRepository>(new() { ["ListarAsync"] = a => new List<PerfilAcceso> { perfil } }),
            registros,
            Fake.Make<IUsuarioRepository>(new() { ["ObtenerActivoPorRolAsync"] = a => null }),
            cifrado,
            NullLogger<RegistrosAccesoService>.Instance);
        var req = new Sciad.Application.Dtos.RegistrosAcceso.RegistrarAccesoRequest { Token = cifrado.Cifrar(cred.Id, cred.Token), ZonaId = 1 };

        Console.WriteLine("[1] GuatemalaTime");
        clock.Now = Z("2026-08-22T05:59:59"); Check("05:59:59Z = 23:59:59 GT sigue siendo el día 21", GuatemalaTime.Hoy == new DateOnly(2026, 8, 21), GuatemalaTime.Now.ToString("s"));
        clock.Now = Z("2026-08-22T06:00:00"); Check("06:00:00Z = 00:00:00 GT cambia al día 22", GuatemalaTime.Hoy == new DateOnly(2026, 8, 22));
        Check("ToUtc(fecha,hora GT) ida y vuelta", GuatemalaTime.ToUtc(new DateOnly(2026, 8, 21), new TimeOnly(18, 30, 0)) == new DateTime(2026, 8, 22, 0, 30, 0, DateTimeKind.Utc));

        Console.WriteLine("[2] Escaneo: entrada 7:15 am y salida 6:30 pm (el error que se corrige)");
        clock.Now = Z("2026-08-21T13:15:32");   // 07:15:32 en Guatemala
        var r1 = svc.RegistrarAccesoAsync(req, 1).Result;
        Check("7:15 am GT → INGRESO", r1.Exitoso && r1.Dato!.Tipo == "ingreso", r1.Mensaje);
        Check("se guarda fecha 21 y hora 07:15:32 (hora de Guatemala)", db[0].Fecha == new DateOnly(2026, 8, 21) && db[0].Hora == new TimeOnly(7, 15, 32), $"{db[0].Fecha} {db[0].Hora}");
        Check("timestamp de la respuesta sigue siendo el instante UTC real", r1.Dato!.Timestamp == new DateTime(2026, 8, 21, 13, 15, 32, DateTimeKind.Utc) && r1.Dato.Timestamp.Kind == DateTimeKind.Utc, r1.Dato.Timestamp.ToString("o"));

        clock.Now = Z("2026-08-22T00:30:00");   // 18:30 del MISMO día en Guatemala (medianoche pasada en UTC)
        var r2 = svc.RegistrarAccesoAsync(req, 1).Result;
        Check("6:30 pm GT (00:30 UTC del día siguiente) → EGRESO, no un nuevo ingreso", r2.Exitoso && r2.Dato!.Tipo == "egreso", r2.Mensaje ?? r2.Dato?.Tipo);
        Check("el egreso queda en la fecha 21 (día de Guatemala)", db[1].Fecha == new DateOnly(2026, 8, 21) && db[1].Hora == new TimeOnly(18, 30, 0), $"{db[1].Fecha} {db[1].Hora}");

        var hoy = svc.ListarDelDiaAsync(null).Result.Dato!;
        Check("'accesos del día' a las 6:30 pm GT sigue mostrando a la persona (fuera)", hoy.Count == 1 && !hoy[0].Dentro, $"filas={hoy.Count}");

        clock.Now = Z("2026-08-22T12:00:00");   // 06:00 am del día 22 en Guatemala
        var r3 = svc.RegistrarAccesoAsync(req, 1).Result;
        Check("al día siguiente (6:00 am GT) → nuevo INGRESO en fecha 22", r3.Exitoso && r3.Dato!.Tipo == "ingreso" && db[2].Fecha == new DateOnly(2026, 8, 22));

        Console.WriteLine("[3] Auditoría: concentración (ventana 30 min) con reloj de Guatemala");
        db.Clear();
        clock.Now = Z("2026-08-22T00:30:00");   // 18:30 GT del día 21
        var hallazgos = new List<Auditoria>(); var nots = new List<Notificacion>();
        var zonaC = new ZonaAcceso { Id = 2, Nombre = "Oficinas", NivelSeguridad = "MEDIO", Estado = "activo" };
        for (int i = 0; i < AuditoriaService.UmbralConcentracion; i++)   // 10 ingresos "hace 5 minutos" (18:25 GT)
            db.Add(new RegistroAcceso { Id = 100 + i, PersonaId = 10 + i, ZonaId = 2, Zona = zonaC, Persona = new Persona { Id = 10 + i, Nombre = "P" + i }, Fecha = new DateOnly(2026, 8, 21), Hora = new TimeOnly(18, 25, 0), Tipo = "ingreso" });
        var aud = new AuditoriaService(
            Fake.Make<IRegistroAccesoRepository>(new() {
                ["IngresosSinEgresoAsync"] = a => new List<RegistroAcceso>(), ["RegistrosDuplicadosAsync"] = a => new List<RegistroAcceso>(),
                ["RegistrosInconsistentesAsync"] = a => new List<RegistroAcceso>(),
                ["ListarIngresosDelDiaAsync"] = a => { var f = (DateOnly)a[0]!; return db.Where(r => r.Fecha == f).ToList(); } }),
            Fake.Make<IAuditoriaRepository>(new() { ["AgregarHallazgosAsync"] = a => { hallazgos.AddRange((List<Auditoria>)a[0]!); return a[0]; } }),
            Fake.Make<INotificacionRepository>(new() { ["AgregarAsync"] = a => { nots.Add((Notificacion)a[0]!); return a[0]; } }),
            Fake.Make<IUsuarioRepository>(new() { ["ObtenerActivoPorRolAsync"] = a => null }),
            NullLogger<AuditoriaService>.Instance);
        var v = aud.VerificarAsync().Result;
        Check("10 ingresos a las 18:25 GT, verificación a las 18:30 GT → detecta concentración", hallazgos.Any(h => h.Tipo == "concentracion"), string.Join(",", hallazgos.Select(h => h.Tipo)));
        Check("hallazgo con fecha de Guatemala (21)", hallazgos.All(h => h.Fecha == new DateOnly(2026, 8, 21)));
        Check("genera 1 notificación de concentración", nots.Count == 1 && nots[0].Tipo == "concentracion");

        // ───────────────────────── Cierre diario de medianoche (opción A) ─────────────────────────
        Console.WriteLine("[4] Cierre diario: ¿cuánto falta para las 00:05 de Guatemala?");
        var hora0005 = new TimeOnly(0, 5);
        clock.Now = Z("2026-08-22T05:00:00"); Check("23:00 GT → faltan 1 h 05 min", GuatemalaTime.HastaProximaHora(hora0005) == TimeSpan.FromMinutes(65), GuatemalaTime.HastaProximaHora(hora0005).ToString());
        clock.Now = Z("2026-08-22T06:10:00"); Check("00:10 GT → faltan 23 h 55 min (mañana)", GuatemalaTime.HastaProximaHora(hora0005) == new TimeSpan(23, 55, 0));
        clock.Now = Z("2026-08-22T06:04:59"); Check("00:04:59 GT → falta 1 segundo", GuatemalaTime.HastaProximaHora(hora0005) == TimeSpan.FromSeconds(1));
        clock.Now = Z("2026-08-22T06:05:00"); Check("00:05:00 GT exactas → la próxima es mañana (24 h)", GuatemalaTime.HastaProximaHora(hora0005) == TimeSpan.FromHours(24));

        Console.WriteLine("[5] Persona que se va sin marcar salida: se marca a la medianoche");
        var juan = new Persona { Id = 7, Nombre = "Juan Pérez López", DpiCodigo = "2412300070101", Tipo = 1, Estado = "activo" };
        var ana = new Persona { Id = 8, Nombre = "Ana Lucía Castillo", DpiCodigo = "2412300080101", Tipo = 1, Estado = "activo" };
        var z1 = new ZonaAcceso { Id = 1, Nombre = "Entrada Principal", NivelSeguridad = "MEDIO", Estado = "activo" };
        var dia = new DateOnly(2026, 8, 21);
        var regs = new List<RegistroAcceso>
        {
            new() { Id = 1, PersonaId = 7, Persona = juan, ZonaId = 1, Zona = z1, Fecha = dia, Hora = new TimeOnly(7, 15), Tipo = "ingreso" },            // Juan: SIN egreso
            new() { Id = 2, PersonaId = 8, Persona = ana,  ZonaId = 1, Zona = z1, Fecha = dia, Hora = new TimeOnly(8, 0),  Tipo = "ingreso" },
            new() { Id = 3, PersonaId = 8, Persona = ana,  ZonaId = 1, Zona = z1, Fecha = dia, Hora = new TimeOnly(17, 30), Tipo = "egreso" },            // Ana: completo
        };
        var guardados = new List<Auditoria>();
        var nots2 = new List<Notificacion>();
        var audN = new AuditoriaService(
            Fake.Make<IRegistroAccesoRepository>(new()
            {
                // misma lógica que RegistroAccesoRepository.IngresosSinEgresoAsync
                ["IngresosSinEgresoAsync"] = a => { var corte = (DateOnly)a[0]!; return regs.Where(r => r.Tipo == "ingreso" && r.Fecha < corte && !regs.Any(e => e.PersonaId == r.PersonaId && e.Fecha == r.Fecha && e.Tipo == "egreso")).GroupBy(r => (r.PersonaId, r.Fecha)).Select(g => g.First()).ToList(); },
                ["RegistrosDuplicadosAsync"] = a => new List<RegistroAcceso>(), ["RegistrosInconsistentesAsync"] = a => new List<RegistroAcceso>(),
                ["ListarIngresosDelDiaAsync"] = a => new List<RegistroAcceso>(),
            }),
            Fake.Make<IAuditoriaRepository>(new() { ["AgregarHallazgosAsync"] = a => { var l = (List<Auditoria>)a[0]!; guardados.AddRange(l); return l; } }),
            Fake.Make<INotificacionRepository>(new() { ["AgregarAsync"] = a => { nots2.Add((Notificacion)a[0]!); return a[0]; } }),
            Fake.Make<IUsuarioRepository>(new() { ["ObtenerActivoPorRolAsync"] = a => null }),
            NullLogger<AuditoriaService>.Instance);

        clock.Now = Z("2026-08-22T05:59:00");   // 23:59 del mismo día 21 en Guatemala
        guardados.Clear(); audN.VerificarAsync().Wait();
        Check("23:59 del mismo día: el ingreso del día en curso NO es anomalía (PG2 Tabla 16)", guardados.Count == 0, $"hallazgos={guardados.Count}");

        clock.Now = Z("2026-08-22T06:05:00");   // 00:05 del día 22 en Guatemala = cierre diario
        guardados.Clear(); audN.VerificarAsync().Wait();
        var sinEgreso = guardados.Where(h => h.Tipo == "acceso_sin_egreso").ToList();
        Check("00:05: se marca UN hallazgo «acceso_sin_egreso» (solo Juan, no Ana)", sinEgreso.Count == 1 && sinEgreso[0].PersonaId == 7, string.Join(" | ", sinEgreso.Select(h => h.Descripcion)));
        Check("el hallazgo nace «abierto», con fecha de Guatemala y menciona el día del ingreso", sinEgreso.Count == 1 && sinEgreso[0].Estado == "abierto" && sinEgreso[0].Fecha == new DateOnly(2026, 8, 22) && sinEgreso[0].Descripcion.Contains("2026-08-21"));
        Check("no se envía alerta/notificación por «sin egreso» (solo la concentración notifica, PG2 §4.3.4)", nots2.Count == 0);
        Check("no se inserta ningún registro de egreso automático (la bitácora no se altera)", regs.Count == 3);

        var existentes = guardados.Select(h => (h.Tipo, h.PersonaId, h.Descripcion)).ToList();
        guardados.Clear(); audN.VerificarAsync().Wait();            // la noche siguiente: el mismo caso vuelve a detectarse…
        var nuevosNoche2 = HallazgosUnicos.Filtrar(guardados, existentes);
        Check("la noche siguiente el MISMO caso no se vuelve a crear (sin duplicados)", nuevosNoche2.Count == 0, $"nuevos={nuevosNoche2.Count}");

        regs.Add(new RegistroAcceso { Id = 4, PersonaId = 8, Persona = ana, ZonaId = 1, Zona = z1, Fecha = new DateOnly(2026, 8, 22), Hora = new TimeOnly(9, 0), Tipo = "ingreso" });   // Ana olvida salir el día 22
        clock.Now = Z("2026-08-23T06:05:00");
        guardados.Clear(); audN.VerificarAsync().Wait();
        var nuevosNoche3 = HallazgosUnicos.Filtrar(guardados, existentes);
        Check("un caso NUEVO (Ana el día 22) sí se marca; el de Juan no se repite", nuevosNoche3.Count == 1 && nuevosNoche3[0].PersonaId == 8, string.Join(" | ", nuevosNoche3.Select(h => h.PersonaId + ":" + h.Descripcion.Length)));
        var conc = new Auditoria { Tipo = "concentracion", Descripcion = "Concentración X", Estado = "abierto", Fecha = dia };
        Check("«concentración» no se deduplica (es un evento puntual)", HallazgosUnicos.Filtrar(new[] { conc }, new[] { ("concentracion", (int?)null, "Concentración X") }).Count == 1);

        Console.WriteLine("[6] Servicio en segundo plano");
        var llamadas = 0; var lanzar = false;
        var servicios = new ServiceCollection();
        servicios.AddScoped(_ => Fake.Make<IAuditoriaService>(new() { ["VerificarAsync"] = a => { llamadas++; if (lanzar) throw new InvalidOperationException("BD caída"); return new Sciad.Application.Services.ServicioResultado<Sciad.Application.Dtos.Auditoria.VerificacionAuditoriaResultadoDto>(true, new Sciad.Application.Dtos.Auditoria.VerificacionAuditoriaResultadoDto(1, 0, new Dictionary<string, int> { ["acceso_sin_egreso"] = 1 })); } }));
        var proveedor = servicios.BuildServiceProvider();
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Auditoria:CierreDiario:Hora"] = "00:05" }).Build();
        var cierre = new CierreDiarioHostedService(proveedor.GetRequiredService<IServiceScopeFactory>(), cfg, NullLogger<CierreDiarioHostedService>.Instance);
        cierre.EjecutarAsync(CancellationToken.None).Wait();
        Check("EjecutarAsync llama una vez a la verificación de auditoría", llamadas == 1);
        lanzar = true; var ok = true; try { cierre.EjecutarAsync(CancellationToken.None).Wait(); } catch { ok = false; }
        Check("si la verificación falla, el servicio NO se cae (reintenta mañana)", ok && llamadas == 2);
        var apagado = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Auditoria:CierreDiario:Habilitado"] = "false" }).Build();
        var inactivo = new CierreDiarioHostedService(proveedor.GetRequiredService<IServiceScopeFactory>(), apagado, NullLogger<CierreDiarioHostedService>.Instance);
        inactivo.StartAsync(CancellationToken.None).Wait(); inactivo.StopAsync(CancellationToken.None).Wait();
        Check("con Habilitado=false no programa nada", llamadas == 2);

        // ───────────────────────── Seguridad del login (OWASP A07) ─────────────────────────
        Console.WriteLine("[7] Login: bloqueo por cuenta, sin enumeración y tiempo constante");
        var pwdOk = "Correcta#2026-x";
        var hashOk = BCrypt.Net.BCrypt.HashPassword(pwdOk, 10);
        var rolAdmin = new Rol { Id = 1, Codigo = "ADMIN", Nombre = "Administrador" };
        var uActivo = new Usuario { Id = 1, Nombre = "Admin", Correo = "admin@x.gt", Rol = rolAdmin, Puesto = "p", Estado = "activo", PasswordHash = hashOk };
        var uInactivo = new Usuario { Id = 2, Nombre = "Baja", Correo = "baja@x.gt", Rol = rolAdmin, Puesto = "p", Estado = "inactivo", PasswordHash = hashOk };
        var usuariosFake = Fake.Make<IUsuarioRepository>(new() { ["FindByCorreoAsync"] = a => (string)a[0]! switch { "admin@x.gt" => uActivo, "baja@x.gt" => uInactivo, _ => null } });
        var tokenFake = Fake.Make<ITokenService>(new() { ["GenerarToken"] = a => "jwt-firma" });
        var ahoraLogin = new DateTime(2026, 8, 21, 12, 0, 0, DateTimeKind.Utc);
        var tracker = new LoginAttemptTracker(() => ahoraLogin);
        var auth = new AuthService(usuariosFake, tokenFake, NullLogger<AuthService>.Instance, tracker);

        Check("login correcto → token", auth.LoginAsync("admin@x.gt", pwdOk).Result is { Exitoso: true });
        for (int i = 0; i < LoginAttemptTracker.MaxFallos - 1; i++) auth.LoginAsync("admin@x.gt", "mala" + i).Wait();
        Check($"{LoginAttemptTracker.MaxFallos - 1} fallos: todavía NO bloqueada (el límite por IP, 5, es otro mecanismo)", !tracker.EstaBloqueado("admin@x.gt"));
        auth.LoginAsync("admin@x.gt", "mala-final").Wait();
        Check($"al fallo n.º {LoginAttemptTracker.MaxFallos} la cuenta queda bloqueada", tracker.EstaBloqueado("admin@x.gt"));
        var bloqueada = auth.LoginAsync("admin@x.gt", pwdOk).Result;
        Check("con la cuenta bloqueada, incluso la contraseña CORRECTA devuelve el mismo error genérico", !bloqueada.Exitoso && bloqueada.CodigoError == LoginResult.CredencialesInvalidas);
        ahoraLogin = ahoraLogin + LoginAttemptTracker.Bloqueo + TimeSpan.FromSeconds(1);
        Check("pasado el tiempo de bloqueo, la contraseña correcta vuelve a funcionar", auth.LoginAsync("admin@x.gt", pwdOk).Result.Exitoso);

        var t2 = new LoginAttemptTracker(() => ahoraLogin); var auth2 = new AuthService(usuariosFake, tokenFake, NullLogger<AuthService>.Instance, t2);
        for (int i = 0; i < 6; i++) auth2.LoginAsync("admin@x.gt", "mala").Wait();
        auth2.LoginAsync("admin@x.gt", pwdOk).Wait();   // éxito: reinicia el contador
        for (int i = 0; i < 6; i++) auth2.LoginAsync("admin@x.gt", "mala").Wait();
        Check("un inicio de sesión correcto reinicia el contador de fallos (6+éxito+6 no bloquea)", !t2.EstaBloqueado("admin@x.gt"));

        var t3 = new LoginAttemptTracker(() => ahoraLogin); var auth3 = new AuthService(usuariosFake, tokenFake, NullLogger<AuthService>.Instance, t3);
        for (int i = 0; i < LoginAttemptTracker.MaxFallos; i++) auth3.LoginAsync("NoExiste@X.gt ", "x").Wait();
        Check("un correo que NO existe se bloquea igual (el bloqueo no revela qué cuentas existen) y se normaliza", t3.EstaBloqueado("noexiste@x.gt"));
        Check("la ventana de 15 min olvida fallos viejos", ((Func<bool>)(() => { var t4 = new LoginAttemptTracker(() => ahoraLogin); for (int i = 0; i < 9; i++) t4.RegistrarFallo("a@x.gt"); ahoraLogin += LoginAttemptTracker.Ventana + TimeSpan.FromSeconds(1); t4.RegistrarFallo("a@x.gt"); return !t4.EstaBloqueado("a@x.gt"); }))());
        Check("usuario inactivo: sigue devolviendo UsuarioInactivo (comportamiento probado en AuthServiceTests)", auth3.LoginAsync("baja@x.gt", pwdOk).Result.CodigoError == LoginResult.UsuarioInactivo);

        double Mediana(Func<object> f) { var t = new List<double>(); for (int i = 0; i < 5; i++) { var sw = System.Diagnostics.Stopwatch.StartNew(); f(); sw.Stop(); t.Add(sw.Elapsed.TotalMilliseconds); } t.Sort(); return t[2]; }
        var authT = new AuthService(usuariosFake, tokenFake, NullLogger<AuthService>.Instance, new LoginAttemptTracker());
        var tDesconocido = Mediana(() => authT.LoginAsync("fantasma@x.gt", "mala").Result);
        var tContrasenaMala = Mediana(() => authT.LoginAsync("admin@x.gt", "mala").Result);
        var tInactivo = Mediana(() => authT.LoginAsync("baja@x.gt", "mala").Result);
        var razon = Math.Max(tDesconocido, tContrasenaMala) / Math.Max(0.001, Math.Min(tDesconocido, tContrasenaMala));
        if (Math.Max(tDesconocido, tContrasenaMala) < 5) Console.WriteLine("  ℹ medición de tiempo omitida: no hay hashing BCrypt real en este entorno");
        else Check("tiempo constante: correo desconocido vs contraseña incorrecta (misma verificación BCrypt)", razon < 3.0, $"desconocido={tDesconocido:F0} ms, mala={tContrasenaMala:F0} ms, inactivo={tInactivo:F0} ms, razón={razon:F2}");

        Console.WriteLine("[8] Política de contraseña del administrador inicial");
        foreach (var debil in new[] { "sciad123", "corta1A!", "todominusculas123!", "TODOMAYUSCULAS123!", "SinNumeros!!!!!!", "Password123!!!", "aaaaaaaaaaAA11!!" })
            Check($"rechaza «{debil}»", !PoliticaContrasena.EsFuerte(debil, out _));
        Check("acepta una contraseña fuerte", PoliticaContrasena.EsFuerte("T7#vQ9!mZp2$kL", out _));

        Console.WriteLine($"\nRESULTADO: {pass} ✓  {fail} ✗");
        return fail == 0 ? 0 : 1;
    }
}
