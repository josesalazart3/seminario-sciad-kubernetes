namespace Sciad.Domain.Time;

/// <summary>
/// Hora oficial de Guatemala para las reglas de negocio de acceso (Fase 4).
///
/// Guatemala está en UTC-6 todo el año (no usa horario de verano), por lo que se aplica un desplazamiento
/// fijo en vez de depender de la base de zonas horarias (tzdata) del contenedor. Esto evita que "hoy"
/// cambie a las 18:00 locales (medianoche UTC): una persona que sale a las 6:30 pm sigue en el mismo día
/// y se registra como egreso, no como un nuevo ingreso.
///
/// Convención: los campos <c>fecha</c>/<c>hora</c> de <c>registros_acceso</c> (y las fechas de negocio
/// <c>emitido</c>, <c>generado</c>, <c>auditoria.fecha</c>) se guardan en hora de Guatemala. Los
/// instantes (<c>notificaciones.fecha</c>, el <c>timestamp</c> de la respuesta, la expiración del JWT)
/// siguen siendo UTC verdadero.
/// </summary>
public static class GuatemalaTime
{
    /// <summary>Desplazamiento fijo respecto a UTC (UTC-6).</summary>
    public static readonly TimeSpan Offset = TimeSpan.FromHours(-6);

    /// <summary>Fuente de tiempo. Solo se reemplaza en pruebas; en producción es el reloj del sistema.</summary>
    public static TimeProvider Proveedor { get; set; } = TimeProvider.System;

    /// <summary>Instante actual en UTC (Kind = Utc).</summary>
    public static DateTime UtcNow => Proveedor.GetUtcNow().UtcDateTime;

    /// <summary>Fecha y hora actuales de Guatemala (Kind = Unspecified).</summary>
    public static DateTime Now => FromUtc(UtcNow);

    /// <summary>Fecha de hoy en Guatemala.</summary>
    public static DateOnly Hoy => DateOnly.FromDateTime(Now);

    /// <summary>Convierte un instante UTC a la hora de Guatemala.</summary>
    public static DateTime FromUtc(DateTime utc) =>
        DateTime.SpecifyKind(utc + Offset, DateTimeKind.Unspecified);

    /// <summary>
    /// Tiempo que falta (siempre > 0 y ≤ 24 h) hasta la próxima vez que el reloj de Guatemala marque <paramref name="hora"/>.
    /// Si ya es exactamente esa hora, la próxima ocurrencia es la de mañana. Lo usa el cierre diario de auditoría.
    /// </summary>
    public static TimeSpan HastaProximaHora(TimeOnly hora)
    {
        var ahora = Now;
        var objetivo = ahora.Date + hora.ToTimeSpan();
        if (objetivo <= ahora)
        {
            objetivo = objetivo.AddDays(1);
        }

        return objetivo - ahora;
    }

    /// <summary>Convierte fecha+hora de Guatemala al instante UTC equivalente (Kind = Utc).</summary>
    public static DateTime ToUtc(DateOnly fecha, TimeOnly hora)
    {
        var local = new DateTime(
            fecha.Year, fecha.Month, fecha.Day,
            hora.Hour, hora.Minute, hora.Second, DateTimeKind.Unspecified);
        return DateTime.SpecifyKind(local - Offset, DateTimeKind.Utc);
    }
}
