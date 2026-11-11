namespace Sciad.Domain.Entities;

/// <summary>
/// Rol del sistema (RBAC). Referencia DERCAS §7.2 — tabla `roles`.
/// <c>Codigo</c> es el valor máquina que el frontend espera
/// (<c>ADMIN | SEGURIDAD | GERENCIA</c>); <c>Nombre</c> es la etiqueta legible.
/// </summary>
public class Rol
{
    public int Id { get; set; }

    /// <summary>Etiqueta legible p. ej. "Administrador". UNIQUE.</summary>
    public string Nombre { get; set; } = null!;

    /// <summary>Código máquina p. ej. "ADMIN". UNIQUE. Compatible con el modelo TS <c>Rol</c> del frontend.</summary>
    public string Codigo { get; set; } = null!;

    public ICollection<Usuario> Usuarios { get; set; } = new List<Usuario>();
}
