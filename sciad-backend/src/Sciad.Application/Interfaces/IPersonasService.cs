using Sciad.Application.Dtos.Common;
using Sciad.Application.Dtos.Personas;
using Sciad.Application.Services;

namespace Sciad.Application.Interfaces;

public interface IPersonasService
{
    Task<ServicioResultado<PaginadoDto<PersonaDto>>> ListarAsync(
        int? tipo, string? estado, int pagina, int tamanoPagina, CancellationToken ct = default);
    Task<ServicioResultado<PersonaDto>> CrearAsync(CrearPersonaRequest req, CancellationToken ct = default);
    Task<ServicioResultado<PersonaDto>> ActualizarAsync(int id, ActualizarPersonaRequest req, CancellationToken ct = default);
    Task<ServicioResultado<PersonaDto>> CambiarEstadoAsync(int id, CambiarEstadoRequest req, CancellationToken ct = default);
}