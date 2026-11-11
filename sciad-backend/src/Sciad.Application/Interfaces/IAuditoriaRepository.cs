using Sciad.Domain.Entities;

namespace Sciad.Application.Interfaces;

/// <summary>
/// Acceso a hallazgos de auditoría de integridad (CU-08). Sin DELETE físico — son trazabilidad histórica.
/// </summary>
public interface IAuditoriaRepository
{
    /// <summary>Lista paginada de hallazgos (con persona), ordenada por fecha descendente; opcionalmente filtrada por tipo y/o estado.</summary>
    Task<(IReadOnlyList<Auditoria> Items, int Total)> ListarAsync(
        string? tipo, string? estado, int pagina, int tamanoPagina, CancellationToken ct = default);

    /// <summary>Busca un hallazgo por id.</summary>
    Task<Auditoria?> FindByIdAsync(int id, CancellationToken ct = default);

    /// <summary>Insertar los hallazgos detectados por la verificación de integridad (un solo SaveChanges).</summary>
    Task<List<Auditoria>> AgregarHallazgosAsync(List<Auditoria> hallazgos, CancellationToken ct = default);

    /// <summary>Persiste los cambios de un hallazgo ya rastreado (cambio de estado).</summary>
    Task<Auditoria> ActualizarAsync(Auditoria hallazgo, CancellationToken ct = default);
}