using System.Reflection;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace Sciad.Tests.Auth;

/// <summary>
/// Pruebas unitarias de autorización RBAC (pollticas y cableado).
///
/// Dos capas:
/// 1) <b>Semántica de cada policy</b> — cada nombre de policy se configura con el mismo
///    <c>RequireRole(...)</c> que <c>Program.cs:AddAuthorization</c> y se evalúa a través del
///    pipeline real de ASP.NET Core (<see cref="DefaultAuthorizationService"/> +
///    <see cref="RolesAuthorizationHandler"/>). Se confirma qué rol autoriza y qué rol rechaza.
/// 2) <b>Cableado controlador</b> — por reflexión sobre la asamblea Sciad.Api se verifica que
///    todo <c>[Authorize(Policy=...)]</c> referencia una policy que existe y que la asignación
///    controlador/acción → policy coincide con la matriz documentada (espejo de SEC-05 a nivel
///    unitario; el recorrido E2E de 32 endpoints ya se ejecutó en <c>verify-seguridad.mjs</c>).
/// </summary>
public sealed class RbacPolicyTests
{
    // Espejo fiel del bloque AddAuthorization de Program.cs. Si cambia allí, cambia aquí.
    private static readonly (string Nombre, string[] Roles)[] Policies =
    {
        ("RequireAdmin", new[] { "ADMIN" }),
        ("RequireSeguridad", new[] { "SEGURIDAD" }),
        ("RequireGerencia", new[] { "GERENCIA" }),
        ("RequireSeguridadOAdmin", new[] { "SEGURIDAD", "ADMIN" }),
        ("RequireAdminOGerencia", new[] { "ADMIN", "GERENCIA" }),
        ("RequireZonaLectura", new[] { "ADMIN", "SEGURIDAD", "GERENCIA" }),
    };

    private const string SinAuthenticar = "(anonimo)";

    public static IEnumerable<object[]> Matriz => BuildMatriz();

    private static IEnumerable<object[]> BuildMatriz()
        => (from p in Policies
            from rol in new[] { "ADMIN", "SEGURIDAD", "GERENCIA", SinAuthenticar }
            select new object[] { p.Nombre, rol, p.Roles.Contains(rol) }).ToArray();

    // ========== 1) Semántica de cada policy × cada sujeto ==========
    [Theory]
    [MemberData(nameof(Matriz))]
    public async Task Policy_AutorizaExactamenteSegunLaMatriz(string policy, string rol, bool permitido)
    {
        var servicio = CrearServicioAutorizacion();

        var principal = rol == SinAuthenticar
            ? new ClaimsPrincipal() // anónimo: sin identidad
            : PrincipalConRol(rol);

        var resultado = await servicio.AuthorizeAsync(principal, policy);

        Assert.Equal(permitido, resultado.Succeeded);
    }

    // ========== 2) Toda policy usada por un controlador existe en Program.cs ==========
    [Fact]
    public void TodaPolicyUsadaPorLosControladores_EstaDefinida()
    {
        var definidas = Policies.Select(p => p.Nombre).ToHashSet();

        foreach (var accion in EnumerarAcciones())
        {
            foreach (var policy in accion.Efectivas)
            {
                Assert.True(definidas.Contains(policy),
                    $"El controlador {accion.Controller}.{accion.Accion} usa la policy '{policy}' que no está definida en Program.cs.");
            }
        }
    }

