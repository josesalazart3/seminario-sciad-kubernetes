namespace Sciad.Application.Services;

/// <summary>
/// Filtro de estado común de los listados de usuarios, personas y zonas (Fase 8.4): <c>?estado=activo|inactivo|todos</c>.
/// Por defecto (sin parámetro) se listan solo los <c>activo</c>; <c>todos</c> no filtra. Nada se borra físicamente
/// (RNF-06): "deshabilitar" es la baja lógica <c>estado = inactivo</c>.
/// </summary>
public static class FiltroEstado
{
    public const string Activo = "activo";
    public const string Inactivo = "inactivo";
    public const string Todos = "todos";

    /// <summary>
    /// Traduce el parámetro de la URL al filtro del repositorio: <c>"activo"</c>, <c>"inactivo"</c> o <c>null</c> (todos).
    /// Devuelve false (con el mensaje) si el valor no es válido.
    /// </summary>
    public static bool Interpretar(string? valor, out string? filtro, out string mensaje)
    {
        mensaje = string.Empty;
        var v = valor?.Trim().ToLowerInvariant();
        switch (v)
        {
            case null or "":
            case Activo:
                filtro = Activo;
                return true;
            case Inactivo:
                filtro = Inactivo;
                return true;
            case Todos:
                filtro = null;
                return true;
            default:
                filtro = null;
                mensaje = "El estado debe ser 'activo', 'inactivo' o 'todos'.";
                return false;
        }
    }
}
