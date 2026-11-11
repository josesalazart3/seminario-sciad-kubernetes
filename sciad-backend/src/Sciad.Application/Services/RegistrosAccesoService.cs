using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.RegistrosAcceso;
using Sciad.Application.Interfaces;
using Sciad.Domain.Entities;
using Sciad.Domain.Time;

namespace Sciad.Application.Services;

/// <summary>
/// Núcleo de control de acceso (Fase 2C — CU-04/CU-05). Implementa paso a paso el diagrama de
/// actividad y de secuencia de referencia: valida el sobre cifrado del QR (RNF-01) → persona activa → zona activa →
/// perfil vigente → infiere ingreso/egreso → persiste en transacción ACID (RNF-06) con la restricción
/// UNIQUE de base de datos como última línea de defensa contra el doble ingreso (CA-05), y dispara las
/// notificaciones automáticas del momento del escaneo (CU-09).
///
/// Decisiones documentadas en la Bitácora 2C:
/// - El <c>tipo</c> (ingreso/egreso) se infiere en el servidor: si la persona ya tiene un ingreso
///   abierto en la zona hoy (ingresos &gt; egresos), el movimiento es egreso; si no, ingreso. El cliente
///   no lo envía (verifica el payload del frontend: no incluye <c>tipo</c> ni <c>zona</c>).
/// - Notificaciones en 2C (solo en el momento del escaneo): credencial revocada/vencida usada
///   (<c>token_revocado</c>) y acceso con perfil fuera de vigencia (<c>fuera_horario</c>). La
///   concentración inusual en una zona se deja explícitamente para la Fase 2D.
/// - Todo rechazo devuelve 400 con un <c>code</c> identificable (TOKEN_INVALIDO, CREDENCIAL_REVOCADA,
///   PERSONA_INACTIVA, ZONA_NO_AUTORIZADA, FUERA_VIGENCIA); el doble ingreso es 409 (CONFLICTO).
/// </summary>
public sealed class RegistrosAccesoService : IRegistrosAccesoService
{
    private readonly ICredencialRepository _credenciales;
    private readonly IZonaRepository _zonas;
    private readonly IPerfilAccesoRepository _perfiles;
    private readonly IRegistroAccesoRepository _registros;
    private readonly IUsuarioRepository _usuarios;
    private readonly ICifradoQr _cifrado;
    private readonly ILogger<RegistrosAccesoService> _logger;

    public RegistrosAccesoService(
        ICredencialRepository credenciales,
        IZonaRepository zonas,
        IPerfilAccesoRepository perfiles,
        IRegistroAccesoRepository registros,
        IUsuarioRepository usuarios,
        ICifradoQr cifrado,
        ILogger<RegistrosAccesoService> logger)
    {
        _credenciales = credenciales;
        _zonas = zonas;
        _perfiles = perfiles;
        _registros = registros;
        _usuarios = usuarios;
        _cifrado = cifrado;
        _logger = logger;
    }

