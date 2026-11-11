using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Sciad.Api.Common;

/// <summary>
/// Middleware central de manejo de excepciones no controladas: las convierte en
/// Problem Details (RFC 7807) sin filtrar detalles internos, y loguea la excepción completa.
/// </summary>
public sealed class ErrorHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ErrorHandlingMiddleware> _logger;

    public ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        // Cuerpo de la solicitud mayor al límite de Kestrel (64 KB, Fase 7 OWASP A03/A04): BadHttpRequestException
        // ya trae el StatusCode correcto (413) — sin este caso específico, el catch-all de abajo lo convertía en 500.
        catch (BadHttpRequestException ex) when (!context.Response.HasStarted)
        {
            _logger.LogWarning(ex, "Solicitud rechazada en {Method} {Path}: {Mensaje}", context.Request.Method, context.Request.Path, ex.Message);

            context.Response.StatusCode = ex.StatusCode;
            context.Response.ContentType = JsonDefaults.ContentType;

            var problem = new ProblemDetails
            {
                Status = ex.StatusCode,
                Title = "Solicitud inválida",
                Detail = ex.StatusCode == StatusCodes.Status413PayloadTooLarge
                    ? "El cuerpo de la solicitud excede el tamaño máximo permitido."
                    : "Solicitud inválida.",
            };
            problem.Extensions["code"] = ex.StatusCode == StatusCodes.Status413PayloadTooLarge ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST";
            problem.Extensions["message"] = problem.Detail;

            await context.Response.WriteAsJsonAsync(problem, (JsonSerializerOptions)JsonDefaults.Web, context.RequestAborted);
        }
        // Caracteres no válidos en UTF-8 (p. ej. NUL \u0000) rechazados por PostgreSQL al guardar: es una entrada
        // inválida del cliente (400), no un error del servidor. No cambia el esquema ni las migraciones.
        // 23514 (Fase 8): una restricción CHECK de la BD (p. ej. DPI de 13 dígitos) rechazó el dato; la validación de la
        // API debió detenerlo antes, pero si llega aquí sigue siendo una entrada inválida (400), no un 500.
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "22021" or "23514" } && !context.Response.HasStarted)
        {
            _logger.LogWarning(ex, "Entrada inválida (codificación o restricción CHECK) en {Method} {Path}", context.Request.Method, context.Request.Path);

            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            context.Response.ContentType = JsonDefaults.ContentType;

            var problem = new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Solicitud inválida",
                Detail = "El texto contiene caracteres no válidos.",
            };
            problem.Extensions["code"] = "VALIDACION";
            problem.Extensions["message"] = problem.Detail;

            await context.Response.WriteAsJsonAsync(problem, (JsonSerializerOptions)JsonDefaults.Web, context.RequestAborted);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Excepción no controlada en {Method} {Path}", context.Request.Method, context.Request.Path);

            if (context.Response.HasStarted)
            {
                throw; // No se puede reescribir una respuesta ya iniciada.
            }

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = JsonDefaults.ContentType;

            var problem = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "Error interno del servidor",
                Detail = "Ocurrió un error inesperado. Intente nuevamente.",
            };
            problem.Extensions["traceId"] = context.TraceIdentifier;
            problem.Extensions["code"] = "INTERNAL_ERROR";
            problem.Extensions["message"] = "Ocurrió un error inesperado.";

            await context.Response.WriteAsJsonAsync(problem, (JsonSerializerOptions)JsonDefaults.Web, context.RequestAborted);
        }
    }
}
