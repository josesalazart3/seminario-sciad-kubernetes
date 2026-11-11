using Microsoft.EntityFrameworkCore;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Infrastructure.Persistence;

namespace Sciad.Infrastructure.Repositories;

/// <summary>Implementación EF Core de <see cref="ICredencialRepository"/>.</summary>
public sealed class CredencialRepository : ICredencialRepository
{
    private readonly SciadDbContext _db;

    public CredencialRepository(SciadDbContext db)
    {
        _db = db;
    }

    public Task<CredencialQr?> FindByIdAsync(int id, CancellationToken ct = default)
        => _db.CredencialesQr
            .Include(c => c.Persona)
            .FirstOrDefaultAsync(c => c.Id == id, ct);

    public Task<CredencialQr?> ObtenerActivaPorPersonaAsync(int personaId, CancellationToken ct = default)
        => _db.CredencialesQr.FirstOrDefaultAsync(c => c.PersonaId == personaId && c.Estado == "activa", ct);

    public async Task<List<CredencialQr>> ListarPorPersonaAsync(int personaId, CancellationToken ct = default)
        => await _db.CredencialesQr.AsNoTracking()
            .Include(c => c.Persona)
            .Where(c => c.PersonaId == personaId)
            .OrderByDescending(c => c.Id)
            .ToListAsync(ct);

    public async Task<List<CredencialQr>> ListarAsync(CancellationToken ct = default)
        => await _db.CredencialesQr.AsNoTracking()
            .Include(c => c.Persona)
            .OrderByDescending(c => c.Id)
            .ToListAsync(ct);

    public async Task<CredencialQr> AgregarAsync(CredencialQr credencial, CancellationToken ct = default)
    {
        _db.CredencialesQr.Add(credencial);
        await _db.SaveChangesAsync(ct);
        return credencial;
    }

    public async Task<CredencialQr> ActualizarAsync(CredencialQr credencial, CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
        return credencial;
    }

    public async Task<CredencialQr> ReemitirAsync(CredencialQr anterior, CredencialQr nueva, CancellationToken ct = default)
    {
        // `anterior` viene rastreada por FindByIdAsync; un único SaveChanges es atómico (transacción implícita de EF Core).
        _db.CredencialesQr.Add(nueva);
        await _db.SaveChangesAsync(ct);
        return nueva;
    }
}
