using Microsoft.EntityFrameworkCore;
using Sciad.Application.Interfaces;
using Sciad.Application.Services;
using Sciad.Domain.Entities;
using Sciad.Infrastructure.Persistence;

namespace Sciad.Infrastructure.Repositories;

/// <summary>Implementación EF Core de <see cref="IAuditoriaRepository"/>. Lecturas sin seguimiento.</summary>
public sealed class AuditoriaRepository : IAuditoriaRepository
{
    private readonly SciadDbContext _db;

    public AuditoriaRepository(SciadDbContext db)
    {
        _db = db;
    }

    public async Task<(IReadOnlyList<Auditoria> Items, int Total)> ListarAsync(
        string? tipo, string? estado, int pagina, int tamanoPagina, CancellationToken ct = default)
    {
        var query = _db.Auditorias.AsNoTracking()
            .Include(a => a.Persona)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(tipo)) query = query.Where(a => a.Tipo == tipo.Trim().ToLowerInvariant());
        if (!string.IsNullOrWhiteSpace(estado)) query = query.Where(a => a.Estado == estado.Trim().ToLowerInvariant());

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(a => a.Fecha).ThenByDescending(a => a.Id)
            .Skip((pagina - 1) * tamanoPagina).Take(tamanoPagina)
            .ToListAsync(ct);
        return (items, total);
    }

    public Task<Auditoria?> FindByIdAsync(int id, CancellationToken ct = default)
        => _db.Auditorias.FirstOrDefaultAsync(a => a.Id == id, ct);

    public async Task<List<Auditoria>> AgregarHallazgosAsync(List<Auditoria> hallazgos, CancellationToken ct = default)
    {
        // Descarta los que ya existen (la verificación corre también cada noche y revisa todos los días anteriores).
        var descripciones = hallazgos
            .Where(h => HallazgosUnicos.EsDeduplicable(h.Tipo))
            .Select(h => h.Descripcion)
            .Distinct()
            .ToList();

        var existentes = new List<(string Tipo, int? PersonaId, string Descripcion)>();
        if (descripciones.Count > 0)
        {
            var filas = await _db.Auditorias.AsNoTracking()
                .Where(a => descripciones.Contains(a.Descripcion))
                .Select(a => new { a.Tipo, a.PersonaId, a.Descripcion })
                .ToListAsync(ct);
            existentes.AddRange(filas.Select(f => (f.Tipo, f.PersonaId, f.Descripcion)));
        }

        var nuevos = HallazgosUnicos.Filtrar(hallazgos, existentes);
        _db.Auditorias.AddRange(nuevos);
        await _db.SaveChangesAsync(ct);
        return nuevos;
    }

    public async Task<Auditoria> ActualizarAsync(Auditoria hallazgo, CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
        return hallazgo;
    }
}