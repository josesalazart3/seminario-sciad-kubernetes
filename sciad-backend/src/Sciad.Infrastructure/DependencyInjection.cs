using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sciad.Application.Interfaces;
using Sciad.Infrastructure.Persistence;
using Sciad.Infrastructure.Repositories;

namespace Sciad.Infrastructure;

/// <summary>Registro de dependencias de la capa Infrastructure.</summary>
public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException(
                "No se encontró la cadena de conexión 'Postgres' (variable ConnectionStrings__Postgres).");

        services.AddDbContext<SciadDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql => npgsql.MigrationsAssembly(typeof(SciadDbContext).Assembly.FullName))
                   .UseSnakeCaseNamingConvention());

        services.AddScoped<IUsuarioRepository, UsuarioRepository>();
        services.AddScoped<IPersonaRepository, PersonaRepository>();
        services.AddScoped<IZonaRepository, ZonaRepository>();
        services.AddScoped<IPerfilAccesoRepository, PerfilAccesoRepository>();
        services.AddScoped<ICredencialRepository, CredencialRepository>();
        services.AddScoped<IRegistroAccesoRepository, RegistroAccesoRepository>();
        services.AddScoped<IAuditoriaRepository, AuditoriaRepository>();
        services.AddScoped<INotificacionRepository, NotificacionRepository>();
        services.AddScoped<IReporteRepository, ReporteRepository>();
        services.AddScoped<DbSeeder>();

        return services;
    }
}
