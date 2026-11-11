using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Sciad.Api.Common;

/// <summary>
/// Rechaza (400) cualquier texto de la solicitud con caracteres de control (NUL, saltos de línea, tabuladores, ESC…),
/// tanto en parámetros sueltos como en las propiedades de texto de los DTO del cuerpo (Fase 8: datos limpios).
/// El manejo de NUL de <see cref="ErrorHandlingMiddleware"/> (22021 → 400) se mantiene como respaldo.
/// </summary>
public sealed class RechazarCaracteresControlFilter : IActionFilter
{
    public const string Mensaje = "El texto contiene caracteres no válidos.";

    public void OnActionExecuting(ActionExecutingContext context)
    {
        foreach (var argumento in context.ActionArguments.Values)
        {
            if (TieneControl(argumento))
            {
                var problem = new ProblemDetails
                {
                    Status = StatusCodes.Status400BadRequest,
                    Title = "Solicitud inválida",
                    Detail = Mensaje,
                };
                problem.Extensions["code"] = "VALIDACION";
                problem.Extensions["message"] = Mensaje;
                context.Result = new BadRequestObjectResult(problem) { ContentTypes = { JsonDefaults.ContentType } };
                return;
            }
        }
    }

    public void OnActionExecuted(ActionExecutedContext context)
    {
    }

    private static bool TieneControl(object? valor) => valor switch
    {
        null => false,
        string texto => texto.Any(char.IsControl),
        CancellationToken => false,
        _ when valor.GetType().IsPrimitive || valor.GetType().IsValueType => false,
        _ => valor.GetType().GetProperties()
            .Where(p => p.PropertyType == typeof(string) && p.CanRead && p.GetIndexParameters().Length == 0)
            .Any(p => p.GetValue(valor) is string texto && texto.Any(char.IsControl)),
    };
}