    // ========== 3) Cableado controlador/acción → policy = matriz documentada ==========
    // Class-level [Authorize(Policy=…)]: los métodos heredan la política de su controlador.
    // En "efectivas" se unen las policies de clase + acción (Distinct): en ASP.NET Core un
    // endpoint con varias policies debe satisfacerlas TODAS.
    [Fact]
    public void CableadoRbac_Controladores_CoincideConLaMatrizDocumentada()
    {
        var efectivas = EnumerarAcciones().ToDictionary(a => (a.Controller, a.Accion), a => a.Efectivas);

        void Espera(string c, string a, params string[] policies)
            => Assertacion(efectivas, c, a, policies);

        // --- Gestión (Usuarios, Personas, Perfiles, Credenciales): solo ADMIN ---
        foreach (var (c, acciones) in new[]
                 {
                     ("UsuariosController", new[] { "Listar", "Crear", "Actualizar", "CambiarEstado" }),
                     ("PersonasController", new[] { "Listar", "Crear", "Actualizar", "CambiarEstado" }),
                     ("PerfilesAccesoController", new[] { "Listar", "Crear", "Eliminar" }),
                     ("CredencialesController", new[] { "Listar", "Generar", "Reemitir", "Revocar" }),
                 })
        {
            foreach (var accion in acciones)
            {
                Espera(c, accion, "RequireAdmin");
            }
        }

        // --- Zonas: lectura a cualquier rol autenticado, escritura solo Admin ---
        Espera("ZonasAccesoController", "Listar", "RequireZonaLectura");
        Espera("ZonasAccesoController", "Crear", "RequireAdmin");
        Espera("ZonasAccesoController", "Actualizar", "RequireAdmin");
        Espera("ZonasAccesoController", "CambiarEstado", "RequireAdmin");

        // --- Escaneo (CU-04) y del día (CU-05): Seguridad o Admin; historial (CU-06): Admin o Gerencia ---
        Espera("RegistrosAccesoController", "Registrar", "RequireSeguridadOAdmin");
        Espera("RegistrosAccesoController", "Hoy", "RequireSeguridadOAdmin");
        Espera("RegistrosAccesoController", "Historial", "RequireAdminOGerencia");

        // --- Auditoría (CU-08): Admin o Gerencia; la verificación SOLO Admin (clase + acción) ---
        Espera("AuditoriaController", "Verificar", "RequireAdminOGerencia", "RequireAdmin");
        Espera("AuditoriaController", "Listar", "RequireAdminOGerencia");
        Espera("AuditoriaController", "CambiarEstado", "RequireAdminOGerencia");

        // --- Notificaciones (CU-09) y reportes (CU-07): Admin o Gerencia ---
        Espera("NotificacionesController", "Listar", "RequireAdminOGerencia");
        Espera("NotificacionesController", "MarcarLeida", "RequireAdminOGerencia");
        Espera("ReportesController", "Generar", "RequireAdminOGerencia");
        Espera("ReportesController", "Listar", "RequireAdminOGerencia");

        // --- Auth: /me solo autenticado (sin policy nominal); /role-check solo Admin ---
        Espera("AuthController", "Me");
        Espera("AuthController", "RoleCheck", "RequireAdmin");
    }

    // ========== helpers ==========

    private static void Assertacion(Dictionary<(string, string), string[]> mapa, string controlador, string accion, string[] esperado)
    {
        Assert.True(mapa.TryGetValue((controlador, accion), out var efectivo),
            $"No se encontró la acción {controlador}.{accion} en la reflexión.");
        Assert.Equal(esperado.OrderBy(p => p), efectivo!.OrderBy(p => p));
    }

    private IAuthorizationService CrearServicioAutorizacion()
    {
        // Se arma el pipeline REAL de ASP.NET Core vía DI (AddAuthorization), igual que Program.cs:
        // DefaultAuthorizationService + los handlers registrados por el framework (incluye el handler
        // de requisitos de rol) + default policy provider. Solo cambia el conjunto de policies (el
        // espejo de Program.cs). No se depende de tipos internos de ASP.NET Core.
        var servicios = new ServiceCollection();
        servicios.AddLogging();
        servicios.AddAuthorization(options =>
        {
            foreach (var p in Policies)
            {
                options.AddPolicy(p.Nombre, builder => builder.RequireRole(p.Roles));
            }
        });

        using var proveedor = servicios.BuildServiceProvider();
        return proveedor.GetRequiredService<IAuthorizationService>();
    }

    private static ClaimsPrincipal PrincipalConRol(string rol)
        => new(new ClaimsIdentity(
            new[] { new Claim(ClaimTypes.Role, rol) },
            "tests"));

    // ---------- Reflexión sobre la asamblea Sciad.Api ----------

    private static IEnumerable<(string Controller, string Accion, string[] Efectivas)> EnumerarAcciones()
    {
        var asamblea = typeof(Sciad.Api.Controllers.HealthController).Assembly;
        foreach (var tipo in asamblea.GetTypes()
                     .Where(t => t.IsClass && !t.IsAbstract && typeof(ControllerBase).IsAssignableFrom(t)
                                 && t.Namespace?.StartsWith("Sciad.Api.Controllers") == true))
        {
            var claseEfectivo = PoliciesDeAutorizacion(tipo);
            foreach (var metodo in tipo.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                         .Where(m => !m.IsSpecialName && m.DeclaringType == tipo)
                         .OrderBy(m => m.Name))
            {
                var extras = PoliciesDeAutorizacion(metodo);
                yield return (tipo.Name, metodo.Name, claseEfectivo.Concat(extras).Distinct().ToArray());
            }
        }
    }

    private static string[] PoliciesDeAutorizacion(MemberInfo mi)
        => mi.GetCustomAttributes<AuthorizeAttribute>(inherit: false)
            .Where(a => !string.IsNullOrEmpty(a.Policy))
            .Select(a => a.Policy!)
            .ToArray();
}