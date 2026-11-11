using Microsoft.EntityFrameworkCore;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Infrastructure.Persistence;

namespace Sciad.Infrastructure.Repositories;

/// <summary>Implementación EF Core de <see cref="INotificacionRepository"/>.</summary>
public sealed class NotificacionRepository : INotificacionRepository
{
    private readonly SciadDbContext _db;

    public NotificacionRepository(SciadDbContext db)
    {
        _db = db;
    }

    public async Task<(IReadOnlyList<Notificacion> Items, int Total)> ListarAsync(
        int? usuarioId, bool? leida, int pagina, int tamanoPagina, CancellationToken ct = default)
    {
        var query = _db.Notificaciones.AsNoTracking()
            .Include(n => n.Persona)
            .AsQueryable();

        if (usuarioId.HasValue) query = query.Where(n => n.UsuarioId == usuarioId.Value);
        if (leida.HasValue) query = query.Where(n => n.Leida == leida.Value);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(n => n.Id)
            .Skip((pagina - 1) * tamanoPagina).Take(tamanoPagina)
            .ToListAsync(ct);
        return (items, total);
    }

    public async Task<Notificacion> AgregarAsync(Notificacion notificacion, CancellationToken ct = default)
    {
        _db.Notificaciones.Add(notificacion);
        await _db.SaveChangesAsync(ct);
        return notificacion;
    }

    public Task<Notificacion?> FindByIdAsync(int id, CancellationToken ct = default)
        => _db.Notificaciones.FirstOrDefaultAsync(n => n.Id == id, ct);

    public async Task<Notificacion> ActualizarAsync(Notificacion notificacion, CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
        return notificacion;
    }
}