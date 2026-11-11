namespace Sciad.Application.Services;

/// <summary>Códigos de error de dominio mapeables a respuestas HTTP consistentes.</summary>
public static class CodigosError
{
    /// <summary>→ 404 Not Found.</summary>
    public const string NoEncontrado = "NO_ENCONTRADO";

    /// <summary>→ 409 Conflict (unicidad, estado ya ocupado, etc.).</summary>
    public const string Conflicto = "CONFLICTO";

    /// <summary>→ 400 Bad Request (validación de negocio).</summary>
    public const string Validacion = "VALIDACION";

    // --- Códigos específicos del escaneo QR (CU-04). Todos → 400, pero con `code`
    //     identificable por el frontend (no solo el status HTTP) para el feedback rojo.
    //     Fase 2C. ---
    /// <summary>El token no corresponde a ninguna credencial existente → 400.</summary>
    public const string TokenInvalido = "TOKEN_INVALIDO";

    /// <summary>La credencial está revocada/vencida (intento de reuso → notificación) → 400.</summary>
    public const string CredencialRevocada = "CREDENCIAL_REVOCADA";

    /// <summary>La persona titular de la credencial está inactiva → 400.</summary>
    public const string PersonaInactiva = "PERSONA_INACTIVA";

    /// <summary>La zona no existe, está inactiva, o la persona no tiene perfil para ella → 400.</summary>
    public const string ZonaNoAutorizada = "ZONA_NO_AUTORIZADA";

    /// <summary>La persona tiene perfil para la zona pero su vigencia no cubre la fecha → 400 (dispara notificación fuera_horario).</summary>
    public const string FueraVigencia = "FUERA_VIGENCIA";
}

/// <summary>
/// Resultado de una operación de servicio: <see cref="Exitoso"/> con <see cref="Dato"/>
/// en el caso feliz, o <see cref="CodigoError"/> + <see cref="Mensaje"/> en el fallo.
/// El controlador mapea el código a una respuesta RFC 7807 vía <c>ApiProblem.FromServicio</c>.
/// </summary>
public sealed record ServicioResultado<T>(bool Exitoso, T? Dato = default, string? CodigoError = null, string? Mensaje = null)
{
    public static ServicioResultado<T> Ok(T dato) => new(true, dato);
    public static ServicioResultado<T> Fallo(string codigo, string mensaje) => new(false, default, codigo, mensaje);
}