    public async Task<ServicioResultado<RegistroAccesoResultadoDto>> RegistrarAccesoAsync(
        RegistrarAccesoRequest request, int usuarioId, CancellationToken ct = default)
    {
        // Fecha/hora de negocio en hora de Guatemala (UTC-6): el "día" no cambia a las 18:00 locales.
        // El instante real (UTC) se conserva solo para el timestamp de la respuesta.
        var ahoraUtc = GuatemalaTime.UtcNow;
        var ahora = GuatemalaTime.FromUtc(ahoraUtc);
        var hoy = DateOnly.FromDateTime(ahora);

        // 1) Sobre del QR válido (RNF-01): descifra y verifica la etiqueta GCM, busca la credencial por su id (en cualquier
        //    estado, con la persona) y compara el token en tiempo constante. Cualquier fallo responde igual (no revela el motivo).
        var credencial = _cifrado.TryDescifrar(request.Token, out var credencialId, out var token)
            ? await _credenciales.FindByIdAsync(credencialId, ct)
            : null;
        if (credencial is null || !CryptographicOperations.FixedTimeEquals(token, Convert.FromHexString(credencial.Token)))
        {
            return ServicioResultado<RegistroAccesoResultadoDto>.Fallo(
                CodigosError.TokenInvalido, "El token de la credencial QR no es válido.");
        }

        // 2) Credencial activa (no revocada ni vencida). Reuso → notificación de suplantación/token revocado.
        if (!Es(credencial.Estado, "activa"))
        {
            await NotificarRechazoAsync(credencial.Persona, "token_revocado",
                $"Intento de acceso con una credencial {credencial.Estado} (token revocado o vencido).", ct);
            return ServicioResultado<RegistroAccesoResultadoDto>.Fallo(
                CodigosError.CredencialRevocada, "La credencial está revocada o vencida.");
        }

        // 3) Persona activa.
        var persona = credencial.Persona;
        if (!Es(persona.Estado, "activo"))
        {
            return ServicioResultado<RegistroAccesoResultadoDto>.Fallo(
                CodigosError.PersonaInactiva, "La persona titular de la credencial está inactiva.");
        }

        // 4) Zona existe y está activa.
        var zona = await _zonas.FindByIdAsync(request.ZonaId, ct);
        if (zona is null)
        {
            return ServicioResultado<RegistroAccesoResultadoDto>.Fallo(
                CodigosError.ZonaNoAutorizada, "La zona de acceso no existe.");
        }

        if (!Es(zona.Estado, "activo"))
        {
            return ServicioResultado<RegistroAccesoResultadoDto>.Fallo(
                CodigosError.ZonaNoAutorizada, "La zona de acceso está inactiva.");
        }

        // 5) Perfil de acceso vigente para (persona, zona). Se distingue "sin perfil para la zona"
        //    (zona no autorizada) de "perfil existente pero fuera de vigencia" (fuera_horario).
        var perfiles = await _perfiles.ListarAsync(persona.Id, zona.Id, ct);
        var vigente = perfiles.FirstOrDefault(p => p.VigenciaInicio <= hoy && hoy <= p.VigenciaFin);
        if (vigente is null)
        {
            if (perfiles.Count > 0)
            {
                await NotificarRechazoAsync(persona, "fuera_horario",
                    $"Intento de acceso fuera del horario/vigencia del perfil en la zona '{zona.Nombre}'.", ct);
                return ServicioResultado<RegistroAccesoResultadoDto>.Fallo(
                    CodigosError.FueraVigencia,
                    "La persona tiene un perfil en esta zona, pero su vigencia no cubre la fecha de hoy (fuera de horario).");
            }

            return ServicioResultado<RegistroAccesoResultadoDto>.Fallo(
                CodigosError.ZonaNoAutorizada, "La persona no tiene autorización (perfil) para esta zona.");
        }

        // 6) Inferir tipo: ingreso abierto hoy (ingresos > egresos) → egreso; si no → ingreso.
        var (ingresos, egresos) = await _registros.ContarMovimientosAsync(persona.Id, zona.Id, hoy, ct);
        var tipo = ingresos > egresos ? "egreso" : "ingreso";

        // 7) Persistir en transacción ACID. La UNIQUE de BD resuelve la condición de carrera → 409.
        var registro = new RegistroAcceso
        {
            PersonaId = persona.Id,
            ZonaId = zona.Id,
            Fecha = hoy,
            Hora = TimeOnly.FromDateTime(ahora),
            Tipo = tipo,
            UsuarioId = usuarioId,
        };

        var creado = await _registros.RegistrarConTransaccionAsync(registro, notificacion: null, ct);
        if (creado is null)
        {
            return ServicioResultado<RegistroAccesoResultadoDto>.Fallo(
                CodigosError.Conflicto,
                "Ya existe un ingreso registrado para esta persona en esta zona hoy (doble ingreso).");
        }

        _logger.LogInformation(
            "Acceso registrado (id={RegistroId}, persona={PersonaId}, zona={ZonaId}, tipo={Tipo}, por usuario={UsuarioId}).",
            creado.Id, persona.Id, zona.Id, tipo, usuarioId);

        return ServicioResultado<RegistroAccesoResultadoDto>.Ok(
            RegistroAccesoResultadoDto.From(creado, persona, zona, ahoraUtc));
    }

