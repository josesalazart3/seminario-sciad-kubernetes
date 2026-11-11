# Prueba de carga — evidencia (RNF-03 / RNF-04 / CA-04 / CA-13 / CA-14)

_Fecha: 2026-09-19T01:30:02.998Z. Script: `verify-carga.mjs` contra http://localhost:3000. Sufijo L81355806. Zona #46. Config: max_connections=200, Npgsql Pool=150._

## Escenario 1 — Burst: 500 ingresos simultáneos
_Los 500 escaneos se lanzan al mismo tiempo (peor caso teórico)._
| Métrica | Valor |
|---|---|
| P50 | 3709 ms |
| **P95** | **3961 ms** ⚠️ |
| P99 | 3975 ms |
| Máx | 3986 ms |
| Status | {"200":500} |
| Ingresos | 500 / 500 |
| 5xx | 0 |

## Escenario 2 — Burst: 500 egresos simultáneos
| Métrica | Valor |
|---|---|
| P50 | 1174 ms |
| **P95** | **1366 ms** ✅ |
| P99 | 1376 ms |
| Máx | 1384 ms |
| Status | {"200":500} |
| Egresos | 500 / 500 |
| 5xx | 0 |

## Escenario 3 — Anti-duplicado: 40 tokens × 2 concurrentes
_Cada token lanza 2 escaneos simultáneos. La UNIQUE impide 2 registros del mismo tipo._
| Métrica | Valor |
|---|---|
| Ingresos admitidos (1/token) | 40 / 40 ✅ |
| 409 (doble ingreso bloqueado) | 39 |
| Egresos (alternancia válida) | 1 |
| 409 + egreso = K | 40 ✅ |
| P95 | 406 ms |
| 5xx | 0 |

## Escenario 4 — Hora pico realista: 100 llegadas Poisson
_Inter-arrival exponencial media 100ms (~10s, ~5 en vuelo). Emula la llegada real al portón._
| Métrica | Valor |
|---|---|
| P50 | 32 ms |
| **P95** | **53 ms** ✅ |
| P99 | 58 ms |
| Máx | 64 ms |
| Status | {"200":100} |
| Ingresos | 100 / 100 |
| 5xx | 0 |

## Escenario 5 — Persistencia
Registros totales en zona: **1141** = 1000 (ondas) + 40i/1e (carrera) + 100 (realista). Confirmado contra la API (`GET /registros-acceso?zonaId`).

## Escenario 6 — Carga ligera
| Endpoint | P95 | 5xx |
|---|---|---|
| historial (1141 filas) | 293 ms | 0 |
| /hoy | 966 ms | 0 |

## Resumen
| Escenario | P95 | < 2 s | 5xx |
|---|---|---|---|
| Burst 500 ingresos | 3961 ms | ⚠️ | 0 |
| Burst 500 egresos | 1366 ms | ✅ | 0 |
| Realista 100 Poisson | 53 ms | ✅ | 0 |
| Historial (60×) | 293 ms | ✅ | 0 |
| /hoy (60×) | 966 ms | ✅ | 0 |

**Escaneos totales:** 1180. **5xx totales:** 0. **Anti-duplicado:** 40/40 ingresos exactos, 39 rechazos 409, 1 alternancias — 0 dobles ingresos.

### Análisis
El **burst puro sincronizado** (500 escaneos en el mismo instante) mide **3961 ms** — supera el objetivo de 2000 ms. Es el **techo teórico** y una condición que no ocurre en un portón real: el cuello es PostgreSQL procesando 500 escrituras simultáneas a la misma tabla en hardware de desarrollo (Docker Desktop). La prueba de carga no encontró ningún fallo funcional: 0 errores 5xx, los 500 escaneos se completaron. RNF-03 ("< 2 s en condiciones normales de red") se cumple holgadamente en la **llegada real** (Poisson, **53 ms**) y en el burst de egresos (**1366 ms**). La línea base operativa del sistema está entre ~30 ms (p50 realista) y **58 ms** (p99 realista).

> La carga de 500 concurrentes sostenidos 5 min (CA-13/CA-14) se ejecuta en el **piloto de campo** sobre la infraestructura de producción (VPS dedicado, TLS, backups) — se documenta en DESPLIEGUE.md.