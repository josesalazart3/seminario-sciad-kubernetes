#!/usr/bin/env bash
# ============================================================
# SCIAD — Etiqueta y sube las imágenes al registro privado (GHCR)
# Uso (en el servidor donde están construidas las imágenes):
#   ./k8s/scripts/subir-imagenes.sh 1.0.0
# Pide el token de GitHub (permiso write:packages) sin mostrarlo.
# ============================================================
set -euo pipefail

VERSION="${1:-1.0.0}"
GH_USER="josesalazart3"
REG="ghcr.io/${GH_USER}"

read -r -s -p "Token de GitHub (write:packages): " TOKEN; echo
echo "$TOKEN" | sudo docker login ghcr.io -u "$GH_USER" --password-stdin
unset TOKEN

sudo docker tag sciad-tesis/frontend:latest "${REG}/sciad-frontend:${VERSION}"
sudo docker tag sciad-tesis/backend:latest  "${REG}/sciad-backend:${VERSION}"
sudo docker push "${REG}/sciad-frontend:${VERSION}"
sudo docker push "${REG}/sciad-backend:${VERSION}"

sudo docker logout ghcr.io
echo "Imágenes publicadas: ${REG}/sciad-frontend:${VERSION} y ${REG}/sciad-backend:${VERSION}"
