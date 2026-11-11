using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sciad.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonasDpiCodigoCheck : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Fase 8: si ya hay DPI que no son de 13 dígitos, la migración falla con un mensaje claro (no en silencio)
            // en lugar del error genérico de PostgreSQL. Solución: corregir esas filas o ejecutar scripts/reset-datos.
            migrationBuilder.Sql("""
                DO $$
                DECLARE invalidas integer;
                BEGIN
                    SELECT count(*) INTO invalidas FROM public.personas WHERE dpi_codigo !~ '^[0-9]{13}$';
                    IF invalidas > 0 THEN
                        RAISE EXCEPTION 'SCIAD: % persona(s) con dpi_codigo que no tiene 13 digitos. Corrijalas o ejecute scripts/reset-datos antes de migrar (CK_personas_dpi_codigo).', invalidas;
                    END IF;
                END $$;
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_personas_dpi_codigo",
                schema: "public",
                table: "personas",
                sql: "dpi_codigo ~ '^[0-9]{13}$'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_personas_dpi_codigo",
                schema: "public",
                table: "personas");
        }
    }
}
