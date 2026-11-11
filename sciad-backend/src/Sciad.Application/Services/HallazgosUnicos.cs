using Sciad.Domain.Entities;

namespace Sciad.Application.Services;

/// <summary>
/// Evita registrar dos veces el mismo hallazgo de auditoría. La verificación de integridad ahora se ejecuta también cada
/// noche (cierre diario) y la comprobación «ingreso sin egreso» revisa TODOS los días anteriores (PG2 Tabla 16), por lo que
/// sin esta regla el mismo caso se volvería a crear cada noche. La identidad de un hallazgo es (tipo, persona, descripción):
/// la descripción incluye la fecha del ingreso (o el id del registro), así que es estable entre ejecuciones.
/// La «concentración inusual» NO se deduplica: es un evento puntual y su texto puede repetirse legítimamente en otro momento.
/// </summary>
public static class HallazgosUnicos
{
    /// <summary>¿Este tipo de hallazgo se registra una sola vez por caso?</summary>
    public static bool EsDeduplicable(string tipo) =>
        tipo is "acceso_sin_egreso" or "registro_duplicado" or "campo_inconsistente";

    /// <summary>Devuelve solo los hallazgos que aún no existen (y quita repetidos dentro del propio lote).</summary>
    public static List<Auditoria> Filtrar(
        IEnumerable<Auditoria> candidatos,
        IEnumerable<(string Tipo, int? PersonaId, string Descripcion)> existentes)
    {
        var vistos = new HashSet<(string, int?, string)>(existentes);
        var nuevos = new List<Auditoria>();
        foreach (var h in candidatos)
        {
            if (!EsDeduplicable(h.Tipo))
            {
                nuevos.Add(h);
                continue;
            }

            if (vistos.Add((h.Tipo, h.PersonaId, h.Descripcion)))
            {
                nuevos.Add(h);
            }
        }

        return nuevos;
    }
}
