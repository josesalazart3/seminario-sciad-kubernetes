using Microsoft.EntityFrameworkCore;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Infrastructure.Persistence;

namespace Sciad.Infrastructure.Repositories;

/// <summary>Implementación EF Core de <see cref="IReporteRepository"/>.</summary>
public sealed class ReporteRepository : IReporteRepository
{
    private readonly SciadDbContext _db;

    public ReporteRepository(SciadDbContext db)
    {
        _db = db;
    }

    public async Task<Reporte> AgregarAsync(Reporte reporte, CancellationToken ct = default)
    {
        _db.Reportes.Add(reporte);
        await _db.SaveChangesAsync(ct);
        // Relectura con el usuario incluido para devolver el metadato completo al cliente.
        return await _db.Reportes.AsNoTracking()
            .Include(r => r.Usuario)
            .FirstAsync(r => r.Id == reporte.Id, ct);
    }

    public async Task<(IReadOnlyList<Reporte> Items, int Total)> ListarPaginadoAsync(
        int pagina, int tamanoPagina, CancellationToken ct = default)
    {
        var query = _db.Reportes.AsNoTracking()
            .Include(r => r.Usuario);
        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(r => r.Id)
            .Skip((pagina - 1) * tamanoPagina).Take(tamanoPagina)
            .ToListAsync(ct);
        return (items, total);
    }
}