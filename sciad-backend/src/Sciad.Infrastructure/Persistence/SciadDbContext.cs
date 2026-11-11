using Microsoft.EntityFrameworkCore;
using Sciad.Domain.Entities;

namespace Sciad.Infrastructure.Persistence;

/// <summary>
/// Contexto EF Core (Code First). Nombres de columnas en snake_case para
/// coincidir con el diccionario de datos del DERCAS §7.2. Todas las FK
/// usan <c>ON DELETE RESTRICT</c> (integridad referencial §7.4).
/// </summary>
public class SciadDbContext : DbContext
{
    public SciadDbContext(DbContextOptions<SciadDbContext> options) : base(options)
    {
    }

    public DbSet<Rol> Roles => Set<Rol>();
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<Persona> Personas => Set<Persona>();
    public DbSet<ZonaAcceso> ZonasAcceso => Set<ZonaAcceso>();
    public DbSet<PerfilAcceso> PerfilesAcceso => Set<PerfilAcceso>();
    public DbSet<CredencialQr> CredencialesQr => Set<CredencialQr>();
    public DbSet<RegistroAcceso> RegistrosAcceso => Set<RegistroAcceso>();
    public DbSet<Reporte> Reportes => Set<Reporte>();
    public DbSet<Auditoria> Auditorias => Set<Auditoria>();
    public DbSet<Notificacion> Notificaciones => Set<Notificacion>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("public");

        // ---- roles ----
        modelBuilder.Entity<Rol>(e =>
        {
            e.ToTable("roles");
            e.Property(r => r.Nombre).HasMaxLength(40).IsRequired();
            e.Property(r => r.Codigo).HasMaxLength(20).IsRequired();
            e.HasIndex(r => r.Nombre).IsUnique();
            e.HasIndex(r => r.Codigo).IsUnique();
        });

