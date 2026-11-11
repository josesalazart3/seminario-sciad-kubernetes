# SCIAD — Guía de despliegue en producción (VPS)

_Proyecto de Graduación II — Universidad Mariano Gálvez de Guatemala._
_Aplicable al VPS objetivo (DERCAS): **Contabo, 4 vCPU / 8 GB RAM**, Ubuntu 22.04+, Docker + Docker Compose plugin._

Esta guía es el entregable de **Fase 4 §2.5 (preparación de despliegue)**. No se despliega de forma automática en el
repositorio; los pasos están listos para ejecutarse en el VPS real de forma segura y reproducible.

---

## 1. Arquitectura de producción

```
                     (Internet)
                         │
              ┌──────────▼──────────────┐
              │   nginx (contenedor)    │    puertos 80→443 (TLS Let's Encrypt)
              │   Termina TLS + SPA     │    Sirve la app Angular + proxy /api
              └──────────┬──────────────┘
                         │   red interna 172.20.0.0/24 (sin puertos al host)
                 ┌───────▼────────┐   ┌───────────────┐
                 │   backend .NET  │──▶│  PostgreSQL 16 │
                 │   172.20.0.20   │   │  172.20.0.30   │
                 └────────────────┘   └───────────────┘
```

- **No se exponen puertos de la BD** ni del backend al exterior.
- El **rate-limit de login (SEC-04)** sigue funcional porque el backend confía en la IP del proxy
  (`ForwardedHeaders__KnownProxies=172.20.0.10`, IP estática del contenedor nginx). Detrás de nginx, la IP real del
  cliente viaja en `X-Forwarded-For`.

---

## 2. Requisitos previos

### 2.1 Dominio y DNS
- Un dominio, p. ej. `sciad.gt`. Crear registro **A** → IP pública del VPS: `sciad.gt` y `www.sciad.gt`.
- Esperar a que el DNS propague (`dig sciad.gt +short` debe devolver la IP).

### 2.2 Software del VPS
```bash
curl -fsSL https://get.docker.com | sh && sudo systemctl enable --now docker
sudo apt install -y docker-compose-plugin git certbot
```

### 2.3 Secretos de entorno
```bash
git clone <url-del-repositorio> sciad && cd sciad
cp .env.prod.example .env.prod
# editar con valores reales:
#   POSTGRES_PASSWORD  →  openssl rand -base64 24
#   SCIAD_JWT_SECRET   →  openssl rand -base64 48
#   QR_ENCRYPTION_KEY  →  openssl rand -base64 32   (obligatoria, ver §2.4)
#   SCIAD_CORS_ORIGINS →  https://sciad.gt
nano .env.prod && chmod 600 .env.prod     # .env.prod está en .gitignore
```

### 2.4 Clave de las credenciales QR (`QR_ENCRYPTION_KEY`)
El QR de cada credencial no lleva el token en claro: lleva un **sobre cifrado y autenticado** (AES-256-GCM),
`SCIAD1.` + base64url(identificador de clave ‖ id de la credencial ‖ nonce ‖ token cifrado ‖ etiqueta). El servidor lo
descifra y verifica al escanear; un QR alterado, de otra versión o cifrado con otra clave se rechaza igual que un token
inexistente (`TOKEN_INVALIDO`). La base de datos sigue guardando el token aleatorio; el sobre no se almacena.

- Genérela **en el VPS** sin mostrarla en pantalla:
  ```bash
  # solo la crea si aún no existe (volver a ejecutarlo NO la cambia)
  grep -q '^QR_ENCRYPTION_KEY=.\+' .env.prod || { sed -i '/^QR_ENCRYPTION_KEY=/d' .env.prod; echo "QR_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env.prod; }
  grep -c '^QR_ENCRYPTION_KEY=.\+' .env.prod     # debe imprimir 1 (no muestra la clave)
  ```
- Es **obligatoria**: si falta o no mide 32 bytes, `docker compose` se detiene y el backend no arranca (mensaje claro,
  sin mostrar la clave).
- **Perderla o cambiarla invalida todas las credenciales emitidas** (habría que reemitirlas). Guárdela en el gestor de
  contraseñas y respáldela junto con la copia de seguridad de `.env.prod` (§7.2).
- Los QR del formato anterior (64 caracteres hexadecimales) **ya no son válidos**. Antes del lanzamiento la base de
  producción se reinicia con `scripts/reset-datos.sh`, que emite credenciales nuevas con el formato cifrado.

---

## 3. Construir las imágenes

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml build
```

- `frontend` → `Dockerfile.prod` (SPA Angular + `nginx.prod.conf` con TLS horneado).
- `backend` → `Dockerfile` estándar (publicación Release).
- `db` → imagen oficial `postgres:16-alpine`.

> Si se usa un registry: `docker tag` + `push`, y referenciar la imagen en el compose.

---

## 4. TLS (SEC-07: HTTPS/TLS 1.3 obligatorio, RNF-01)

El diseño **emite el certificado ANTES del primer arranque** (evita arrancar nginx sin certificado):

```bash
# Puerto 80 libre (stack aún NO levantado)
sudo certbot certonly --standalone -d sciad.gt -d www.sciad.gt \
  -m admin@sciad.gt --agree-tos --no-eff-email
sudo ls -l /etc/letsencrypt/live/sciad.gt/    # fullchain.pem + privkey.pem
```

**Renovación automática** (el puerto 80 de nginx sigue sirviendo el challenge `.well-known/acme-challenge/`, ver
`nginx.prod.conf`):

```bash
sudo crontab -e
# lunes 03:17 (fuera de hora pico); recarga nginx solo si el cert cambió
17 3 * * 1  certbot renew --quiet --webroot -w /var/www/certbot && \
  docker compose --env-file /home/<user>/sciad/.env.prod -f /home/<user>/sciad/docker-compose.prod.yml \
    exec frontend nginx -s reload 2>/dev/null || true
