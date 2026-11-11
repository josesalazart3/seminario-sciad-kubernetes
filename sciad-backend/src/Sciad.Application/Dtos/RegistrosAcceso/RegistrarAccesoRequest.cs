using System.ComponentModel.DataAnnotations;

namespace Sciad.Application.Dtos.RegistrosAcceso;

/// <summary>
/// Payload del escaneo QR (CU-04). El <see cref="Token"/> es el contenido del QR: el sobre cifrado
/// <c>SCIAD1.…</c> que entrega el generador de credenciales (ver <c>CifradoQr</c>). El tipo de movimiento
/// (ingreso/egreso) NO lo envía el cliente: se infiere en el servidor según si la persona ya tiene un
/// ingreso abierto en la zona ese día (más robusto que depender del operador — ver Bitácora 2C).
/// </summary>
public sealed record RegistrarAccesoRequest
{
    [Required(ErrorMessage = "El token de la credencial QR es obligatorio.")]
    [MinLength(6, ErrorMessage = "El token de la credencial es demasiado corto.")]
    public string Token { get; init; } = null!;

    [Range(1, int.MaxValue, ErrorMessage = "La zona de acceso es obligatoria.")]
    public int ZonaId { get; init; }
}
