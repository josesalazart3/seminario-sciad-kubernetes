#!/usr/bin/env bash
# ============================================================
# SCIAD — Copia la base de datos del servidor Docker al cluster
# Origen:  contenedor sciad-tesis-db (Docker)
# Destino: pod db-0 del StatefulSet (Kubernetes)
# Los datos viajan directo de un lado a otro: no se guarda ningún archivo.
# Ejecutar ANTES de levantar el backend (ver DESPLIEGUE_KUBERNETES.md).
# ============================================================
set -euo pipefail

NS="jsalazart3"
ORIGEN="${1:-sciad-tesis-db}"

echo "Esperando a que la base de datos del cluster esté lista..."
kubectl wait --for=condition=Ready pod/db-0 -n "$NS" --timeout=180s

echo "Copiando datos de ${ORIGEN} → db-0 ..."
sudo docker exec "$ORIGEN" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --clean --if-exists' \
  | kubectl exec -i -n "$NS" db-0 -- psql -q -U sciad -d sciad -v ON_ERROR_STOP=1 >/dev/null

echo "Verificación (tablas y filas por tabla en ambos lados):"
Q="select relname, n_live_tup from pg_stat_user_tables order by relname;"
echo "--- Origen (Docker)"
sudo docker exec "$ORIGEN" sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c 'analyze;' >/dev/null; psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"$Q\""
echo "--- Destino (Kubernetes)"
kubectl exec -n "$NS" db-0 -- sh -c "psql -U sciad -d sciad -c 'analyze;' >/dev/null; psql -U sciad -d sciad -c \"$Q\""
