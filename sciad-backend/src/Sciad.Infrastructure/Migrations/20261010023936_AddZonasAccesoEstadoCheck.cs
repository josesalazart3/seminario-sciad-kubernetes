using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sciad.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddZonasAccesoEstadoCheck : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Fase 8.4: la columna estado ya existía (AddZonasAccesoCapacidadRiesgoEstado) sin CHECK. Se normalizan los
            // valores existentes antes de restringirlos, para no fallar sobre una base en uso ("Activo " → "activo").
            migrationBuilder.Sql("UPDATE public.zonas_acceso SET estado = lower(btrim(estado)) WHERE estado <> lower(btrim(estado));");

            migrationBuilder.AddCheckConstraint(
                name: "CK_zonas_acceso_estado",
                schema: "public",
                table: "zonas_acceso",
                sql: "estado IN ('activo', 'inactivo')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_zonas_acceso_estado",
                schema: "public",
                table: "zonas_acceso");
        }
    }
}
