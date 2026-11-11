#!/usr/bin/env bash
# ============================================================
# SCIAD — Crea en Kubernetes los Secrets a partir de .env.prod
#   • sciad-secrets: credenciales de la BD, JWT, clave de QR y admin inicial.
#   • ghcr-pull: credencial de solo lectura para descargar las imágenes.
# Los valores nunca se escriben en disco ni se muestran en pantalla.
# Uso:  ./k8s/scripts/crear-secretos.sh /ruta/a/.env.prod
# ============================================================
set -euo pipefail

ENV_FILE="${1:-.env.prod}"
NS="jsalazart3"
GH_USER="josesalazart3"

[ -f "$ENV_FILE" ] || { echo "No existe $ENV_FILE"; exit 1; }

# Lee VAR=valor (permite '=' dentro del valor, p. ej. base64) y quita comillas externas.
val() {
  local v
  v="$(grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  [ -n "$v" ] || { echo "Falta $1 en $ENV_FILE" >&2; exit 1; }
  printf '%s' "$v"
}

PG_PASS="$(val POSTGRES_PASSWORD)"

kubectl create secret generic sciad-secrets -n "$NS" \
  --from-literal=POSTGRES_PASSWORD="$PG_PASS" \
  --from-literal=ConnectionStrings__Postgres="Host=db;Port=5432;Database=sciad;Username=sciad;Password=${PG_PASS};Maximum Pool Size=50" \
  --from-literal=Jwt__Secreto="$(val SCIAD_JWT_SECRET)" \
  --from-literal=QR_ENCRYPTION_KEY="$(val QR_ENCRYPTION_KEY)" \
  --from-literal=Seed__AdminEmail="$(val SCIAD_ADMIN_EMAIL)" \
  --from-literal=Seed__AdminPassword="$(val SCIAD_ADMIN_PASSWORD)" \
  --dry-run=client -o yaml | kubectl apply -f -
unset PG_PASS

read -r -s -p "Token de GitHub de SOLO LECTURA (read:packages): " TOKEN; echo
kubectl create secret docker-registry ghcr-pull -n "$NS" \
  --docker-server=ghcr.io \
  --docker-username="$GH_USER" \
  --docker-password="$TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f -
unset TOKEN

echo "Secrets creados:"
kubectl get secret sciad-secrets ghcr-pull -n "$NS"
