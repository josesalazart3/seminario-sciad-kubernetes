# SCIAD — Backend (Fase 2A)

API REST en **C# / .NET 8 (LTS)** + **Entity Framework Core 8** + **PostgreSQL 16** + **JWT**.
Esta fase construye solo la fundación: autenticación (login/me), RBAC, health y el esquema
completo de base de datos con migraciones reales. **No hay endpoints de negocio todavía** (2B–2D).

---

## Stack

| Capa | Tecnología |
|---|---|
| API | ASP.NET Core Web API 8, Swagger/OpenAPI, Serilog (JSON) |
| Application | DTOs, servicios (auth), BCrypt.Net-Next (cost 10), emisión JWT |
| Domain | Entidades del modelo Entidad-Relación (DERCAS §7.2) |
| Infrastructure | EF Core 8 + Npgsql, migraciones, seeder |
| BD | PostgreSQL 16 (Docker) |

## Estructura (capas)

```
sciad-backend/
├── Sciad.sln
├── src/
│   ├── Sciad.Domain/          # Entidades puras (sin dependencias)
│   ├── Sciad.Application/     # DTOs, interfaces, AuthService, TokenService
│   ├── Sciad.Infrastructure/  # SciadDbContext, repositorios, Migrations/, DbSeeder
│   └── Sciad.Api/             # Controllers, Program.cs, middleware de errores
├── Dockerfile                 # multi-etapa sdk → runtime
└── .env.example
```

## Convenciones

- **Carpetas:** `Entities/`, `Migrations/`, `Repositories/`, `Controllers/`, `Services/`, `Dtos/`, `Interfaces/`.
  Nombres de clase en PascalCase; archivos con el mismo nombre de la clase. Un tipo por archivo.
- **Base de datos:** nombres de tablas y columnas en `snake_case` (coinciden con el diccionario
  del DERCAS §7.2). Todas las FK usan `ON DELETE RESTRICT` (§7.4). Sin borrado físico en tablas históricas.
- **Errores:** respuestas RFC 7807 (Problem Details) con `code` y `message` consistentes; middleware
  central que loguea la excepción y devuelve un mensaje genérico (sin filtrar internos).
- **Configuración:** 100% por variables de entorno (nunca secretos en código). `SCIAD_JWT_SECRET`
  es obligatorio (≥ 32 chars) y falla el arranque si falta.
- **Logging:** Serilog a consola en formato JSON (estructurado).

## Arranque (Docker)

Desde la raíz del repositorio (usa `.env` local):

```bash
docker compose up --build
```

- API: `http://localhost:3000`  → Health: `GET /api/health`, Swagger: `/swagger`
- User demo: `admin@sciad.gt` / `seguridad@sciad.gt` / `gerencia@sciad.gt` · password `sciad123`

## Migraciones

```bash
# dentro de un contenedor con el SDK (no requiere .NET local)
dotnet tool install --global dotnet-ef
export PATH="$PATH:$HOME/.dotnet/tools"
cd src
dotnet ef database update --project Sciad.Infrastructure --startup-project Sciad.Api
```

La API además aplica `Migrate()` + seed automáticamente al arrancar (idempotente).

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `ConnectionStrings__Postgres` | Sí | Cadena de conexión Npgsql |
| `Jwt__Secreto` (`SCIAD_JWT_SECRET`) | Sí (≥32 chars) | Clave de firma HS256 |
| `Jwt__MinutosExpiracion` | No (480) | Duración del token (8 h) |
| `Cors__Origins` | No | Orígenes permitidos (coma-separados) |
