namespace Sciad.Application.Dtos.RegistrosAcceso;

/// <summary>
/// Fila del reporte de accesos del día (CU-05), agregada por (persona, zona): el último movimiento
/// y si la persona está actualmente dentro (tiene un ingreso sin egreso posterior). El operador de
/// seguridad ve de un vistazo quién está dentro vs. quién ya salió.
/// </summary>
public sealed record AccesoDelDiaDto(
    int PersonaId,
    string PersonaNombre,
    int ZonaId,
    string ZonaNombre,
    string UltimoTipo,
    TimeOnly UltimaHora,
    bool Dentro);
