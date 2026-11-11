using Microsoft.EntityFrameworkCore;
using Npgsql;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Infrastructure.Persistence;

namespace Sciad.Infrastructure.Repositories;

/// <summary>
/// Implementación EF Core de <see cref="IRegistroAccesoRepository"/>. El insert de un acceso usa una
/// transacción explícita (RNF-06) y traduce la violación del índice UNIQUE <c>uq_ingreso_diario</c>
/// (23505) a <c>null</c>: dos escaneos casi simultáneos de la misma persona el mismo día no pueden
/// crear dos ingresos — la restricción de base de datos es la última línea de defensa y quien llama
/// la convierte en 409, no en 500. Las consultas de historial (CU-06) y de auditoría (CU-08) leen sin
/// seguimiento de cambio (<c>AsNoTracking</c>) porque son de solo lectura.
/// </summary>
public sealed class RegistroAccesoRepository : IRegistroAccesoRepository
{
    private readonly SciadDbContext _db;

    public RegistroAccesoRepository(SciadDbContext db)
    {
        _db = db;
    }

    public async Task<RegistroAcceso?> RegistrarConTransaccionAsync(
        RegistroAcceso registro, Notificacion? notificacion, CancellationToken ct = default)
    {
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        _db.RegistrosAcceso.Add(registro);
        if (notificacion is not null)
        {
            _db.Notificaciones.Add(notificacion);
        }

        try
        {
            await _db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return registro;
        }
        catch (DbUpdateException ex) when (EsViolacionUnica(ex))
        {
            // Doble ingreso el mismo día (persona + fecha + tipo='ingreso'): carrera ganada por otro
            // request. Se revierte la transacción y se informa como conflicto, no como error 500.
            return null;
        }
    }

    public async Task AgregarNotificacionAsync(Notificacion notificacion, CancellationToken ct = default)
    {
        _db.Notificaciones.Add(notificacion);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<(int Ingresos, int Egresos)> ContarMovimientosAsync(
        int personaId, int zonaId, DateOnly fecha, CancellationToken ct = default)
    {
        var registros = await _db.RegistrosAcceso.AsNoTracking()
            .Where(r => r.PersonaId == personaId && r.ZonaId == zonaId && r.Fecha == fecha)
            .Select(r => r.Tipo)
            .ToListAsync(ct);

        var ingresos = registros.Count(t => t == "ingreso");
        var egresos = registros.Count(t => t == "egreso");
        return (ingresos, egresos);
    }

    public async Task<List<RegistroAcceso>> ListarDelDiaAsync(
        int? zonaId, DateOnly fecha, CancellationToken ct = default)
    {
        var query = _db.RegistrosAcceso.AsNoTracking()
            .Include(r => r.Persona)
            .Include(r => r.Zona)
            .Include(r => r.Usuario)
            .Where(r => r.Fecha == fecha);

        if (zonaId.HasValue)
        {
            query = query.Where(r => r.ZonaId == zonaId.Value);
        }

        return await query.OrderBy(r => r.Hora).ToListAsync(ct);
    }

    public async Task<(IReadOnlyList<RegistroAcceso> Items, int Total)> ListarHistorialAsync(
        int? personaId, int? zonaId, DateOnly? desde, DateOnly? hasta, string? tipo,
        int pagina, int tamanoPagina, CancellationToken ct = default)
    {
        var query = _db.RegistrosAcceso.AsNoTracking()
            .Include(r => r.Persona)
            .Include(r => r.Zona)
            .Include(r => r.Usuario)
            .AsQueryable();

        if (personaId.HasValue) query = query.Where(r => r.PersonaId == personaId.Value);
        if (zonaId.HasValue) query = query.Where(r => r.ZonaId == zonaId.Value);
        if (desde.HasValue) query = query.Where(r => r.Fecha >= desde.Value);
        if (hasta.HasValue) query = query.Where(r => r.Fecha <= hasta.Value);
        if (!string.IsNullOrWhiteSpace(tipo)) query = query.Where(r => r.Tipo == tipo.Trim().ToLowerInvariant());

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(r => r.Fecha).ThenByDescending(r => r.Hora)
            .Skip((pagina - 1) * tamanoPagina).Take(tamanoPagina)
            .ToListAsync(ct);
        return (items, total);
    }

    public async Task<List<RegistroAcceso>> ListarParaReporteAsync(
        int? personaId, int? zonaId, DateOnly? desde, DateOnly? hasta, string? tipo,
        CancellationToken ct = default)
    {
        var query = _db.RegistrosAcceso.AsNoTracking()
            .Include(r => r.Persona)
            .Include(r => r.Zona)
            .Include(r => r.Usuario)
            .AsQueryable();

        if (personaId.HasValue) query = query.Where(r => r.PersonaId == personaId.Value);
        if (zonaId.HasValue) query = query.Where(r => r.ZonaId == zonaId.Value);
        if (desde.HasValue) query = query.Where(r => r.Fecha >= desde.Value);
        if (hasta.HasValue) query = query.Where(r => r.Fecha <= hasta.Value);
        if (!string.IsNullOrWhiteSpace(tipo)) query = query.Where(r => r.Tipo == tipo.Trim().ToLowerInvariant());

        return await query
            .OrderBy(r => r.Fecha).ThenBy(r => r.Hora)
            .ToListAsync(ct);
    }

    public async Task<List<RegistroAcceso>> IngresosSinEgresoAsync(
        DateOnly fechaCorte, CancellationToken ct = default)
    {
        return await _db.RegistrosAcceso.AsNoTracking()
            .Include(r => r.Persona)
            .Where(r => r.Tipo == "ingreso" && r.Fecha < fechaCorte)
            .GroupBy(r => new { r.PersonaId, r.Fecha })
            .Where(g => !_db.RegistrosAcceso.Any(e =>
                e.PersonaId == g.Key.PersonaId && e.Fecha == g.Key.Fecha && e.Tipo == "egreso"))
            .Select(g => g.First())
            .ToListAsync(ct);
    }

    public async Task<List<RegistroAcceso>> RegistrosDuplicadosAsync(CancellationToken ct = default)
    {
        return await _db.RegistrosAcceso.AsNoTracking()
            .Include(r => r.Persona)
            .GroupBy(r => new { r.PersonaId, r.Fecha, r.Tipo })
            .Where(g => g.Count() > 1)
            .Select(g => g.First())
            .ToListAsync(ct);
    }

    public async Task<List<RegistroAcceso>> RegistrosInconsistentesAsync(CancellationToken ct = default)
    {
        return await _db.RegistrosAcceso.AsNoTracking()
            .Where(r => !_db.Personas.Any(p => p.Id == r.PersonaId)
                     || !_db.ZonasAcceso.Any(z => z.Id == r.ZonaId)
                     || !_db.Usuarios.Any(u => u.Id == r.UsuarioId))
            .Select(r => new RegistroAcceso { Id = r.Id, PersonaId = r.PersonaId })
            .ToListAsync(ct);
    }

    public async Task<List<RegistroAcceso>> ListarIngresosDelDiaAsync(
        DateOnly fecha, CancellationToken ct = default)
    {
        return await _db.RegistrosAcceso.AsNoTracking()
            .Include(r => r.Persona)
            .Include(r => r.Zona)
            .Where(r => r.Tipo == "ingreso" && r.Fecha == fecha)
            .OrderBy(r => r.Hora)
            .ToListAsync(ct);
    }

    private static bool EsViolacionUnica(DbUpdateException ex)
    {
        return ex.InnerException is PostgresException { SqlState: "23505" };
    }
}