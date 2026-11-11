namespace Sciad.Domain.Entities;

/// <summary>
/// Colaborador o visitante controlado. Referencia DERCAS §7.2 — tabla `personas`.
/// </summary>
public class Persona
{
    /// <summary>Tipo INTEGER NOT NULL: 1 = colaborador, 2 = visitante.</summary>
    public const int TipoColaborador = 1;
    public const int TipoVisitante = 2;

    public int Id { get; set; }

    /// <summary>Nombre completo. VARCHAR(120) NOT NULL.</summary>
    public string Nombre { get; set; } = null!;

    /// <summary>Código Único de Identificación (DPI). UNIQUE, NOT NULL.</summary>
    public string DpiCodigo { get; set; } = null!;

    /// <summary>INTEGER NOT NULL — 1 = colaborador, 2 = visitante (CHECK en BD).</summary>
    public int Tipo { get; set; }

    /// <summary>"activo" | "inactivo" (soft delete).</summary>
    public string Estado { get; set; } = "activo";

    public ICollection<PerfilAcceso> Perfiles { get; set; } = new List<PerfilAcceso>();
    public ICollection<CredencialQr> Credenciales { get; set; } = new List<CredencialQr>();
    public ICollection<RegistroAcceso> Registros { get; set; } = new List<RegistroAcceso>();
    public ICollection<Auditoria> Auditorias { get; set; } = new List<Auditoria>();
    public ICollection<Notificacion> Notificaciones { get; set; } = new List<Notificacion>();
}
