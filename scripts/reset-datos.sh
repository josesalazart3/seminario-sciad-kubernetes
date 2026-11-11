#!/usr/bin/env sh
# ============================================================
# SCIAD — Reinicio de datos de negocio (herramienta de MANTENIMIENTO, Fase 8). Mismo comportamiento que reset-datos.ps1.
#
# Borra personas, perfiles, credenciales, accesos, notificaciones, hallazgos de auditoría y reportes.
# CONSERVA roles y usuarios (para poder iniciar sesión) y deja SOLO las 3 zonas oficiales: Puerta principal,
# Puerta secundaria y Bodega (scripts/reset-zonas.sql; las demás zonas, p. ej. las de las pruebas, se borran).
# No es una función de la API ni de la interfaz (RNF-06: en la operación normal no hay borrado físico).
#
# Antes de borrar hace un respaldo obligatorio con pg_dump en backups/sciad_AAAAMMDD_HHMMSS.sql.
#
#   ./scripts/reset-datos.sh                      # pide escribir BORRAR para confirmar
#   ./scripts/reset-datos.sh --force              # sin confirmación (solo pruebas internas)
#   ./scripts/reset-datos.sh --allow-production   # necesario si el backend corre con ASPNETCORE_ENVIRONMENT=Production
# ============================================================
set -eu
cd "$(dirname "$0")/.."

FORCE=0
ALLOW_PRODUCTION=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --allow-production) ALLOW_PRODUCTION=1 ;;
    *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

# Tablas que se vacían (verificadas contra las migraciones de EF Core). roles, usuarios y zonas_acceso NO se tocan.
TABLAS="personas perfiles_acceso credenciales_qr registros_acceso notificaciones auditoria reportes"
CONSERVADAS="roles usuarios zonas_acceso"
SQL_ZONAS="scripts/reset-zonas.sql"
[ -f "$SQL_ZONAS" ] || { echo "Falta $SQL_ZONAS." >&2; exit 1; }

# psql dentro del contenedor (el puerto de la BD no está publicado). Usuario/BD salen del propio contenedor.
psql_db() {
  docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q -X --single-transaction -f -'
}

echo ""
echo "=== SCIAD: reinicio de datos ==="
echo "Se BORRARÁN todas las filas de: $(echo $TABLAS | sed 's/ /, /g')"
echo "Se CONSERVAN: roles, usuarios"
echo "Zonas: quedan SOLO Puerta principal, Puerta secundaria y Bodega (las equivalentes se renombran; las demás se borran)"
echo "Antes se hará un respaldo completo en backups/."
echo ""

# --- 1. La base de datos debe estar en marcha ---
if [ -z "$(docker compose ps -q db)" ]; then
  echo "El contenedor de la base de datos (servicio db) no está en marcha. Ejecute: docker compose up -d" >&2
  exit 1
fi

# --- 2. Se niega en producción salvo --allow-production ---
ENTORNO=""
BACKEND_ID="$(docker compose ps -a -q backend)"
if [ -n "$BACKEND_ID" ]; then
  ENTORNO="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$BACKEND_ID" | sed -n 's/^ASPNETCORE_ENVIRONMENT=//p' | head -n 1)"
fi
echo "Entorno del backend: ${ENTORNO:-(no detectado)}"
if [ "$ENTORNO" = "Production" ] && [ "$ALLOW_PRODUCTION" -ne 1 ]; then
  echo "El backend corre con ASPNETCORE_ENVIRONMENT=Production. Si de verdad quiere borrar los datos de producción, repita con --allow-production." >&2
  exit 1
fi

# --- 3. Confirmación explícita ---
if [ "$FORCE" -ne 1 ]; then
  printf "Escriba BORRAR para confirmar (cualquier otra cosa cancela): "
  read -r RESPUESTA || RESPUESTA=""
  if [ "$RESPUESTA" != "BORRAR" ]; then
    echo "Cancelado: no se borró nada."
    exit 1
  fi
fi

# --- 4. Respaldo obligatorio (si falla, se aborta sin borrar) ---
mkdir -p backups
ARCHIVO="sciad_$(date +%Y%m%d_%H%M%S).sql"
DESTINO="backups/$ARCHIVO"
echo "Respaldando en $DESTINO ..."
if ! docker compose exec -T db sh -c "pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --clean --if-exists --no-owner -f /tmp/$ARCHIVO"; then
  echo "pg_dump falló: NO se borró nada." >&2; exit 1
fi
if ! docker compose cp "db:/tmp/$ARCHIVO" "$DESTINO" >/dev/null; then
  echo "No se pudo copiar el respaldo fuera del contenedor: NO se borró nada." >&2; exit 1
fi
docker compose exec -T db rm -f "/tmp/$ARCHIVO" >/dev/null
if ! grep -q "PostgreSQL database dump complete" "$DESTINO"; then
  echo "El respaldo $DESTINO está incompleto: NO se borró nada." >&2; exit 1
fi
echo "Respaldo OK ($(wc -c < "$DESTINO" | tr -d ' ') bytes)."

# --- 5. Borrado en UNA transacción ---
# Antes de truncar se comprueba que ninguna tabla fuera de la lista tenga FK hacia las tablas borradas:
# así el CASCADE no puede alcanzar roles, usuarios ni zonas_acceso (si alguna lo hiciera, se aborta todo).
LISTA="$(for t in $TABLAS; do printf "'%s'," "$t"; done | sed 's/,$//')"
echo "Borrando datos de negocio y dejando las 3 zonas oficiales (una transacción)..."
psql_db <<SQL
DO \$\$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n FROM pg_constraint
     WHERE contype = 'f'
       AND confrelid::regclass::text = ANY (ARRAY[$LISTA])
       AND NOT (conrelid::regclass::text = ANY (ARRAY[$LISTA]));
    IF n > 0 THEN
        RAISE EXCEPTION 'Hay % FK desde tablas conservadas hacia tablas a borrar: se aborta sin cambios.', n;
    END IF;
END \$\$;
TRUNCATE TABLE $(echo $TABLAS | sed 's/ /, /g') RESTART IDENTITY CASCADE;
-- Fase 8.3: en la MISMA transacción y después del TRUNCATE (ya no hay perfiles ni accesos que apunten a las zonas).
$(cat "$SQL_ZONAS")
SQL
echo "Datos borrados."

# --- 6. Conteos y cómo restaurar ---
echo ""
echo "Conteo por tabla:"
CONSULTA="$(for t in $TABLAS $CONSERVADAS; do printf "SELECT '%s' AS tabla, count(*) AS filas FROM public.%s UNION ALL " "$t" "$t"; done | sed 's/ UNION ALL $//')"
echo "$CONSULTA;" | psql_db
echo ""
echo "Zonas de acceso:"
echo "SELECT id, nombre, nivel_seguridad, nivel_riesgo, capacidad, estado FROM public.zonas_acceso ORDER BY id;" | psql_db
echo ""
echo "Siguiente paso: docker compose restart backend"
echo "Para RESTAURAR este respaldo:"
echo "  docker compose stop backend"
echo "  docker compose cp $DESTINO db:/tmp/restaurar.sql"
echo "  docker compose exec -T db sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 -f /tmp/restaurar.sql'"
echo "  docker compose start backend"
