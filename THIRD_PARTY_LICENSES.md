# Licencias de componentes de terceros

SCIAD utiliza los componentes de terceros que se listan abajo. Cada uno se rige por su propia licencia, no por la licencia propietaria de este repositorio (ver `LICENSE`). Al redistribuir el software hay que conservar los avisos de copyright y de licencia de cada componente.

> Esta es la lista de los **componentes principales**. El inventario completo por paquete debe generarse desde los archivos de dependencias del proyecto y revisarse antes de cualquier distribución comercial (ver el final de este documento). Las licencias de esta tabla son las que declaran los propios proyectos; cuando no estoy seguro de una versión concreta se indica "por verificar".

| Componente | Uso en SCIAD | Licencia |
|---|---|---|
| Angular | Frontend | MIT |
| .NET 8 / ASP.NET Core | Backend | MIT |
| Entity Framework Core | Acceso a datos | MIT |
| Npgsql y Npgsql.EntityFrameworkCore.PostgreSQL | Conexión a PostgreSQL | PostgreSQL License |
| Serilog | Registro de eventos | Apache 2.0 |
| PostgreSQL 16 | Base de datos | PostgreSQL License |
| nginx | Servidor web del frontend | BSD de 2 cláusulas |
| Kubernetes y k3s | Orquestación | Apache 2.0 |
| Traefik | Ingress | MIT |
| cert-manager | Certificados TLS automáticos | Apache 2.0 |
| Let's Encrypt | Autoridad certificadora | Servicio gratuito de ISRG (no es software incluido) |
| Trivy, OWASP ZAP | Herramientas de prueba (no se distribuyen) | Apache 2.0 |
| Gitleaks | Herramienta de prueba (no se distribuye) | MIT |

Los demás paquetes npm y NuGet del proyecto: por verificar con el inventario completo.

## Cómo generar el inventario completo

Frontend (carpeta `sciad-frontend`):

```
npx license-checker --summary
npx license-checker --csv --out licencias-frontend.csv
```

Backend (carpeta `sciad-backend`):

```
dotnet list package --include-transitive
```

y revisar la licencia de cada paquete en su página de NuGet. Señalar cualquier licencia que no sea permisiva (por ejemplo GPL o AGPL), porque podría ser incompatible con una licencia propietaria.
