using Microsoft.EntityFrameworkCore;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Infrastructure.Persistence;

namespace Sciad.Infrastructure.Repositories;

/// <summary>Implementación EF Core de <see cref="IZonaRepository"/>.</summary>
public sealed class ZonaRepository : IZonaRepository
{
    private readonly SciadDbContext _db;

    public ZonaRepository(SciadDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<ZonaAcceso>> ListarAsync(CancellationToken ct = default)
        => await _db.ZonasAcceso.AsNoTracking().OrderBy(z => z.Id).ToListAsync(ct);

    public Task<ZonaAcceso?> FindByIdAsync(int id, CancellationToken ct = default)
        => _db.ZonasAcceso.FirstOrDefaultAsync(z => z.Id == id, ct);

    public async Task<ZonaAcceso> AgregarAsync(ZonaAcceso zona, CancellationToken ct = default)
    {
        _db.ZonasAcceso.Add(zona);
        await _db.SaveChangesAsync(ct);
        return zona;
    }

    public async Task<ZonaAcceso> ActualizarAsync(ZonaAcceso zona, CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
        return zona;
    }
}
