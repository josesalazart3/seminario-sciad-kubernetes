# SEC-04 — Rate limiting en /api/auth/login — evidencia

_Fecha: 2026-09-09T05:25:49.861Z. Script: `verify-rl.mjs` contra http://localhost:3000. Límite: 5 intentos/ventana por IP._

| Intento | Credenciales | Código HTTP | Esperado |
|---|---|---|---|
| #1 | inválidas | 401 | 401 |
| #2 | inválidas | 401 | 401 |
| #3 | inválidas | 401 | 401 |
| #4 | inválidas | 401 | 401 |
| #5 | inválidas | 401 | 401 |
| #6 | válidas | 429 | 429 (bloqueado) |
| #7 | inválidas | 429 | 429 (bloqueado) |

**Conclusión:** los primeros 5 intentos con credenciales inválidas devuelven 401; el intento 6 (aunque sea con credenciales correctas) devuelve **429** `RATE_LIMITED`, bloqueando temporalmente la IP durante la ventana configurada. Esto mitiga la fuerza bruta (SEC-04).

> Config en `appsettings.json` / env: `RateLimit__LoginPermitLimit`, `RateLimit__LoginWindowSeconds` (default 5 / 300 s). En producción detrás de nginx, `ForwardedHeaders__KnownProxies` asegura que la partición sea por IP real del cliente y no por la del proxy.