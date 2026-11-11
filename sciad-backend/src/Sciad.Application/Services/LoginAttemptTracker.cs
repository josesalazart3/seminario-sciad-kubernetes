using System.Collections.Concurrent;

namespace Sciad.Application.Services;

/// <summary>
/// Bloqueo temporal por cuenta tras demasiados inicios de sesión fallidos (OWASP A07 — fuerza bruta y credential stuffing).
/// Complementa —no reemplaza— el límite por IP de <c>/api/auth/login</c> (5 intentos por 5 min, PG2): este bloqueo actúa por
/// CORREO aunque el atacante cambie de IP. La clave es el correo normalizado, exista o no la cuenta, para que el
/// comportamiento sea idéntico y no permita descubrir qué correos están registrados.
/// El umbral (10) es mayor que el del límite por IP (5) a propósito: una persona legítima que se equivoca no queda bloqueada
/// y la prueba documentada de «sexto intento → 429» no se ve afectada. En memoria (una instancia de API); se reinicia con el servicio.
/// </summary>
public sealed class LoginAttemptTracker
{
    public const int MaxFallos = 10;
    public static readonly TimeSpan Ventana = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan Bloqueo = TimeSpan.FromMinutes(10);
    private const int LimiteEntradas = 10_000;

    private sealed class Estado
    {
        public int Fallos;
        public DateTime PrimerFallo;
        public DateTime? BloqueadoHasta;
    }

    private readonly ConcurrentDictionary<string, Estado> _estados = new();
    private readonly Func<DateTime> _ahora;

    public LoginAttemptTracker(Func<DateTime>? ahora = null)
    {
        _ahora = ahora ?? (() => DateTime.UtcNow);
    }

    public static string Normalizar(string? correo) => (correo ?? string.Empty).Trim().ToLowerInvariant();

    public bool EstaBloqueado(string? correo)
    {
        if (!_estados.TryGetValue(Normalizar(correo), out var e))
        {
            return false;
        }

        lock (e)
        {
            return e.BloqueadoHasta is { } hasta && hasta > _ahora();
        }
    }

    /// <summary>Registra un fallo. Devuelve true si con este fallo la cuenta queda bloqueada.</summary>
    public bool RegistrarFallo(string? correo)
    {
        var ahora = _ahora();
        if (_estados.Count > LimiteEntradas)
        {
            Depurar(ahora);
        }

        var e = _estados.GetOrAdd(Normalizar(correo), _ => new Estado { PrimerFallo = ahora });
        lock (e)
        {
            if (e.BloqueadoHasta is { } hasta && hasta > ahora)
            {
                return true;
            }

            if (ahora - e.PrimerFallo > Ventana || e.BloqueadoHasta is not null)
            {
                e.Fallos = 0;
                e.PrimerFallo = ahora;
                e.BloqueadoHasta = null;
            }

            e.Fallos++;
            if (e.Fallos >= MaxFallos)
            {
                e.BloqueadoHasta = ahora + Bloqueo;
                return true;
            }

            return false;
        }
    }

    /// <summary>Un inicio de sesión correcto borra el historial de fallos.</summary>
    public void Reiniciar(string? correo) => _estados.TryRemove(Normalizar(correo), out _);

    private void Depurar(DateTime ahora)
    {
        foreach (var (clave, e) in _estados)
        {
            lock (e)
            {
                var vencido = e.BloqueadoHasta is { } h ? h <= ahora : ahora - e.PrimerFallo > Ventana;
                if (vencido)
                {
                    _estados.TryRemove(clave, out _);
                }
            }
        }
    }
}
