using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sciad.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonasTipoCheck : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddCheckConstraint(
                name: "CK_personas_tipo",
                schema: "public",
                table: "personas",
                sql: "tipo IN (1, 2)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_personas_tipo",
                schema: "public",
                table: "personas");
        }
    }
}