```

**Verificación (evidencia SEC-07):**
```bash
curl -sI https://sciad.gt/api/health | head -5   # HTTP/2 + Strict-Transport-Security
openssl s_client -connect sciad.gt:443 -tls1_3 </dev/null | grep "New, TLSv1.3"
```

---

## 5. Desplegar

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
curl -s https://sciad.gt/api/health                # {"status":"ok","database":"up",...}
```

---

## 6. Migraciones de base de datos (forma segura)

Las migraciones EF se aplican de forma **controlada y con backup previo**:

```bash
# 0) Backup previo (§7) — SIEMPRE antes de migrar
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U sciad -d sciad | gzip > /var/backups/sciad/pre-migra-$(date +%F).sql.gz

# 1) Detener solo el backend
docker compose -f docker-compose.prod.yml stop backend

# 2) Aplicar la migración explicitamente
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  --entrypoint dotnet backend ef database update \
  --project src/Sciad.Infrastructure --startup-project src/Sciad.Api \
  --connection "Host=db;Database=sciad;Username=sciad;Password=<ver .env.prod>"

# 3) Regresar el backend
docker compose -f docker-compose.prod.yml start backend
```

> Aplicar migraciones como paso explícito en CI/CD antes del `up`, nunca durante picos de afluencia (mantenimiento
> fuera de 6:00–9:00 y 12:00–14:00, alineado a RNF-02).

---

## 7. Backups (estrategia)

### 7.1 Mecanismo base — `pg_dump` programado
Copia lógica diaria vía crontab del host (simple y verificable):

```bash
sudo crontab -e
# 02:33 (evita los :00 de otros servicios), conservando 14 días
33 2 * * *  mkdir -p /var/backups/sciad && \
  docker compose -f /home/<user>/sciad/docker-compose.prod.yml exec -T db \
    pg_dump -U sciad -d sciad | gzip > /var/backups/sciad/sciad-$(date +\%F).sql.gz && \
  find /var/backups/sciad -name '*.sql.gz' -mtime +13 -delete
```

**Restauración:**
```bash
gunzip < /var/backups/sciad/sciad-AAAAMMDD.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U sciad -d sciad
```

### 7.2 Buenas prácticas
- **Copia off-site**: >= 1 copia semanal fuera del VPS (p. ej. `rclone` a un bucket privado) — protege frente a
  pérdida total del VPS.
- **Backup previo a toda migración** (§6).
- **Respaldar `.env.prod`** (cifrado, fuera del VPS y en el gestor de contraseñas): sin `QR_ENCRYPTION_KEY` un backup de
  la base restaura las credenciales, pero ningún QR impreso vuelve a funcionar.
- **Verificar restauración** periódicamente (cada mes, restaurar en un entorno temporal) — un backup que no se puede
  restaurar no sirve.
- **Permisos**: `/var/backups/sciad` `chmod 700`, crontab de `root` (datos personales → Decreto 57-2008).

---

## 8. Operación: encendido/apagado y actualizaciones

```bash
# Actualización de versión
docker compose --env-file .env.prod -f docker-compose.prod.yml build
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --remove-orphans

# Parada completa / mantenimiento
docker compose -f docker-compose.prod.yml down
# Reinicio tras cortes
docker compose -f docker-compose.prod.yml start
```

Todos los servicios usan `restart: unless-stopped` → tras reiniciar el VPS, el sistema vuelve solo.

---

## 9. Monitoreo y criterios de la fase

- **Uptime (CA-12)**: `node_exporter` + Prometheus (o solución del proveedor); medir ≥ 99.9% mensual (30 días reales —
  fuera del alcance de la fase actual; se verifica en el piloto).
- **Carga 500 concurrentes (CA-13/CA-14)**: con k6 sobre `POST /api/registros-acceso` (5 min, 500 VUs) — plan de prueba
  perfilado con `verify-carga.mjs` (ver `evidencia/carga.md`). El VPS 4 vCPU/8 GB es la referencia del DERCAS.
- **Pruebas de seguridad (SEC-01/SEC-07)**: ZAP baseline + captura Wireshark (solo ciphertext TLS 1.3) sobre el
  despliegue real.

---

## 10. Checklist previo a producción

- [ ] DNS A registrado y propagado (`dig sciad.gt`).
- [ ] `.env.prod` con contraseñas y secretos generados; `chmod 600`; no versionado.
- [ ] Certificado Let's Encrypt emitido (`certonly`); renovación con cron webroot.
- [ ] `docker compose ... build` sin errores; healthchecks verdes (`docker compose ps`).
- [ ] `curl https://sciad.gt/api/health` → `{"status":"ok","database":"up"}`.
- [ ] Login con contraseña errada ×5 → 6.º intento **429** (SEC-04 detrás de nginx).
- [ ] Cron de backup ejecutado una vez y archivo `.sql.gz` inspeccionado.
- [ ] Backend arranca con `Jwt__Secreto` ≥ 32 chars (fail-fast de la app).
- [ ] `QR_ENCRYPTION_KEY` generada en el VPS (32 bytes base64), respaldada en el gestor de contraseñas y con la copia de `.env.prod`.
- [ ] Una credencial nueva escaneada con el teléfono entra (verde) y un QR antiguo de 64 hex es rechazado.