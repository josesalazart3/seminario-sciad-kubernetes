using Microsoft.Extensions.Logging;
using Sciad.Application.Dtos.Auditoria;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Domain.Time;

namespace Sciad.Application.Services;

/// <summary>
/// Auditoría de integridad de bitácoras (CU-08, Fase 2D). La verificación ejecuta las comprobaciones
/// del DERCAS e inserta un hallazgo por inconsistencia (<c>estado = abierto</c>); la concentración
/// inusual, además, genera una notificación a Gerencia. Vocabulario de estados alineado con la entidad
/// y el frontend: <c>abierto | en_revision | resuelto</c> (decisión senior — ver Bitácora 2D).
///
/// Criterios (documentados en la Bitácora 2D, antes de implementar):
/// - <b>Ingreso sin egreso anómalo</b>: ingreso con fecha anterior a hoy para el que NO existe un egreso
///   del mismo <c>persona_id</c> en la misma <c>fecha</c>. Un ingreso de hoy sin egreso aún es normal.
/// - <b>Concentración inusual</b>: <see cref="UmbralConcentracion"/> o más ingresos en la misma zona
///   dentro de una ventana rodante de <see cref="VentanaConcentracionMinutos"/> minutos. Umbral y ventana
///   son constantes públicas de configuración para ajustarlas fácilmente (no números mágicos).
/// </summary>
public sealed class AuditoriaService : IAuditoriaService
{
    /// <summary>Límite de la concentración inusual: ingresos en una zona dentro de la ventana.</summary>
    public const int UmbralConcentracion = 10;

    /// <summary>Ventana rodante (en minutos) para detectar concentración inusual de accesos.</summary>
    public const int VentanaConcentracionMinutos = 30;

    private readonly IRegistroAccesoRepository _registros;
    private readonly IAuditoriaRepository _auditoria;
    private readonly INotificacionRepository _notificaciones;
    private readonly IUsuarioRepository _usuarios;
    private readonly ILogger<AuditoriaService> _logger;

    public AuditoriaService(
        IRegistroAccesoRepository registros,
        IAuditoriaRepository auditoria,
        INotificacionRepository notificaciones,
        IUsuarioRepository usuarios,
        ILogger<AuditoriaService> logger)
    {
        _registros = registros;
        _auditoria = auditoria;
        _notificaciones = notificaciones;
        _usuarios = usuarios;
        _logger = logger;
    }

    public async Task<ServicioResultado<VerificacionAuditoriaResultadoDto>> VerificarAsync(
        CancellationToken ct = default)
    {
        var hoy = GuatemalaTime.Hoy;
        var hallazgos = new List<Auditoria>();
        var notificacionesGeneradas = 0;

        // 1) Ingresos sin egreso de días anteriores (el de hoy todavía no es anomalía).
        foreach (var r in await _registros.IngresosSinEgresoAsync(hoy, ct))
        {
            hallazgos.Add(Hallazgo("acceso_sin_egreso",
                $"Ingreso sin egreso correspondiente: {r.Persona?.Nombre} (id {r.PersonaId}) ingresó el {r.Fecha:yyyy-MM-dd} y no tiene egreso registrado ese día.",
                r.PersonaId, hoy));
        }

        // 2) Duplicados (red de seguridad sobre el índice UNIQUE uq_ingreso_diario de 2C).
        foreach (var r in await _registros.RegistrosDuplicadosAsync(ct))
        {
            hallazgos.Add(Hallazgo("registro_duplicado",
                $"Más de un registro de {r.Tipo} para {r.Persona?.Nombre} (id {r.PersonaId}) en {r.Fecha:yyyy-MM-dd}; se espera máximo uno por tipo y día.",
                r.PersonaId, hoy));
        }

        // 3) Campos nulos/inconsistentes (referencias rotas a persona/zona/usuario — solo posibles si se violaran las FK).
        foreach (var r in await _registros.RegistrosInconsistentesAsync(ct))
        {
            hallazgos.Add(Hallazgo("campo_inconsistente",
                $"Registro {r.Id} referencia una entidad inexistente (persona_id={r.PersonaId}).",
                r.PersonaId > 0 ? r.PersonaId : null, hoy));
        }

        // 4) Concentración inusual en una zona: N ingresos en la ventana rodante, agrupados por zona.
        var ahora = GuatemalaTime.UtcNow;
        var desdeVentana = ahora.AddMinutes(-VentanaConcentracionMinutos);
        foreach (var grupo in (await _registros.ListarIngresosDelDiaAsync(hoy, ct)).GroupBy(r => r.ZonaId))
        {
            var conteo = grupo.Count(r => DentroDeVentana(r, desdeVentana, ahora));
            if (conteo < UmbralConcentracion)
            {
                continue;
            }

            var nombreZona = grupo.First().Zona?.Nombre ?? $"id {grupo.Key}";
            hallazgos.Add(Hallazgo("concentracion",
                $"Concentración inusual en la zona '{nombreZona}': {conteo} ingresos en los últimos {VentanaConcentracionMinutos} minutos (umbral: {UmbralConcentracion}).",
                null, hoy));

            await NotificarConcentracionAsync(nombreZona, conteo, ct);
            notificacionesGeneradas++;
        }

        // Persistir todo en un solo lote. nula la lista -> sin I/O relevante.
        var creados = await _auditoria.AgregarHallazgosAsync(hallazgos, ct);
        var porTipo = creados.GroupBy(h => h.Tipo).ToDictionary(g => g.Key, g => g.Count());

        _logger.LogInformation(
            "Verificación de auditoría: {Conteo} hallazgos ({Resumen}), {Notifs} notificación(es) de concentración.",
            creados.Count, string.Join(", ", porTipo.Select(kv => $"{kv.Key}={kv.Value}")), notificacionesGeneradas);

        return ServicioResultado<VerificacionAuditoriaResultadoDto>.Ok(
            new VerificacionAuditoriaResultadoDto(creados.Count, notificacionesGeneradas, porTipo));
    }

