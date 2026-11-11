namespace Sciad.Application.Options;

/// <summary>
/// Configuración JWT. Los valores se cargan desde variables de entorno
/// (nunca secretos hardcodeados). <see cref="Secreto"/> es obligatorio (fail-fast) y ≥ 32 chars.
/// </summary>
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Secreto { get; set; } = string.Empty;
    public string Emisor { get; set; } = "sciad";
    public string Audiencia { get; set; } = "sciad";
    public double MinutosExpiracion { get; set; } = 480; // 8 horas (RF-10 / RNF-01)

    /// <summary>Valida la configuración; lanza si falta el secreto o es demasiado corto.</summary>
    public void Validar()
    {
        if (string.IsNullOrWhiteSpace(Secreto) || Secreto.Length < 32)
        {
            throw new InvalidOperationException(
                "La variable de entorno SCIAD_JWT_SECRET es obligatoria y debe tener al menos 32 caracteres.");
        }
    }
}
