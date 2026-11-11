// Respuesta paginada estándar del backend (PaginadoDto).
export interface Paginado<T> {
  items: T[];
  total: number;
  pagina: number;
  tamanoPagina: number;
  totalPaginas: number;
}