    public async Task<ServicioResultado<PaginadoDto<AuditoriaHallazgoDto>>> ListarAsync(
        string? tipo, string? estado, int pagina, int tamanoPagina, CancellationToken ct = default)
    {
        var p = pagina < 1 ? 1 : pagina;
        var t = tamanoPagina is < 1 or > 100 ? 20 : tamanoPagina;

        var (items, total) = await _auditoria.ListarAsync(tipo, estado, p, t, ct);
        var totalPaginas = total == 0 ? 0 : (int)Math.Ceiling(total / (double)t);

        return ServicioResultado<PaginadoDto<AuditoriaHallazgoDto>>.Ok(new PaginadoDto<AuditoriaHallazgoDto>(
            items.Select(AuditoriaHallazgoDto.From).ToList(), total, p, t, totalPaginas));
    }

    public async Task<ServicioResultado<AuditoriaHallazgoDto>> CambiarEstadoAsync(
        int id, CambiarEstadoRequest request, CancellationToken ct = default)
    {
        var hallazgo = await _auditoria.FindByIdAsync(id, ct);
        if (hallazgo is null)
        {
            return ServicioResultado<AuditoriaHallazgoDto>.Fallo(CodigosError.NoEncontrado, "Hallazgo de auditoría no encontrado.");
        }

        var estado = request.Estado.Trim().ToLowerInvariant();
        if (estado is not ("abierto" or "en_revision" or "resuelto"))
        {
            return ServicioResultado<AuditoriaHallazgoDto>.Fallo(
                CodigosError.Validacion, "El estado debe ser 'abierto', 'en_revision' o 'resuelto'.");
        }

        hallazgo.Estado = estado;
        var actualizado = await _auditoria.ActualizarAsync(hallazgo, ct);
        _logger.LogInformation("Estado del hallazgo de auditoría {HallazgoId} cambiado a {Estado}.", id, estado);

        return ServicioResultado<AuditoriaHallazgoDto>.Ok(AuditoriaHallazgoDto.From(actualizado));
    }

    private async Task NotificarConcentracionAsync(string zona, int conteo, CancellationToken ct)
    {
        var gerente = await _usuarios.ObtenerActivoPorRolAsync("GERENCIA", ct);
        await _notificaciones.AgregarAsync(new Notificacion
        {
            UsuarioId = gerente?.Id,
            PersonaId = null,
            Tipo = "concentracion",
            Mensaje = $"Concentración inusual de accesos en la zona '{zona}': {conteo} ingresos en los últimos {VentanaConcentracionMinutos} minutos.",
            Leida = false,
            Fecha = DateTime.UtcNow,
        }, ct);
    }

    private static Auditoria Hallazgo(string tipo, string descripcion, int? personaId, DateOnly fecha) => new()
    {
        Tipo = tipo,
        Descripcion = descripcion,
        PersonaId = personaId,
        Estado = "abierto",
        Fecha = fecha,
    };

    private static bool DentroDeVentana(RegistroAcceso r, DateTime desde, DateTime hasta)
    {
        // Fecha+Hora se persisten en hora de Guatemala (UTC-6): se reconstruye el instante UTC equivalente
        // para compararlo con la ventana (que está en UTC).
        var momento = GuatemalaTime.ToUtc(r.Fecha, r.Hora);
        return momento >= desde && momento <= hasta;
    }
}