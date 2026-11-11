using System.Text;

namespace Sciad.Application.Dtos.Auth;

/// <summary>
/// Representación del usuario tal como la espera el frontend
/// (modelo TS <c>Usuario</c>: id, nombre, email, rol, puesto, activo, avatarInitials, fechaCreacion).
/// <c>id</c> se serializa como string para coincidir con el tipo <c>id: string</c> del frontend
/// (el PK en BD es entero; se convierte al mapear).
/// </summary>
public sealed record UsuarioDto(
    string Id,
    string Nombre,
    string Email,
    string Rol,
    string Puesto,
    bool Activo,
    string AvatarInitials,
    DateTime FechaCreacion)
{
    /// <summary>Deriva las iniciales para el avatar a partir del nombre (campo de UI del frontend).</summary>
    public static string Iniciales(string nombre)
    {
        if (string.IsNullOrWhiteSpace(nombre))
        {
            return "?";
        }

        var partes = nombre.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (partes.Length == 1)
        {
            return partes[0][..Math.Min(2, partes[0].Length)].ToUpperInvariant();
        }

        var iniciales = new StringBuilder();
        iniciales.Append(partes[0][0]);
        iniciales.Append(partes[^1][0]);
        return iniciales.ToString().ToUpperInvariant();
    }

    public static UsuarioDto From(Domain.Entities.Usuario u)
    {
        return new UsuarioDto(
            Id: u.Id.ToString(),
            Nombre: u.Nombre,
            Email: u.Correo,
            Rol: u.Rol.Codigo,
            Puesto: u.Puesto,
            Activo: string.Equals(u.Estado, "activo", StringComparison.OrdinalIgnoreCase),
            AvatarInitials: Iniciales(u.Nombre),
            FechaCreacion: u.FechaCreacion);
    }
}
