# SCIAD — Frontend

> **Sistema de Control Integral de Identidad y Acceso Digital** basado en Credenciales QR Cifradas y Arquitectura Cloud (Proyecto de Graduación II — Universidad Mariano Gálvez de Guatemala).

Frontend Angular para el control de acceso físico por credenciales QR. **Fase 1:** aplicación completa y navegable con datos simulados (mock), lista para conectarse a una API real en la Fase 2 sin rehacer código.

---

## 🚀 Arranque rápido (Docker)

Requisitos: [Docker](https://www.docker.com/products/docker-desktop/) (con Docker Compose).

```bash
# desde la raíz del repositorio
docker compose up --build
```

Abre [http://localhost:8080](http://localhost:8080).

### Cuentas demo (usuarios simulados)

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `sciad123` |
| Personal de Seguridad | `seguridad` | `sciad123` |
| Gerencia / Auditoría | `gerencia` | `sciad123` |

> Token QR de ejemplo para la pantalla de escaneo: **`SC1AD-0101`** (autorizado) y **`SC1AD-0109`** (revocado → denegado).

## 🧑‍💻 Desarrollo local

Requisitos: Node.js ≥ 20.19, Angular CLI ≥ 22.

```bash
npm install
ng serve        # → http://localhost:4200
```

## 🏗️ Estructura del proyecto

```
sciad-frontend/
├── src/
│   ├── app/
│   │   ├── core/          # modelos de dominio, servicios, guards, datos mock
│   │   │   ├── models/    #   Usuario, Credencial, PerfilAcceso, RegistroAcceso…
│   │   │   ├── data/      #   mock-db + interceptor HTTP (/api/**)
│   │   │   ├── services/  #   AuthService, UsersService, CredentialsService…
│   │   │   └── auth/      #   guards de ruta (auth, admin, seguridad, gerencia)
│   │   ├── shared/
│   │   │   ├── layout/    #   app-shell: sidebar + topbar según rol, responsive
│   │   │   └── ui/        #   botones, inputs, modales, toasts, badges, KPIs
│   │   ├── features/
│   │   │   ├── auth/      #   login (CU-01)
│   │   │   ├── admin/     #   dashboard, usuarios, perfiles, credenciales, auditoría
│   │   │   ├── security/  #   escaneo QR, accesos del turno (mobile-first)
│   │   │   ├── management/#   trazabilidad, notificaciones, reportes
│   │   │   └── reports/   #   reporte consolidado + exportación CSV
│   │   ├── app.routes.ts  #   rutas lazy + guard por rol
│   │   └── app.config.ts  #   proveedores HTTP con interceptor mock
│   └── styles/            # design tokens, base, layout, tablas
├── Dockerfile             # build Angular (node) → nginx multi-etapa
├── nginx.conf             # SPA fallback + cabeceras de seguridad
└── DESIGN_SYSTEM.md       # sistema de diseño (paleta, tipografía, componentes)
```

## 🔌 Cómo se conectará con el backend real (Fase 2)

Los componentes usan `HttpClient` contra rutas `/api/**`. En esta fase, un **interceptor HTTP mock** responde desde una base en memoria con latencia simulada. Para conectar el backend real:

1. Quitar `mockInterceptor` de `app.config.ts` (`withInterceptors([...])`).
2. Cambiar `apiUrl` en `src/environments/environment.ts` a la URL del API.
3. En `docker-compose.yml`, descomentar los servicios `backend` y `db` (ya documentados) y el proxy en `nginx.conf`.

Ningún componente necesita cambios.

## ✨ Roles y rutas

| Rol | Ruta de inicio |
|---|---|
| Administrador | `/admin/dashboard` |
| Personal de Seguridad | `/seguridad/escaneo` |
| Gerencia / Auditoría | `/gerencia/trazabilidad` |