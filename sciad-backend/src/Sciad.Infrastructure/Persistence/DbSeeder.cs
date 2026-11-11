using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Sciad.Application.Services;
using Sciad.Domain.Entities;

namespace Sciad.Infrastructure.Persistence;

/// <summary>
/// Siembra datos base: los 3 roles (RBAC) y los 3 usuarios demo que ya usa el frontend
/// (correos <c>*.sciad.gt</c>, contraseña <c>sciad123</c>). Idempotente.
/// </summary>
public sealed class DbSeeder
{
    private readonly SciadDbContext _db;
    private readonly ILogger<DbSeeder> _logger;
    private readonly IConfiguration _config;

    public DbSeeder(SciadDbContext db, ILogger<DbSeeder> logger, IConfiguration config)
    {
        _db = db;
        _logger = logger;
        _config = config;
    }

    public async Task SeedAsync(CancellationToken ct = default)
    {
        await SeedRolesAsync(ct);
        // Persistir roles ANTES de consultarlos: los roles recién agregados están en estado
        // "Added" y un SingleAsync() ejecuta una consulta contra la BD, no contra el tracker;
        // sin este SaveChanges la consulta no los encontraba y lanzaba "Sequence contains no elements".
        await _db.SaveChangesAsync(ct);

        await SeedUsuariosAsync(ct);
        await _db.SaveChangesAsync(ct);
    }

    private async Task SeedRolesAsync(CancellationToken ct)
    {
        var rolesExistentes = await _db.Roles.Select(r => r.Codigo).ToListAsync(ct);
        var roles = new[]
        {
            new Rol { Nombre = "Administrador", Codigo = "ADMIN" },
            new Rol { Nombre = "Personal de Seguridad", Codigo = "SEGURIDAD" },
            new Rol { Nombre = "Gerencia / Auditoría", Codigo = "GERENCIA" },
        };

        var nuevos = 0;
        foreach (var rol in roles)
        {
            if (!rolesExistentes.Contains(rol.Codigo))
            {
                _db.Roles.Add(rol);
                nuevos++;
            }
        }

        if (nuevos > 0)
        {
            _logger.LogInformation("Se sembraron {Nuevos} rol(es) base.", nuevos);
        }
    }

    /// <summary>
    /// Cuentas de arranque. Seguridad (OWASP A05/A07): las cuentas DEMO con contraseña conocida (sciad123) solo se crean en
    /// Development (o si se pide explícitamente con Seed__DemoUsers=true). En producción NO existen; el administrador inicial
    /// se declara con Seed__AdminEmail y Seed__AdminPassword (contraseña fuerte, ≥ 12 caracteres) y solo se crea si no existe.
    /// </summary>
    private async Task SeedUsuariosAsync(CancellationToken ct)
    {
        var entorno = _config["ASPNETCORE_ENVIRONMENT"] ?? "Production";
        var demo = bool.TryParse(_config["Seed:DemoUsers"], out var pedido)
            ? pedido
            : string.Equals(entorno, "Development", StringComparison.OrdinalIgnoreCase);

        if (demo)
        {
            _logger.LogWarning("Sembrando cuentas DEMO con contraseña conocida: solo para desarrollo.");
            await SeedUsuariosDemoAsync(ct);
            return;
        }

        await SeedAdministradorInicialAsync(ct);
    }

    private async Task SeedAdministradorInicialAsync(CancellationToken ct)
    {
        var correo = _config["Seed:AdminEmail"]?.Trim().ToLowerInvariant();
        var clave = _config["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(correo) || string.IsNullOrEmpty(clave))
        {
            if (!await _db.Usuarios.AnyAsync(ct))
            {
                _logger.LogError(
                    "No existe ningún usuario y no se definió Seed__AdminEmail / Seed__AdminPassword: nadie podrá iniciar sesión.");
            }

            return;
        }

        if (await _db.Usuarios.AnyAsync(u => u.Correo == correo, ct))
        {
            return;
        }

        if (!PoliticaContrasena.EsFuerte(clave, out var motivo))
        {
            // Falla al arrancar: es preferible no iniciar que iniciar con un administrador débil.
            throw new InvalidOperationException($"Seed:AdminPassword no es segura: {motivo}.");
        }

        var adminRol = await _db.Roles.SingleAsync(r => r.Codigo == "ADMIN", ct);
        _db.Usuarios.Add(new Usuario
        {
            Nombre = "Administrador del Sistema",
            Correo = correo,
            Rol = adminRol,
            Puesto = "Administrador del Sistema",
            Estado = "activo",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(clave, workFactor: 12),
        });
        _logger.LogInformation("Administrador inicial creado ({Correo}).", correo);
    }

    private async Task SeedUsuariosDemoAsync(CancellationToken ct)
    {
        var adminRol = await _db.Roles.SingleAsync(r => r.Codigo == "ADMIN", ct);
        var seguridadRol = await _db.Roles.SingleAsync(r => r.Codigo == "SEGURIDAD", ct);
        var gerenciaRol = await _db.Roles.SingleAsync(r => r.Codigo == "GERENCIA", ct);

        // Mismas credenciales que el mock del frontend (mock-db.ts).
        const string passwordDemo = "sciad123";
        var hash = BCrypt.Net.BCrypt.HashPassword(passwordDemo, workFactor: 10);

        var usuarios = new[]
        {
            new Usuario
            {
                Nombre = "Lic. Marco Antonio Ortíz",
                Correo = "admin@sciad.gt",
                Rol = adminRol,
                Puesto = "Administrador del Sistema",
                Estado = "activo",
                PasswordHash = hash,
            },
            new Usuario
            {
                Nombre = "Carlos Gómez Rivera",
                Correo = "seguridad@sciad.gt",
                Rol = seguridadRol,
                Puesto = "Jefe de Seguridad — Turno Diurno",
                Estado = "activo",
                PasswordHash = hash,
            },
            new Usuario
            {
                Nombre = "Ing. Sofía Herrera",
                Correo = "gerencia@sciad.gt",
                Rol = gerenciaRol,
                Puesto = "Gerente de Operaciones y Auditoría",
                Estado = "activo",
                PasswordHash = hash,
            },
        };

        var correosExistentes = await _db.Usuarios.Select(u => u.Correo).ToListAsync(ct);
        foreach (var u in usuarios)
        {
            if (!correosExistentes.Contains(u.Correo))
            {
                _db.Usuarios.Add(u);
            }
        }
    }
}
