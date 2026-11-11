namespace Sciad.Domain.Entities;

/// <summary>
/// Usuario del sistema (login). Referencia DERCAS §7.2 — tabla `usuarios`.
/// Campos adicionales que el frontend ya espera: <c>puesto</c> y <c>fecha_creacion</c>
/// (ver bitácora 2A). <c>avatarInitials</c> no se persiste: se deriva del nombre.
/// </summary>
public class Usuario
{
    public int Id { get; set; }

    /// <summary>Nombre completo. VARCHAR(120) NOT NULL.</summary>
    public string Nombre { get; set; } = null!;

    /// <summary>Correo institucional de login. UNIQUE, NOT NULL.</summary>
    public string Correo { get; set; } = null!;

    /// <summary>Hash bcrypt (cost 10). Nunca texto plano.</summary>
    public string PasswordHash { get; set; } = null!;

    public int RolId { get; set; }
    public Rol Rol { get; set; } = null!;

    /// <summary>Alta/baja lógica: "activo" | "inactivo".</summary>
    public string Estado { get; set; } = "activo";

    /// <summary>Puesto/cargo del usuario (agregado para compatibilidad con el frontend).</summary>
    public string Puesto { get; set; } = string.Empty;

    /// <summary>Fecha de creación (agregado para compatibilidad con el frontend).</summary>
    public DateTime FechaCreacion { get; set; } = DateTime.UtcNow;

    public ICollection<RegistroAcceso> Registros { get; set; } = new List<RegistroAcceso>();
    public ICollection<Reporte> Reportes { get; set; } = new List<Reporte>();
    public ICollection<Notificacion> Notificaciones { get; set; } = new List<Notificacion>();
}
