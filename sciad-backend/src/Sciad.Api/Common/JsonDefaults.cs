using System.Text.Json;

namespace Sciad.Api.Common;

/// <summary>Opciones JSON comunes (camelCase, web) para respuestas escritas a mano fuera de MVC.</summary>
internal static class JsonDefaults
{
    public static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    public static readonly string ContentType = "application/problem+json";
}
