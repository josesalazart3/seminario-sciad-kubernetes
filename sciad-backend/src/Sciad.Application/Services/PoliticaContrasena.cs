namespace Sciad.Application.Services;

/// <summary>
/// Política de contraseñas fuertes para cuentas privilegiadas creadas por configuración (administrador inicial, OWASP A07).
/// No cambia la validación de los formularios existentes (mínimo 8 caracteres, PG2); se aplica a la contraseña del
/// administrador inicial que se declara por variable de entorno en producción.
/// </summary>
public static class PoliticaContrasena
{
    public const int LongitudMinima = 12;

    private static readonly string[] Conocidas =
    {
        "sciad123", "password", "contraseña", "admin123", "12345678", "qwerty123", "letmein", "welcome1", "changeme",
    };

    public static bool EsFuerte(string? contrasena, out string motivo)
    {
        motivo = string.Empty;
        if (string.IsNullOrEmpty(contrasena) || contrasena.Length < LongitudMinima)
        {
            motivo = $"debe tener al menos {LongitudMinima} caracteres";
            return false;
        }

        var minuscula = contrasena.Any(char.IsLower);
        var mayuscula = contrasena.Any(char.IsUpper);
        var digito = contrasena.Any(char.IsDigit);
        var simbolo = contrasena.Any(c => !char.IsLetterOrDigit(c));
        if (!(minuscula && mayuscula && digito && simbolo))
        {
            motivo = "debe incluir mayúsculas, minúsculas, números y un símbolo";
            return false;
        }

        var normal = contrasena.ToLowerInvariant();
        if (Conocidas.Any(k => normal.Contains(k, StringComparison.Ordinal)) || contrasena.Distinct().Count() < 6)
        {
            motivo = "es demasiado común o predecible";
            return false;
        }

        return true;
    }
}
