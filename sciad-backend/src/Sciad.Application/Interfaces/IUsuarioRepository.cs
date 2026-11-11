using Sciad.Domain.Entities;

namespace Sciad.Application.Interfaces;

/// <summary>
/// Acceso a usuarios: autenticación (lectura) + CRUD administrativo. Implementado en Infrastructure (EF Core).
/// </summary>
public interface IUsuarioRepository
{
    /// <summary>Busca por correo (insensible a mayúsculas), incluyendo el rol.</summary>
    Task<Usuario?> FindByCorreoAsync(string correo, CancellationToken ct = default);

    /// <summary>Busca por id incluyendo el rol.</summary>
    Task<Usuario?> FindByIdAsync(int id, CancellationToken ct = default);

    /// <summary>Lista paginada de usuarios (con rol) y total de registros que coinciden.</summary>
    Task<(IReadOnlyList<Usuario> Items, int Total)> ListarPaginadoAsync(
        int pagina, int tamanoPagina, CancellationToken ct = default);

    /// <summary>Igual, filtrando por estado (<c>null</c> = todos). Fase 8.4.</summary>
    Task<(IReadOnlyList<Usuario> Items, int Total)> ListarPaginadoAsync(
        string? estado, int pagina, int tamanoPagina, CancellationToken ct = default);

    /// <summary>Cuántos administradores activos hay, sin contar <paramref name="excluirId"/>. Fase 8.4.</summary>
    Task<int> ContarAdministradoresActivosAsync(int? excluirId = null, CancellationToken ct = default);

    /// <summary>¿Existe un usuario con este correo? Si <paramref name="excluirId"/> se pasa, lo ignora (útil para edición).</summary>
    Task<bool> ExisteCorreoAsync(string correo, int? excluirId = null, CancellationToken ct = default);

    /// <summary>Busca un rol por su código de máquina (ADMIN/SEGURIDAD/GERENCIA).</summary>
    Task<Rol?> FindRolByCodigoAsync(string codigo, CancellationToken ct = default);

    /// <summary>
    /// Primer usuario activo con el rol indicado (por código), incluido el rol.
    /// Usado por el escaneo QR (2C) para dirigir la notificación automática a Gerencia.
    /// </summary>
    Task<Usuario?> ObtenerActivoPorRolAsync(string rolCodigo, CancellationToken ct = default);

    Task<Usuario> AgregarAsync(Usuario usuario, CancellationToken ct = default);

    /// <summary>Persiste los cambios de una entidad ya rastreada por el contexto.</summary>
    Task<Usuario> ActualizarAsync(Usuario usuario, CancellationToken ct = default);
}