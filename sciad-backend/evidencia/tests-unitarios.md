# Suite de pruebas unitarias (Sciad.Tests) — evidencia

_Fecha: 2026-09-19T01:38:28.000Z. Comando: `docker run --rm -v "${PWD}:/app" -w /app/tests/Sciad.Tests mcr.microsoft.com/dotnet/sdk:8.0 dotnet test`. Runtime: .NET 8 SDK (contenedor, VSTest 17.11.1)._

## Resultado

```
Determining projects to restore...
Restored /app/src/Sciad.Application/Sciad.Application.csproj (in 6.92 sec).
Restored /app/tests/Sciad.Tests/Sciad.Tests.csproj (in 18.21 sec).
Restored /app/src/Sciad.Infrastructure/Sciad.Infrastructure.csproj (in 18.27 sec).
Restored /app/src/Sciad.Api/Sciad.Api.csproj (in 18.27 sec).
1 of 5 projects are up-to-date for restore.
Sciad.Domain -> /app/src/Sciad.Domain/bin/Debug/net8.0/Sciad.Domain.dll
Sciad.Application -> /app/src/Sciad.Application/bin/Debug/net8.0/Sciad.Application.dll
Sciad.Infrastructure -> /app/src/Sciad.Infrastructure/bin/Debug/net8.0/Sciad.Infrastructure.dll
Sciad.Api -> /app/src/Sciad.Api/bin/Debug/net8.0/Sciad.Api.dll
Sciad.Tests -> /app/tests/Sciad.Tests/bin/Debug/net8.0/Sciad.Tests.dll
Test run for /app/tests/Sciad.Tests/bin/Debug/net8.0/Sciad.Tests.dll (.NETCoreApp,Version=v8.0)
VSTest version 17.11.1 (x64)

Starting test execution, please wait...
A total of 1 test files matched the specified pattern.

Passed!  - Failed:     0, Passed:   162, Skipped:     0, Total:   162, Duration: 1 s - Sciad.Tests.dll (net8.0)
```

| Métrica | Valor |
|---|---|
| Total | 162 |
| Passed | 162 |
| Failed | 0 |
| Skipped | 0 |
| Duración | 1 s |

## Cobertura del proyecto (`tests/Sciad.Tests/Services|Auth`)

| Archivo | Área |
|---|---|
| `Services/AuthServiceTests.cs` | Login, JWT |
| `Services/TokenServiceTests.cs` | Emisión/validación de token |
| `Services/CredencialesServiceTests.cs` | Generación/revocación de credenciales QR (SEC-06) |
| `Services/RegistrosAccesoServiceTests.cs` | Escaneo, anti-duplicado (CA-04) |
| `Services/PersonasServiceTests.cs` | CRUD de personas |
| `Services/PerfilesAccesoServiceTests.cs` | Perfiles de acceso (zonas/horarios/vigencias) |
| `Services/ZonasServiceTests.cs` | Zonas de acceso |
| `Services/UsuariosServiceTests.cs` | Usuarios/roles |
| `Services/ReportesServiceTests.cs` | Generación de reportes (CA-07) |
| `Services/NotificacionesServiceTests.cs` | Notificaciones de anomalías (CA-09) |
| `Services/AuditoriaServiceTests.cs` | Reglas de auditoría (CA-08) |
| `Auth/RbacPolicyTests.cs` | Políticas RBAC |

**Conclusión:** los 162 tests unitarios/de integración de `Sciad.Tests` pasan sin fallos ni omisiones sobre .NET 8 SDK en contenedor limpio (reproducible fuera del entorno de desarrollo local).
