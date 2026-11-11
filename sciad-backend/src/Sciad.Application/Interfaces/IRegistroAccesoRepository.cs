using Sciad.Domain.Entities;

namespace Sciad.Application.Interfaces;

/// <summary>
/// Acceso a registros de ingreso/egreso y notificaciones generadas en el momento del escaneo (CU-04/CU-05).
/// El método de escritura <see cref="RegistrarConTransaccionAsync"/> es la única vía de insertar un
/// registro de acceso: encapsula una transacción ACID real (RNF-06) que inserta el registro y, si
/// corresponde, la notificación en el mismo <c>SaveChanges</c>, y traduce la violación del índice
/// UNIQUE <c>uq_ingreso_diario</c> (doble ingreso por condición de carrera) a <c>null</c> (→ 409),
/// en lugar de propagar un 500.
/// Desde la Fase 2D también expone las consultas de trazabilidad (historial CU-06) y las consultas de
/// auditoría de integridad (CU-08): ingresos sin egreso, duplicados, registros inconsistentes y la
/// materia prima para detectar concentración inusual de accesos.
/// </summary>
public interface IRegistroAccesoRepository
{
    /// <summary>
    /// Registra un acceso (y opcionalmente su notificación) en una transacción ACID.
    /// Devuelve el registro persistido, o <c>null</c> cuando la inserción chocó con el índice UNIQUE
    /// <c>uq_ingreso_diario</c> (doble ingreso de la misma persona el mismo día por condición de carrera).
    /// </summary>
    Task<RegistroAcceso?> RegistrarConTransaccionAsync(
        RegistroAcceso registro, Notificacion? notificacion, CancellationToken ct = default);

    /// <summary>Inserta una notificación en solitario (eventos anómalos de un escaneo rechazado).</summary>
    Task AgregarNotificacionAsync(Notificacion notificacion, CancellationToken ct = default);

    /// <summary>
    /// Cuenta los movimientos de la persona en la zona en la fecha dada (ingresos y egresos),
    /// para inferir el tipo del siguiente movimiento (ingreso abierto → egreso, si no → ingreso).
    /// </summary>
    Task<(int Ingresos, int Egresos)> ContarMovimientosAsync(
        int personaId, int zonaId, DateOnly fecha, CancellationToken ct = default);

    /// <summary>Registros del día (fecha exacta), opcionalmente filtrados por zona. Incluye persona, zona y usuario.</summary>
    Task<List<RegistroAcceso>> ListarDelDiaAsync(int? zonaId, DateOnly fecha, CancellationToken ct = default);

    /// <summary>
    /// Historial de accesos (CU-06) con filtros (persona, zona, rango de fechas, tipo), paginado y
    /// ordenado por fecha/hora descendente. Incluye persona, zona y usuario (quién registró).
    /// </summary>
    Task<(IReadOnlyList<RegistroAcceso> Items, int Total)> ListarHistorialAsync(
        int? personaId, int? zonaId, DateOnly? desde, DateOnly? hasta, string? tipo,
        int pagina, int tamanoPagina, CancellationToken ct = default);

    /// <summary>
    /// Todos los registros que cumplen los filtros dados (sin paginación), ordenados por fecha/hora.
    /// Alimenta la exportación CSV de un reporte de auditoría (CU-07).
    /// </summary>
    Task<List<RegistroAcceso>> ListarParaReporteAsync(
        int? personaId, int? zonaId, DateOnly? desde, DateOnly? hasta, string? tipo,
        CancellationToken ct = default);

    /// <summary>
    /// Ingresos <b>de días anteriores</b> a <paramref name="fechaCorte"/> sin egreso correspondiente
    /// para la misma persona y fecha (CU-08). Un ingreso del día actual sin egreso no es anomalía.
    /// Devuelve un registro representativo por (persona, fecha) con <c>Persona</c> incluida.
    /// </summary>
    Task<List<RegistroAcceso>> IngresosSinEgresoAsync(DateOnly fechaCorte, CancellationToken ct = default);

    /// <summary>
    /// Duplicados en la bitácora (red de seguridad sobre el índice UNIQUE <c>uq_ingreso_diario</c>):
    /// personas con más de un registro del mismo tipo en la misma fecha. Devuelve un representante por grupo.
    /// </summary>
    Task<List<RegistroAcceso>> RegistrosDuplicadosAsync(CancellationToken ct = default);

    /// <summary>
    /// Registros históricos con campos nulos/inconsistentes (referencias inexistentes a persona, zona o
    /// usuario — solo posible si se violaran las FK). Devuelve las filas para crear el hallazgo.
    /// </summary>
    Task<List<RegistroAcceso>> RegistrosInconsistentesAsync(CancellationToken ct = default);

    /// <summary>
    /// Todos los ingresos de la fecha dada con persona y zona incluidas, ordenados por hora.
    /// Materia prima de la verificación de concentración inusual (CU-08): el servicio agrupa por zona
    /// y cuenta cuántos ingresos caen dentro de la ventana de minutos.
    /// </summary>
    Task<List<RegistroAcceso>> ListarIngresosDelDiaAsync(DateOnly fecha, CancellationToken ct = default);
}