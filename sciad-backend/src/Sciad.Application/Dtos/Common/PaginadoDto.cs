namespace Sciad.Application.Dtos.Common;

/// <summary>Respuesta paginada estándar: items + metadatos de página.</summary>
public sealed record PaginadoDto<T>(IReadOnlyList<T> Items, int Total, int Pagina, int TamanoPagina, int TotalPaginas);