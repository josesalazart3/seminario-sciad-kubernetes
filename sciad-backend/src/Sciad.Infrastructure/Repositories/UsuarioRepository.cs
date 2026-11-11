using Microsoft.EntityFrameworkCore;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Infrastructure.Persistence;

namespace Sciad.Infrastructure.Repositories;

/// <summary>Implementación EF Core de <see cref="IUsuarioRepository"/>.</summary>
public sealed class UsuarioRepository : IUsuarioRepository
{
    private readonly SciadDbContext _db;

    public UsuarioRepository(SciadDbContext db)
    {
        _db = db;
    }

    public Task<Usuario?> FindByCorreoAsync(string correo, CancellationToken ct = default)
    {
        return _db.Usuarios
            .Include(u => u.Rol)
            .FirstOrDefaultAsync(u => u.Correo.ToLower() == correo.ToLower(), ct);
    }

    public Task<Usuario?> FindByIdAsync(int id, CancellationToken ct = default)
    {
        return _db.Usuarios
            .Include(u => u.Rol)
            .FirstOrDefaultAsync(u => u.Id == id, ct);
    }

    public Task<(IReadOnlyList<Usuario> Items, int Total)> ListarPaginadoAsync(
        int pagina, int tamanoPagina, CancellationToken ct = default)
        => ListarPaginadoAsync(null, pagina, tamanoPagina, ct);

    public Task<int> ContarAdministradoresActivosAsync(int? excluirId = null, CancellationToken ct = default)
        => _db.Usuarios.CountAsync(
            u => u.Estado == "activo" && u.Rol.Codigo == "ADMIN" && (excluirId == null || u.Id != excluirId), ct);

    public async Task<(IReadOnlyList<Usuario> Items, int Total)> ListarPaginadoAsync(
        string? estado, int pagina, int tamanoPagina, CancellationToken ct = default)
    {
        IQueryable<Usuario> query = _db.Usuarios.AsNoTracking().Include(u => u.Rol);
        if (!string.IsNullOrWhiteSpace(estado))
        {
            query = query.Where(u => u.Estado == estado);
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderBy(u => u.Id)
            .Skip((pagina - 1) * tamanoPagina)
            .Take(tamanoPagina)
            .ToListAsync(ct);
        return (items, total);
    }

    public Task<bool> ExisteCorreoAsync(string correo, int? excluirId = null, CancellationToken ct = default)
    {
        var normalizado = correo.Trim().ToLowerInvariant();
        var query = _db.Usuarios.Where(u => u.Correo.ToLower() == normalizado);
        if (excluirId.HasValue)
        {
            query = query.Where(u => u.Id != excluirId.Value);
        }

        return query.AnyAsync(ct);
    }

    public Task<Rol?> FindRolByCodigoAsync(string codigo, CancellationToken ct = default)
    {
        var normalizado = codigo.Trim().ToUpperInvariant();
        return _db.Roles.FirstOrDefaultAsync(r => r.Codigo.ToUpper() == normalizado, ct);
    }

    public Task<Usuario?> ObtenerActivoPorRolAsync(string rolCodigo, CancellationToken ct = default)
    {
        var normalizado = rolCodigo.Trim().ToUpperInvariant();
        return _db.Usuarios
            .Include(u => u.Rol)
            .FirstOrDefaultAsync(u => u.Estado == "activo" && u.Rol.Codigo == normalizado, ct);
    }

    public async Task<Usuario> AgregarAsync(Usuario usuario, CancellationToken ct = default)
    {
        _db.Usuarios.Add(usuario);
        await _db.SaveChangesAsync(ct);
        return usuario;
    }

    public async Task<Usuario> ActualizarAsync(Usuario usuario, CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
        return usuario;
    }
}
