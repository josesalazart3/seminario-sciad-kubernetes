using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sciad.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificacionFechaYCredencialMotivo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Fase 3 (decisión de usuario): las notificaciones no tenían fecha (el DERCAS §7.2 no la
            // definía), pero el frontend la necesita para ordenar y mostrar "hace X".
            migrationBuilder.AddColumn<DateTime>(
                name: "fecha",
                schema: "public",
                table: "notificaciones",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.CreateIndex(
                name: "ix_notificaciones_fecha",
                schema: "public",
                table: "notificaciones",
                column: "fecha");

            // Fase 3 (decisión de usuario): el frontend ya modelaba motivo al revocar una credencial
            // (trazabilidad). Se agrega la columna en credenciales_qr en vez de una tabla aparte.
            migrationBuilder.AddColumn<string>(
                name: "motivo",
                schema: "public",
                table: "credenciales_qr",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "motivo",
                schema: "public",
                table: "credenciales_qr");

            migrationBuilder.DropIndex(
                name: "ix_notificaciones_fecha",
                schema: "public",
                table: "notificaciones");

            migrationBuilder.DropColumn(
                name: "fecha",
                schema: "public",
                table: "notificaciones");
        }
    }
}
