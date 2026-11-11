using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Sciad.Infrastructure.Persistence;

/// <summary>
/// Fábrica de diseño para <c>dotnet ef</c>. Lee la cadena de conexión desde la
/// variable de entorno <c>ConnectionStrings__Postgres</c> (o el valor por defecto de
/// desarrollo), permitiendo generar/aplicar migraciones sin arrancar la API.
/// </summary>
public sealed class SciadDbContextFactory : IDesignTimeDbContextFactory<SciadDbContext>
{
    public SciadDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Postgres")
            ?? "Host=localhost;Port=5432;Database=sciad;Username=sciad;Password=sciad123";

        var options = new DbContextOptionsBuilder<SciadDbContext>()
            .UseNpgsql(connection, npgsql => npgsql.MigrationsAssembly(typeof(SciadDbContext).Assembly.FullName))
            .UseSnakeCaseNamingConvention()
            .Options;

        return new SciadDbContext(options);
    }
}
