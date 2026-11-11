using System.Text.RegularExpressions;

namespace Sciad.Application.Services;

/// <summary>
/// Reglas de datos de una persona (Fase 8). El backend es la fuente de verdad; el frontend repite las mismas reglas
/// solo para dar mensajes inmediatos.
/// <list type="bullet">
/// <item>DPI: se quitan espacios y guiones; deben quedar exactamente 13 dígitos, no todos iguales, y los dígitos 10–11
/// (código de departamento) entre 01 y 22. No se valida dígito verificador ni municipio (riesgo de rechazar DPI reales).</item>
/// <item>Nombre: se recorta y se colapsan espacios; 3 a 120 caracteres; solo letras (con tildes, ñ, ü), espacios,
/// apóstrofo, punto y guion. No se alteran mayúsculas.</item>
/// </list>
/// </summary>
public static partial class ValidacionPersona
{
    public const int LongitudDpi = 13;
    public const int NombreMinimo = 3;
    public const int NombreMaximo = 120;

    [GeneratedRegex(@"^[0-9]{13}$")]
    private static partial Regex DpiRegex();

    [GeneratedRegex(@"^(?=.*\p{L})[\p{L}\p{M}' .\-]+$")]
    private static partial Regex NombreRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex EspaciosRegex();

    /// <summary>Quita espacios y guiones del DPI (los demás caracteres se dejan para que la validación los rechace).</summary>
    public static string NormalizarDpi(string? dpi)
        => new((dpi ?? string.Empty).Where(c => !char.IsWhiteSpace(c) && c != '-').ToArray());

    /// <summary>Recorta y colapsa espacios repetidos del nombre.</summary>
    public static string NormalizarNombre(string? nombre)
        => EspaciosRegex().Replace((nombre ?? string.Empty).Trim(), " ");

    public static bool DpiValido(string dpiNormalizado, out string motivo)
    {
        motivo = string.Empty;
        if (!DpiRegex().IsMatch(dpiNormalizado))
        {
            motivo = "El DPI debe tener exactamente 13 dígitos numéricos.";
            return false;
        }

        if (dpiNormalizado.Distinct().Count() == 1)
        {
            motivo = "El DPI no puede tener todos los dígitos iguales.";
            return false;
        }

        var departamento = int.Parse(dpiNormalizado.Substring(9, 2));
        if (departamento is < 1 or > 22)
        {
            motivo = "El DPI no es válido: el código de departamento (dígitos 10 y 11) debe estar entre 01 y 22.";
            return false;
        }

        return true;
    }

    public static bool NombreValido(string nombreNormalizado, out string motivo)
    {
        motivo = string.Empty;
        if (nombreNormalizado.Length is < NombreMinimo or > NombreMaximo)
        {
            motivo = $"El nombre debe tener entre {NombreMinimo} y {NombreMaximo} caracteres.";
            return false;
        }

        if (!NombreRegex().IsMatch(nombreNormalizado))
        {
            motivo = "El nombre solo puede contener letras, espacios, apóstrofo, punto y guion (sin números ni símbolos).";
            return false;
        }

        return true;
    }
}
