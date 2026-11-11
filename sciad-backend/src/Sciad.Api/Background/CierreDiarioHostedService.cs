using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sciad.Application.Interfaces;
using Sciad.Domain.Time;

namespace Sciad.Api.Background;

/// <summary>
/// Cierre diario de auditoría (opción A): cada noche, a las 00:05 hora de Guatemala, ejecuta la MISMA verificación de
/// integridad que el endpoint POST /api/auditoria/verificar (PG2 Tabla 16). El «reinicio» de la medianoche ya ocurre solo
/// (el día de negocio es la fecha de Guatemala): el primer escaneo del nuevo día es un ingreso. Lo que esta tarea añade es
/// que los ingresos del día anterior sin egreso quedan <b>marcados</b> como hallazgos «acceso_sin_egreso» (estado abierto)
/// sin que el Administrador tenga que pulsar «Verificar integridad». No inserta registros de egreso ni envía alertas
/// adicionales: solo registra los hallazgos, igual que la verificación manual.
///
/// Configuración (opcional): <c>Auditoria:CierreDiario:Habilitado</c> (true) y <c>Auditoria:CierreDiario:Hora</c> ("00:05").
/// </summary>
public sealed class CierreDiarioHostedService : BackgroundService
{
    public const string Seccion = "Auditoria:CierreDiario";
    public static readonly TimeOnly HoraPorDefecto = new(0, 5);

    private readonly IServiceScopeFactory _scopes;
    private readonly IConfiguration _config;
    private readonly ILogger<CierreDiarioHostedService> _logger;

    public CierreDiarioHostedService(
        IServiceScopeFactory scopes, IConfiguration config, ILogger<CierreDiarioHostedService> logger)
    {
        _scopes = scopes;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_config.GetValue($"{Seccion}:Habilitado", true))
        {
            _logger.LogInformation("Cierre diario de auditoría deshabilitado por configuración.");
            return;
        }

        var texto = _config[$"{Seccion}:Hora"];
        var hora = HoraPorDefecto;
        if (!string.IsNullOrWhiteSpace(texto) && !TimeOnly.TryParse(texto, out hora))
        {
            _logger.LogWarning("Hora de cierre diario inválida ('{Hora}'); se usa 00:05.", texto);
            hora = HoraPorDefecto;
        }

        _logger.LogInformation("Cierre diario de auditoría programado a las {Hora} (hora de Guatemala).", hora);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(GuatemalaTime.HastaProximaHora(hora), stoppingToken);
                await EjecutarAsync(stoppingToken);
                // Margen para no volver a disparar en el mismo instante si el reloj se ajusta.
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    /// <summary>Ejecuta la verificación de integridad una vez. Nunca lanza: un fallo se registra y se reintenta mañana.</summary>
    public async Task EjecutarAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopes.CreateScope();
            var auditoria = scope.ServiceProvider.GetRequiredService<IAuditoriaService>();
            var resultado = await auditoria.VerificarAsync(ct);
            if (resultado.Exitoso)
            {
                _logger.LogInformation(
                    "Cierre diario de auditoría: {Hallazgos} hallazgo(s) nuevo(s) ({Detalle}).",
                    resultado.Dato!.HallazgosCreados,
                    string.Join(", ", resultado.Dato.PorTipo.Select(kv => $"{kv.Key}={kv.Value}")));
            }
            else
            {
                _logger.LogWarning("Cierre diario de auditoría no pudo completarse: {Mensaje}", resultado.Mensaje);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Falló el cierre diario de auditoría; se reintentará mañana.");
        }
    }
}
