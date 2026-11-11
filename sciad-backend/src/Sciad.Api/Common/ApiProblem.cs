using Microsoft.AspNetCore.Mvc;
using Sciad.Application.Services;

namespace Sciad.Api.Common;

/// <summary>
/// Fábrica de respuestas de error consistentes (RFC 7807 Problem Details).
/// Se incluye <c>code</c> y <c>message</c> para mantener compatibilidad con el
/// contrato de error que el frontend ya esperaba del mock (<c>{ message }</c>).
/// </summary>
public static class ApiProblem
{
    public static ObjectResult Unauthorized(string message) =>
        Problem(StatusCodes.Status401Unauthorized, "No autorizado", message, "UNAUTHORIZED");

    public static ObjectResult Forbidden(string message) =>
        Problem(StatusCodes.Status403Forbidden, "Acceso denegado", message, "FORBIDDEN");

    public static ObjectResult NotFound(string message) =>
        Problem(StatusCodes.Status404NotFound, "No encontrado", message, "NOT_FOUND");

    public static ObjectResult Conflict(string message) =>
        Problem(StatusCodes.Status409Conflict, "Conflicto", message, "CONFLICT");

    public static ObjectResult BadRequest(string message, string code) =>
        Problem(StatusCodes.Status400BadRequest, "Solicitud inválida", message, code);

    /// <summary>
    /// Mapea un <see cref="ServicioResultado{T}"/> fallido a una respuesta Problem Details:
    /// el <see cref="CodigosError"/> decide el código HTTP (404/409/400). En el branch de 400 se
    /// propaga el <see cref="CodigosError"/> específico (p. ej. <c>TOKEN_INVALIDO</c>) como
    /// <c>code</c>, no solo el genérico VALIDACIÓN, para que el frontend identifique el motivo
    /// exacto del rechazo de un escaneo (CU-04).
    /// </summary>
    public static ObjectResult FromServicio<T>(ServicioResultado<T> resultado)
    {
        return resultado.CodigoError switch
        {
            CodigosError.NoEncontrado => NotFound(resultado.Mensaje ?? "Recurso no encontrado."),
            CodigosError.Conflicto => Conflict(resultado.Mensaje ?? "Conflicto con un recurso existente."),
            _ => BadRequest(resultado.Mensaje ?? "Solicitud inválida.", resultado.CodigoError ?? CodigosError.Validacion),
        };
    }

    private static ObjectResult Problem(int status, string title, string detail, string code)
    {
        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
        };
        problem.Extensions["code"] = code;
        problem.Extensions["message"] = detail;
        return new ObjectResult(problem) { StatusCode = status };
    }
}
