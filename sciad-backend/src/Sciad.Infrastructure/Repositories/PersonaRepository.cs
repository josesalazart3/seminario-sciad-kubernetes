using Microsoft.EntityFrameworkCore;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Infrastructure.Persistence;

namespace Sciad.Infrastructure.Repositories;

/// <summary>Implementación EF Core de <see cref="IPersonaRepository"/>.</summary>
public sealed class PersonaRepository : IPersonaRepository
{
    private readonly SciadDbContext _db;

    public PersonaRepository(SciadDbContext db)
    {
        _db = db;
    }

    public Task<Persona?> FindByIdAsync(int id, CancellationToken ct = default)
        => _db.Personas.FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<(IReadOnlyList<Persona> Items, int Total)> ListarPaginadoAsync(
        int? tipo, string? estado, int pagina, int tamanoPagina, CancellationToken ct = default)
    {
        var query = _db.Personas.AsNoTracking();
        if (tipo.HasValue)
        {
            query = query.Where(p => p.Tipo == tipo.Value);
        }

        if (!string.IsNullOrWhiteSpace(estado))
        {
            query = query.Where(p => p.Estado == estado);
        }

        var total = await query.CountAsync(ct);
        // Más recientes primero: con orden ascendente, una persona recién creada quedaba fuera de la primera página
        // (la interfaz pide una sola página) y "no aparecía" en la lista aunque se hubiera guardado (Fase 8).
        var items = await query
            .OrderByDescending(p => p.Id)
            .Skip((pagina - 1) * tamanoPagina)
            .Take(tamanoPagina)
            .ToListAsync(ct);
        return (items, total);
    }

    public Task<bool> ExisteDpiAsync(string dpiCodigo, int? excluirId = null, CancellationToken ct = default)
    {
        var normalizado = dpiCodigo.Trim();
        var query = _db.Personas.Where(p => p.DpiCodigo == normalizado);
        if (excluirId.HasValue)
        {
            query = query.Where(p => p.Id != excluirId.Value);
        }

        return query.AnyAsync(ct);
    }

    public async Task<Persona> AgregarAsync(Persona persona, CancellationToken ct = default)
    {
        _db.Personas.Add(persona);
        await _db.SaveChangesAsync(ct);
        return persona;
    }

    public async Task<Persona> ActualizarAsync(Persona persona, CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
        return persona;
    }
}
