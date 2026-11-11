using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.RegistrosAcceso;
using Sciad.Application.Services;

namespace Sciad.Application.Interfaces;

/// <summary>
/// Núcleo de control de acceso (Fase 2C): escaneo QR de ingreso/egreso (CU-04) y reporte de accesos
/// del día (CU-05). El escaneo valida credencial/persona/zona/perfil, infiere el tipo de movimiento,
/// persiste en transacción ACID y genera notificaciones automáticas por eventos anómalos (CU-09).
/// </summary>
public interface IRegistrosAccesoService
{
    /// <summary>
    /// Procesa un escaneo QR. <paramref name="usuarioId"/> es el operador autenticado (Personal de
    /// Seguridad/Administrador) que ejecutó el escaneo y se registra en <c>registros_acceso.usuario_id</c>.
    /// Devuelve el acceso persistido, o un fallo con código específico (TOKEN_INVALIDO, CREDENCIAL_REVOCADA,
    /// PERSONA_INACTIVA, ZONA_NO_AUTORIZADA, FUERA_VIGENCIA, CONFLICTO).
    /// </summary>
    Task<ServicioResultado<RegistroAccesoResultadoDto>> RegistrarAccesoAsync(
        RegistrarAccesoRequest request, int usuarioId, CancellationToken ct = default);

    /// <summary>Accesos del día (CU-05), agregados por persona+zona; opcionalmente filtrado por zona.</summary>
    Task<ServicioResultado<List<AccesoDelDiaDto>>> ListarDelDiaAsync(int? zonaId, CancellationToken ct = default);

    /// <summary>
    /// Historial de accesos (CU-06), paginado y con filtros opcionales (persona, zona, rango de fechas,
    /// tipo). Roles: Administrador y Gerencia/Auditoría; Personal de Seguridad no tiene acceso.
    /// </summary>
    Task<ServicioResultado<PaginadoDto<RegistroHistorialDto>>> ListarHistorialAsync(
        HistorialAccesosRequest request, CancellationToken ct = default);
}
