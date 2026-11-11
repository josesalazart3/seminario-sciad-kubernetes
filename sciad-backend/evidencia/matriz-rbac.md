# Matriz RBAC — evidencia automatizada (SEC-05)

_Fecha: 2026-09-09T04:30:59.793Z. Generada por `verify-seguridad.mjs` contra http://localhost:3000._

### Matriz endpoint × rol (código de estado recibido)

| Endpoint | Método | Anónimo | ADMIN | SEGURIDAD | GERENCIA | ¿Correcto? |
|---|---|---|---|---|---|---|
| `/api/auth/me` | GET | 401 | 200 | 200 | 200 | ✅ |
| `/api/auth/role-check` | GET | 401 | 200 | 403 | 403 | ✅ |
| `/api/zonas-acceso` | GET | 401 | 200 | 200 | 200 | ✅ |
| `/api/zonas-acceso` | POST | 401 | 400 | 403 | 403 | ✅ |
| `/api/zonas-acceso/999999999` | PUT | 401 | 400 | 403 | 403 | ✅ |
| `/api/zonas-acceso/999999999/estado` | PATCH | 401 | 404 | 403 | 403 | ✅ |
| `/api/personas` | GET | 401 | 200 | 403 | 403 | ✅ |
| `/api/personas` | POST | 401 | 400 | 403 | 403 | ✅ |
| `/api/personas/999999999` | PUT | 401 | 400 | 403 | 403 | ✅ |
| `/api/personas/999999999/estado` | PATCH | 401 | 400 | 403 | 403 | ✅ |
| `/api/perfiles-acceso` | GET | 401 | 200 | 403 | 403 | ✅ |
| `/api/perfiles-acceso` | POST | 401 | 400 | 403 | 403 | ✅ |
| `/api/perfiles-acceso/999999999` | DELETE | 401 | 404 | 403 | 403 | ✅ |
| `/api/credenciales` | GET | 401 | 200 | 403 | 403 | ✅ |
| `/api/credenciales/999999999/generar` | POST | 401 | 404 | 403 | 403 | ✅ |
| `/api/credenciales/999999999/reemitir` | POST | 401 | 404 | 403 | 403 | ✅ |
| `/api/credenciales/999999999/revocar` | POST | 401 | 404 | 403 | 403 | ✅ |
| `/api/usuarios` | GET | 401 | 200 | 403 | 403 | ✅ |
| `/api/usuarios` | POST | 401 | 400 | 403 | 403 | ✅ |
| `/api/usuarios/999999999` | PUT | 401 | 400 | 403 | 403 | ✅ |
| `/api/usuarios/999999999/estado` | PATCH | 401 | 400 | 403 | 403 | ✅ |
| `/api/registros-acceso` | GET | 401 | 200 | 403 | 200 | ✅ |
| `/api/registros-acceso/hoy` | GET | 401 | 200 | 200 | 403 | ✅ |
| `/api/registros-acceso` | POST | 401 | 400 | 400 | 403 | ✅ |
| `/api/notificaciones` | GET | 401 | 200 | 403 | 200 | ✅ |
| `/api/notificaciones/999999999/leida` | PATCH | 401 | 404 | 403 | 404 | ✅ |
| `/api/auditoria` | GET | 401 | 200 | 403 | 200 | ✅ |
| `/api/auditoria/verificar` | POST | 401 | 200 | 403 | 403 | ✅ |
| `/api/auditoria/999999999/estado` | PATCH | 401 | 404 | 403 | 404 | ✅ |
| `/api/reportes` | GET | 401 | 200 | 403 | 200 | ✅ |
| `/api/reportes/generar` | POST | 401 | 200 | 403 | 200 | ✅ |
| `/api/health` | GET | 200 | 200 | 200 | 200 | ✅ |

> **Lectura:** 401 = sin autenticar; 403 = rol autenticado sin permiso; resto (200/201/400/404/409) = pasó autorización. Columna "Anónimo" además de 401 espera que /api/health sea público (200).
