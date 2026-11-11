namespace Sciad.Application.Dtos.RegistrosAcceso;

/// <summary>
/// Filtros del historial de accesos (CU-06). Todos opcionales salvo la paginación (con defaults
/// sanos en el servicio). <c>Tipo</c> solo admite <c>ingreso</c>/<c>egreso</c> (validación de negocio).
/// </summary>
public sealed record HistorialAccesosRequest(
    int? PersonaId,
    int? ZonaId,
    DateOnly? Desde,
    DateOnly? Hasta,
    string? Tipo,
    int Pagina,
    int TamanoPagina);