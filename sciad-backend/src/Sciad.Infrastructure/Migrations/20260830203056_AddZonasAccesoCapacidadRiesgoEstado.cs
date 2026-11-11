using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sciad.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddZonasAccesoCapacidadRiesgoEstado : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "capacidad",
                schema: "public",
                table: "zonas_acceso",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "estado",
                schema: "public",
                table: "zonas_acceso",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "activo");

            migrationBuilder.AddColumn<string>(
                name: "nivel_riesgo",
                schema: "public",
                table: "zonas_acceso",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "MEDIO");

            migrationBuilder.CreateIndex(
                name: "ix_zonas_acceso_estado",
                schema: "public",
                table: "zonas_acceso",
                column: "estado");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_zonas_acceso_estado",
                schema: "public",
                table: "zonas_acceso");

            migrationBuilder.DropColumn(
                name: "capacidad",
                schema: "public",
                table: "zonas_acceso");

            migrationBuilder.DropColumn(
                name: "estado",
                schema: "public",
                table: "zonas_acceso");

            migrationBuilder.DropColumn(
                name: "nivel_riesgo",
                schema: "public",
                table: "zonas_acceso");
        }
    }
}