        // ---- usuarios ----
        modelBuilder.Entity<Usuario>(e =>
        {
            e.ToTable("usuarios");
            e.Property(u => u.Nombre).HasMaxLength(120).IsRequired();
            e.Property(u => u.Correo).HasMaxLength(120).IsRequired();
            e.Property(u => u.PasswordHash).HasMaxLength(100).IsRequired();
            e.Property(u => u.Estado).HasMaxLength(20).HasDefaultValue("activo");
            e.Property(u => u.Puesto).HasMaxLength(120);
            e.Property(u => u.FechaCreacion).HasColumnType("timestamp with time zone");

            e.HasIndex(u => u.Correo).IsUnique();
            e.HasIndex(u => u.Estado);

            e.HasOne(u => u.Rol)
                .WithMany(r => r.Usuarios)
                .HasForeignKey(u => u.RolId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ---- personas ----
        modelBuilder.Entity<Persona>(e =>
        {
            e.ToTable("personas");
            e.Property(p => p.Nombre).HasMaxLength(120).IsRequired();
            e.Property(p => p.DpiCodigo).HasMaxLength(20).IsRequired();
            e.Property(p => p.Estado).HasMaxLength(20).HasDefaultValue("activo");

            // CHECK IN (1, 2) — 1 = colaborador, 2 = visitante (DERCAS §7.2/§7.4)
            e.ToTable(t => t.HasCheckConstraint("CK_personas_tipo", "tipo IN (1, 2)"));

            // DPI de 13 dígitos (Fase 8, defensa en profundidad: la regla completa vive en ValidacionPersona).
            e.ToTable(t => t.HasCheckConstraint("CK_personas_dpi_codigo", "dpi_codigo ~ '^[0-9]{13}$'"));

            e.HasIndex(p => p.DpiCodigo).IsUnique();
        });

        // ---- zonas_acceso ----
        modelBuilder.Entity<ZonaAcceso>(e =>
        {
            e.ToTable("zonas_acceso");
            e.Property(z => z.Nombre).HasMaxLength(80).IsRequired();
            e.Property(z => z.NivelSeguridad).HasMaxLength(20).IsRequired();
            // Adenda 2B: capacidad (aforo), nivel_riesgo y estado (baja lógica, DERCAS no la definía).
            e.Property(z => z.Capacidad);
            e.Property(z => z.NivelRiesgo).HasMaxLength(20).IsRequired().HasDefaultValue("MEDIO");
            e.Property(z => z.Estado).HasMaxLength(20).HasDefaultValue("activo");

            // Fase 8.4: baja lógica solo con valores válidos (deshabilitar = 'inactivo'; nunca borrado físico, RNF-06).
            e.ToTable(t => t.HasCheckConstraint("CK_zonas_acceso_estado", "estado IN ('activo', 'inactivo')"));
            e.HasIndex(z => z.Estado);
        });

        // ---- perfiles_acceso ----
        modelBuilder.Entity<PerfilAcceso>(e =>
        {
            e.ToTable("perfiles_acceso");
            e.HasOne(p => p.Persona)
                .WithMany(p => p.Perfiles)
                .HasForeignKey(p => p.PersonaId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(p => p.Zona)
                .WithMany(z => z.Perfiles)
                .HasForeignKey(p => p.ZonaId)
                .OnDelete(DeleteBehavior.Restrict);

            // Índice del DERCAS §7.3
            e.HasIndex(p => new { p.PersonaId, p.VigenciaInicio, p.VigenciaFin });
        });

        // ---- credenciales_qr ----
        modelBuilder.Entity<CredencialQr>(e =>
        {
            e.ToTable("credenciales_qr");
            e.Property(c => c.Token).HasColumnType("char(64)").IsRequired();
            e.Property(c => c.Estado).HasMaxLength(20).HasDefaultValue("activa");
            e.Property(c => c.Motivo).HasMaxLength(200);

            e.HasIndex(c => c.Token).IsUnique();
            e.HasIndex(c => new { c.PersonaId, c.Estado });

            e.HasOne(c => c.Persona)
                .WithMany(p => p.Credenciales)
                .HasForeignKey(c => c.PersonaId)
                .OnDelete(DeleteBehavior.Restrict);

            // Autoreferencia de reemisión (reemitido_de → credenciales_qr.id)
            e.HasOne(c => c.ReemitidaDeCredencial)
                .WithMany()
                .HasForeignKey(c => c.ReemitidoDe)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ---- registros_acceso ----
        modelBuilder.Entity<RegistroAcceso>(e =>
        {
            e.ToTable("registros_acceso");
            e.Property(r => r.Tipo).HasMaxLength(10).IsRequired();
            // CHECK IN ('ingreso','egreso') — DERCAS §7.4
            e.ToTable(t => t.HasCheckConstraint("CK_registros_acceso_tipo", "tipo IN ('ingreso','egreso')"));

            e.HasOne(r => r.Persona)
                .WithMany(p => p.Registros)
                .HasForeignKey(r => r.PersonaId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.Zona)
                .WithMany(z => z.Registros)
                .HasForeignKey(r => r.ZonaId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.Usuario)
                .WithMany(u => u.Registros)
                .HasForeignKey(r => r.UsuarioId)
                .OnDelete(DeleteBehavior.Restrict);

            // Índices del DERCAS §7.3
            e.HasIndex(r => new { r.PersonaId, r.Fecha });
            e.HasIndex(r => new { r.ZonaId, r.Fecha });
            e.HasIndex(r => new { r.Tipo, r.Fecha });
            // Previene doble ingreso el mismo día (solo tipo='ingreso')
            e.HasIndex(r => new { r.PersonaId, r.Fecha, r.Tipo })
                .HasDatabaseName("uq_ingreso_diario")
                .IsUnique()
                .HasFilter("tipo = 'ingreso'");
        });

        // ---- reportes ----
        modelBuilder.Entity<Reporte>(e =>
        {
            e.ToTable("reportes");
            e.Property(r => r.Periodo).HasMaxLength(80).IsRequired();
            e.HasOne(r => r.Usuario)
                .WithMany(u => u.Reportes)
                .HasForeignKey(r => r.UsuarioId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ---- auditoria ----
        modelBuilder.Entity<Auditoria>(e =>
        {
            e.ToTable("auditoria");
            e.Property(a => a.Tipo).HasMaxLength(30).IsRequired();
            e.Property(a => a.Descripcion).HasColumnType("text").IsRequired();
            e.Property(a => a.Estado).HasMaxLength(20).IsRequired();

            e.HasOne(a => a.Persona)
                .WithMany(p => p.Auditorias)
                .HasForeignKey(a => a.PersonaId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(a => a.Fecha);
        });

        // ---- notificaciones ----
        modelBuilder.Entity<Notificacion>(e =>
        {
            e.ToTable("notificaciones");
            e.Property(n => n.Tipo).HasMaxLength(30).IsRequired();
            e.Property(n => n.Mensaje).HasColumnType("text").IsRequired();
            e.Property(n => n.Leida).HasDefaultValue(false);
            e.Property(n => n.Fecha).HasDefaultValueSql("CURRENT_TIMESTAMP");

            e.HasOne(n => n.Usuario)
                .WithMany(u => u.Notificaciones)
                .HasForeignKey(n => n.UsuarioId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(n => n.Persona)
                .WithMany(p => p.Notificaciones)
                .HasForeignKey(n => n.PersonaId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(n => new { n.UsuarioId, n.Leida });
            e.HasIndex(n => n.Fecha);
        });
    }
}
