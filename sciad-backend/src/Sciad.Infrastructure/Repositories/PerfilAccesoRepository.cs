using Microsoft.EntityFrameworkCore;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Infrastructure.Persistence;

namespace Sciad.Infrastructure.Repositories;

/// <summary>Implementación EF Core de <see cref="IPerfilAccesoRepository"/>.</summary>
public sealed class PerfilAccesoRepository : IPerfilAccesoRepository
{
    private readonly SciadDbContext _db;

    public PerfilAccesoRepository(SciadDbContext db)
    {
        _db = db;
    }

    public Task<PerfilAcceso?> FindByIdAsync(int id, CancellationToken ct = default)
        => _db.PerfilesAcceso
            .Include(p => p.Persona)
            .Include(p => p.Zona)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<List<PerfilAcceso>> ListarAsync(
        int? personaId, int? zonaId, CancellationToken ct = default)
    {
        IQueryable<PerfilAcceso> query = _db.PerfilesAcceso.AsNoTracking()
            .Include(p => p.Persona)
            .Include(p => p.Zona);

        if (personaId.HasValue)
        {
            query = query.Where(p => p.PersonaId == personaId.Value);
        }

        if (zonaId.HasValue)
        {
            query = query.Where(p => p.ZonaId == zonaId.Value);
        }

        return await query.OrderBy(p => p.PersonaId).ThenBy(p => p.ZonaId).ToListAsync(ct);
    }

    public async Task<PerfilAcceso> AgregarAsync(PerfilAcceso perfil, CancellationToken ct = default)
    {
        _db.PerfilesAcceso.Add(perfil);
        await _db.SaveChangesAsync(ct);
        return perfil;
    }

    public async Task EliminarAsync(PerfilAcceso perfil, CancellationToken ct = default)
    {
        _db.PerfilesAcceso.Remove(perfil);
        await _db.SaveChangesAsync(ct);
    }
}