    public async Task<ServicioResultado<List<AccesoDelDiaDto>>> ListarDelDiaAsync(
        int? zonaId, CancellationToken ct = default)
    {
        var hoy = GuatemalaTime.Hoy;
        var registros = await _registros.ListarDelDiaAsync(zonaId, hoy, ct);

        var resultado = new List<AccesoDelDiaDto>();
        foreach (var grupo in registros.GroupBy(r => (r.PersonaId, r.ZonaId)))
        {
            var orden = grupo.OrderBy(r => r.Hora).ToList();
            var ingresos = orden.Count(r => r.Tipo == "ingreso");
            var egresos = orden.Count(r => r.Tipo == "egreso");
            var ultimo = orden[^1];

            resultado.Add(new AccesoDelDiaDto(
                ultimo.Persona.Id,
                ultimo.Persona?.Nombre ?? "",
                ultimo.Zona.Id,
                ultimo.Zona?.Nombre ?? "",
                ultimo.Tipo,
                ultimo.Hora,
                ingresos > egresos));
        }

        return ServicioResultado<List<AccesoDelDiaDto>>.Ok(
            resultado.OrderBy(a => a.PersonaNombre).ThenBy(a => a.ZonaNombre).ToList());
    }

    public async Task<ServicioResultado<PaginadoDto<RegistroHistorialDto>>> ListarHistorialAsync(
        HistorialAccesosRequest request, CancellationToken ct = default)
    {
        var pagina = request.Pagina < 1 ? 1 : request.Pagina;
        var tamano = request.TamanoPagina is < 1 or > 100 ? 20 : request.TamanoPagina;

        if (request.Desde.HasValue && request.Hasta.HasValue && request.Desde.Value > request.Hasta.Value)
        {
            return ServicioResultado<PaginadoDto<RegistroHistorialDto>>.Fallo(
                CodigosError.Validacion, "La fecha inicial no puede ser posterior a la fecha final.");
        }

        if (request.Tipo is not null && request.Tipo.Trim().ToLowerInvariant() is not ("ingreso" or "egreso"))
        {
            return ServicioResultado<PaginadoDto<RegistroHistorialDto>>.Fallo(
                CodigosError.Validacion, "El tipo de movimiento debe ser 'ingreso' o 'egreso'.");
        }

        var (items, total) = await _registros.ListarHistorialAsync(
            request.PersonaId, request.ZonaId, request.Desde, request.Hasta, request.Tipo, pagina, tamano, ct);
        var totalPaginas = total == 0 ? 0 : (int)Math.Ceiling(total / (double)tamano);

        return ServicioResultado<PaginadoDto<RegistroHistorialDto>>.Ok(new PaginadoDto<RegistroHistorialDto>(
            items.Select(RegistroHistorialDto.From).ToList(), total, pagina, tamano, totalPaginas));
    }

    private async Task NotificarRechazoAsync(
        Persona persona, string tipo, string mensaje, CancellationToken ct)
    {
        var gerente = await _usuarios.ObtenerActivoPorRolAsync("GERENCIA", ct);
        await _registros.AgregarNotificacionAsync(new Notificacion
        {
            UsuarioId = gerente?.Id,
            PersonaId = persona.Id,
            Tipo = tipo,
            Mensaje = mensaje,
            Leida = false,
            Fecha = DateTime.UtcNow,
        }, ct);
        _logger.LogInformation("Notificación generada (tipo={Tipo}, persona={PersonaId}).", tipo, persona.Id);
    }

    private static bool Es(string a, string b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
}
