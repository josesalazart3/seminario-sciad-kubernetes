using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Sciad.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "public");

            migrationBuilder.CreateTable(
                name: "personas",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    nombre = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    dpi_codigo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    tipo = table.Column<int>(type: "integer", nullable: false),
                    estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "activo")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_personas", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "roles",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    nombre = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    codigo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_roles", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "zonas_acceso",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    nombre = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    nivel_seguridad = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_zonas_acceso", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "auditoria",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tipo = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    descripcion = table.Column<string>(type: "text", nullable: false),
                    persona_id = table.Column<int>(type: "integer", nullable: true),
                    estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    fecha = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_auditoria", x => x.id);
                    table.ForeignKey(
                        name: "fk_auditoria_personas_persona_id",
                        column: x => x.persona_id,
                        principalSchema: "public",
                        principalTable: "personas",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "credenciales_qr",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    persona_id = table.Column<int>(type: "integer", nullable: false),
                    token = table.Column<string>(type: "char(64)", nullable: false),
                    estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "activa"),
                    emitido = table.Column<DateOnly>(type: "date", nullable: false),
                    reemitido_de = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_credenciales_qr", x => x.id);
                    table.ForeignKey(
                        name: "fk_credenciales_qr_credenciales_qr_reemitido_de",
                        column: x => x.reemitido_de,
                        principalSchema: "public",
                        principalTable: "credenciales_qr",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_credenciales_qr_personas_persona_id",
                        column: x => x.persona_id,
                        principalSchema: "public",
                        principalTable: "personas",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "usuarios",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    nombre = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    correo = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    password_hash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    rol_id = table.Column<int>(type: "integer", nullable: false),
                    estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "activo"),
                    puesto = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    fecha_creacion = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_usuarios", x => x.id);
                    table.ForeignKey(
                        name: "fk_usuarios_roles_rol_id",
                        column: x => x.rol_id,
                        principalSchema: "public",
                        principalTable: "roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "perfiles_acceso",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    persona_id = table.Column<int>(type: "integer", nullable: false),
                    zona_id = table.Column<int>(type: "integer", nullable: false),
                    vigencia_inicio = table.Column<DateOnly>(type: "date", nullable: false),
                    vigencia_fin = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_perfiles_acceso", x => x.id);
                    table.ForeignKey(
                        name: "fk_perfiles_acceso_personas_persona_id",
                        column: x => x.persona_id,
                        principalSchema: "public",
                        principalTable: "personas",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_perfiles_acceso_zonas_acceso_zona_id",
                        column: x => x.zona_id,
                        principalSchema: "public",
                        principalTable: "zonas_acceso",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "notificaciones",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    usuario_id = table.Column<int>(type: "integer", nullable: true),
                    persona_id = table.Column<int>(type: "integer", nullable: true),
                    tipo = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    mensaje = table.Column<string>(type: "text", nullable: false),
                    leida = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notificaciones", x => x.id);
                    table.ForeignKey(
                        name: "fk_notificaciones_personas_persona_id",
                        column: x => x.persona_id,
                        principalSchema: "public",
                        principalTable: "personas",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notificaciones_usuarios_usuario_id",
                        column: x => x.usuario_id,
                        principalSchema: "public",
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "registros_acceso",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    persona_id = table.Column<int>(type: "integer", nullable: false),
                    zona_id = table.Column<int>(type: "integer", nullable: false),
                    fecha = table.Column<DateOnly>(type: "date", nullable: false),
                    hora = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    tipo = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    usuario_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_registros_acceso", x => x.id);
                    table.CheckConstraint("CK_registros_acceso_tipo", "tipo IN ('ingreso','egreso')");
                    table.ForeignKey(
                        name: "fk_registros_acceso_personas_persona_id",
                        column: x => x.persona_id,
                        principalSchema: "public",
                        principalTable: "personas",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_registros_acceso_usuarios_usuario_id",
                        column: x => x.usuario_id,
                        principalSchema: "public",
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_registros_acceso_zonas_acceso_zona_id",
                        column: x => x.zona_id,
                        principalSchema: "public",
                        principalTable: "zonas_acceso",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "reportes",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    periodo = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    total_registros = table.Column<int>(type: "integer", nullable: false),
                    generado = table.Column<DateOnly>(type: "date", nullable: false),
                    usuario_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reportes", x => x.id);
                    table.ForeignKey(
                        name: "fk_reportes_usuarios_usuario_id",
                        column: x => x.usuario_id,
                        principalSchema: "public",
                        principalTable: "usuarios",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_auditoria_fecha",
                schema: "public",
                table: "auditoria",
                column: "fecha");

            migrationBuilder.CreateIndex(
                name: "ix_auditoria_persona_id",
                schema: "public",
                table: "auditoria",
                column: "persona_id");

            migrationBuilder.CreateIndex(
                name: "ix_credenciales_qr_persona_id_estado",
                schema: "public",
                table: "credenciales_qr",
                columns: new[] { "persona_id", "estado" });

            migrationBuilder.CreateIndex(
                name: "ix_credenciales_qr_reemitido_de",
                schema: "public",
                table: "credenciales_qr",
                column: "reemitido_de");

            migrationBuilder.CreateIndex(
                name: "ix_credenciales_qr_token",
                schema: "public",
                table: "credenciales_qr",
                column: "token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_notificaciones_persona_id",
                schema: "public",
                table: "notificaciones",
                column: "persona_id");

            migrationBuilder.CreateIndex(
                name: "ix_notificaciones_usuario_id_leida",
                schema: "public",
                table: "notificaciones",
                columns: new[] { "usuario_id", "leida" });

            migrationBuilder.CreateIndex(
                name: "ix_perfiles_acceso_persona_id_vigencia_inicio_vigencia_fin",
                schema: "public",
                table: "perfiles_acceso",
                columns: new[] { "persona_id", "vigencia_inicio", "vigencia_fin" });

            migrationBuilder.CreateIndex(
                name: "ix_perfiles_acceso_zona_id",
                schema: "public",
                table: "perfiles_acceso",
                column: "zona_id");

            migrationBuilder.CreateIndex(
                name: "ix_personas_dpi_codigo",
                schema: "public",
                table: "personas",
                column: "dpi_codigo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_registros_acceso_persona_id_fecha",
                schema: "public",
                table: "registros_acceso",
                columns: new[] { "persona_id", "fecha" });

            migrationBuilder.CreateIndex(
                name: "ix_registros_acceso_tipo_fecha",
                schema: "public",
                table: "registros_acceso",
                columns: new[] { "tipo", "fecha" });

            migrationBuilder.CreateIndex(
                name: "ix_registros_acceso_usuario_id",
                schema: "public",
                table: "registros_acceso",
                column: "usuario_id");

            migrationBuilder.CreateIndex(
                name: "ix_registros_acceso_zona_id_fecha",
                schema: "public",
                table: "registros_acceso",
                columns: new[] { "zona_id", "fecha" });

            migrationBuilder.CreateIndex(
                name: "uq_ingreso_diario",
                schema: "public",
                table: "registros_acceso",
                columns: new[] { "persona_id", "fecha", "tipo" },
                unique: true,
                filter: "tipo = 'ingreso'");

            migrationBuilder.CreateIndex(
                name: "ix_reportes_usuario_id",
                schema: "public",
                table: "reportes",
                column: "usuario_id");

            migrationBuilder.CreateIndex(
                name: "ix_roles_codigo",
                schema: "public",
                table: "roles",
                column: "codigo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_roles_nombre",
                schema: "public",
                table: "roles",
                column: "nombre",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_usuarios_correo",
                schema: "public",
                table: "usuarios",
                column: "correo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_usuarios_estado",
                schema: "public",
                table: "usuarios",
                column: "estado");

            migrationBuilder.CreateIndex(
                name: "ix_usuarios_rol_id",
                schema: "public",
                table: "usuarios",
                column: "rol_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auditoria",
                schema: "public");

            migrationBuilder.DropTable(
                name: "credenciales_qr",
                schema: "public");

            migrationBuilder.DropTable(
                name: "notificaciones",
                schema: "public");

            migrationBuilder.DropTable(
                name: "perfiles_acceso",
                schema: "public");

            migrationBuilder.DropTable(
                name: "registros_acceso",
                schema: "public");

            migrationBuilder.DropTable(
                name: "reportes",
                schema: "public");

            migrationBuilder.DropTable(
                name: "personas",
                schema: "public");

            migrationBuilder.DropTable(
                name: "zonas_acceso",
                schema: "public");

            migrationBuilder.DropTable(
                name: "usuarios",
                schema: "public");

            migrationBuilder.DropTable(
                name: "roles",
                schema: "public");
        }
    }
}
