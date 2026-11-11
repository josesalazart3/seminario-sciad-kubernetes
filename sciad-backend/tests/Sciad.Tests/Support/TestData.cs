using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using Moq;
using Sciad.Application.Services;
using Sciad.Domain.Entities;

namespace Sciad.Tests.Support;

/// <summary>
/// Fábricas de entidades de dominio para las pruebas unitarias. Centralizan la construcción
/// de estados válidos de <see cref="Persona"/>, <see cref="ZonaAcceso"/>,
/// <see cref="PerfilAcceso"/>, <see cref="CredencialQr"/> y <see cref="Usuario"/> para que
/// cada test declare solo lo que varía, no todo el objeto.
/// </summary>
public static class TestData
{
    // ---------------- Persona ----------------
    /// <summary>DPI válido de 13 dígitos (Fase 8): 9 dígitos derivados del id + departamento 01 + municipio 01.</summary>
    public static string DpiValido(int id = 1) => $"{241230000 + id:D9}0101";

    public static Persona PersonaActiva(int id = 1, string nombre = "Ana López") =>
        new() { Id = id, Nombre = nombre, DpiCodigo = DpiValido(id), Tipo = Persona.TipoColaborador, Estado = "activo" };

    public static Persona PersonaInactiva(int id = 1) =>
        new() { Id = id, Nombre = "Inactiva", DpiCodigo = DpiValido(id), Tipo = Persona.TipoVisitante, Estado = "inactivo" };

    // ---------------- Zona ----------------
    public static ZonaAcceso ZonaActiva(int id = 1, string nombre = "Oficinas") =>
        new() { Id = id, Nombre = nombre, NivelSeguridad = "MEDIO", Capacidad = 50, NivelRiesgo = "MEDIO", Estado = "activo" };

    public static ZonaAcceso ZonaInactiva(int id = 1) =>
        new() { Id = id, Nombre = "Clausurada", NivelSeguridad = "ALTO", NivelRiesgo = "ALTO", Estado = "inactivo" };

    // ---------------- Perfil de acceso ----------------
    public static PerfilAcceso PerfilVigente(int id = 1, int personaId = 1, int zonaId = 1) =>
        new()
        {
            Id = id,
            PersonaId = personaId,
            ZonaId = zonaId,
            VigenciaInicio = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(-30)),
            VigenciaFin = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(+30)),
        };

    public static PerfilAcceso PerfilVencido(int id = 1, int personaId = 1, int zonaId = 1) =>
        new()
        {
            Id = id,
            PersonaId = personaId,
            ZonaId = zonaId,
            VigenciaInicio = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(-60)),
            VigenciaFin = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(-1)),
        };

    public static PerfilAcceso PerfilFuturo(int id = 1, int personaId = 1, int zonaId = 1) =>
        new()
        {
            Id = id,
            PersonaId = personaId,
            ZonaId = zonaId,
            VigenciaInicio = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(+10)),
            VigenciaFin = DateOnly.FromDateTime(GuatemalaTime.Now.AddDays(+40)),
        };

    // ---------------- Credencial ----------------
    public static CredencialQr CredencialActiva(int id = 1, int personaId = 1, Persona? persona = null) => new()
    {
        Id = id,
        PersonaId = personaId,
        Persona = persona ?? PersonaActiva(personaId),
        Token = TokenHex($"activa-{id}"),
        Estado = "activa",
        Emitido = DateOnly.FromDateTime(GuatemalaTime.Now),
    };

    public static CredencialQr CredencialEnEstado(string estado, int id = 1, int personaId = 1, Persona? persona = null) =>
        new()
        {
            Id = id,
            PersonaId = personaId,
            Persona = persona ?? PersonaActiva(personaId),
            Token = TokenHex($"{estado}-{id}"),
            Estado = estado,
            Emitido = DateOnly.FromDateTime(GuatemalaTime.Now),
        };

    /// <summary>Token de 64 hex determinista (32 bytes), como los que genera el servicio.</summary>
    public static string TokenHex(string semilla) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(semilla))).ToLowerInvariant();

    // ---------------- Sobre cifrado del QR ----------------
    /// <summary>Clave fija SOLO para pruebas (32 bytes en base64).</summary>
    public const string ClaveQrPrueba = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

    public static readonly CifradoQr CifradoQr = new(ClaveQrPrueba);

    /// <summary>Contenido del QR de la credencial (sobre cifrado con la clave de prueba).</summary>
    public static string Sobre(CredencialQr c) => CifradoQr.Cifrar(c.Id, c.Token);

    // ---------------- Usuario / rol ----------------
    public static Usuario UsuarioGerencia(int id = 1) =>
        new()
        {
            Id = id,
            Nombre = "Gerente",
            Correo = "gerencia@sciad.gt",
            PasswordHash = "$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
            RolId = 3,
            Rol = new Rol { Id = 3, Nombre = "Gerencia", Codigo = "GERENCIA" },
            Estado = "activo",
        };

    public static Usuario UsuarioRol(string codigo, int id = 1) =>
        new()
        {
            Id = id,
            Nombre = $"Usuario {codigo}",
            Correo = $"{codigo.ToLowerInvariant()}@sciad.gt",
            PasswordHash = "$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
            RolId = id,
            Rol = new Rol { Id = id, Nombre = codigo, Codigo = codigo },
            Estado = "activo",
        };

    // ---------------- Registro de acceso ----------------
    public static RegistroAcceso Registro(
        int personaId, int zonaId, string tipo, DateOnly? fecha = null, TimeOnly? hora = null, Persona? persona = null, ZonaAcceso? zona = null) =>
        new()
        {
            Id = personaId * 1000 + zonaId,
            PersonaId = personaId,
            Persona = persona ?? PersonaActiva(personaId),
            ZonaId = zonaId,
            Zona = zona ?? ZonaActiva(zonaId),
            Fecha = fecha ?? DateOnly.FromDateTime(GuatemalaTime.Now),
            Hora = hora ?? TimeOnly.FromDateTime(GuatemalaTime.Now),
            Tipo = tipo,
            UsuarioId = 1,
        };

    // ---------------- Logger no-op para servicios ----------------
    public static ILogger<T> LoggerNulo<T>() => Mock.Of<ILogger<T>>();
}