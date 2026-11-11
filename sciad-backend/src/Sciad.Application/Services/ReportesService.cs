using System.Text;
using Microsoft.Extensions.Logging;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Reportes;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Domain.Time;

namespace Sciad.Application.Services;

/// <summary>
/// Reportes de auditoría (CU-07, Fase 2D). El CSV se construye en memoria y se devuelve como
/// contenido (el controlador lo sirve como descarga); en <c>reportes</c> solo se guardan los metadatos.
/// Separador de CSV: coma con escape RFC 4180 (decisión Fase 1: CSV en lugar de PDF). Divergencia con el
/// mock del frontend (encabezados Estacion/Resultado) documentada para reconciliar en Fase 3.
/// </summary>
public sealed class ReportesService : IReportesService
{
    private const string EncabezadosCsv = "Fecha,Hora,Persona,Zona,Tipo,RegistradoPor";

    private readonly IRegistroAccesoRepository _registros;
    private readonly IReporteRepository _reportes;
    private readonly ILogger<ReportesService> _logger;

    public ReportesService(
        IRegistroAccesoRepository registros,
        IReporteRepository reportes,
        ILogger<ReportesService> logger)
    {
        _registros = registros;
        _reportes = reportes;
        _logger = logger;
    }

    public async Task<ServicioResultado<string>> GenerarAsync(
        GenerarReporteRequest request, int usuarioId, CancellationToken ct = default)
    {
        if (request.Desde > request.Hasta)
        {
            return ServicioResultado<string>.Fallo(
                CodigosError.Validacion, "La fecha inicial no puede ser posterior a la fecha final.");
        }

        if (request.TipoEvento is not null && request.TipoEvento.Trim().ToLowerInvariant() is not ("ingreso" or "egreso"))
        {
            return ServicioResultado<string>.Fallo(
                CodigosError.Validacion, "El tipo de evento debe ser 'ingreso' o 'egreso'.");
        }

        var filas = await _registros.ListarParaReporteAsync(
            request.PersonaId, request.ZonaId, request.Desde, request.Hasta, request.TipoEvento, ct);

        var csv = new StringBuilder();
        csv.AppendLine(EncabezadosCsv);
        foreach (var r in filas)
        {
            csv.AppendLine(string.Join(',',
                CsvEscape(r.Fecha.ToString("yyyy-MM-dd")),
                CsvEscape(r.Hora.ToString("HH:mm")),
                CsvEscape(r.Persona?.Nombre ?? ""),
                CsvEscape(r.Zona?.Nombre ?? ""),
                CsvEscape(r.Tipo),
                CsvEscape(r.Usuario?.Nombre ?? "")));
        }

        var periodo = $"{request.Desde:yyyy-MM-dd} a {request.Hasta:yyyy-MM-dd}";
        await _reportes.AgregarAsync(new Reporte
        {
            Periodo = periodo,
            TotalRegistros = filas.Count,
            Generado = GuatemalaTime.Hoy,
            UsuarioId = usuarioId,
        }, ct);

        _logger.LogInformation("Reporte {Periodo}: {Total} registro(s) incluidos.", periodo, filas.Count);
        return ServicioResultado<string>.Ok(csv.ToString());
    }

    public async Task<ServicioResultado<PaginadoDto<ReporteDto>>> ListarAsync(
        int pagina, int tamanoPagina, CancellationToken ct = default)
    {
        var p = pagina < 1 ? 1 : pagina;
        var t = tamanoPagina is < 1 or > 100 ? 20 : tamanoPagina;

        var (items, total) = await _reportes.ListarPaginadoAsync(p, t, ct);
        var totalPaginas = total == 0 ? 0 : (int)Math.Ceiling(total / (double)t);

        return ServicioResultado<PaginadoDto<ReporteDto>>.Ok(new PaginadoDto<ReporteDto>(
            items.Select(ReporteDto.From).ToList(), total, p, t, totalPaginas));
    }

    private static string CsvEscape(string valor)
    {
        if (valor.Contains(',') || valor.Contains('"') || valor.Contains('\n'))
        {
            return '"' + valor.Replace("\"", "\"\"") + '"';
        }

        return valor;
    }
}