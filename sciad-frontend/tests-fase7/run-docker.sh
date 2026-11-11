#!/usr/bin/env sh
# Ejecuta la prueba de CSP/cabeceras (nginx REAL + Chromium + toda la app) dentro de un contenedor Linux:
# no hace falta WSL ni instalar nginx en Windows. Requiere el build: `npx ng build --configuration production`.
set -e
cd "$(dirname "$0")/.."            # → sciad-frontend/
[ -d dist/sciad-frontend/browser ] || { echo "Falta el build: npx ng build --configuration production" >&2; exit 1; }
docker run --rm -v "$PWD:/src:ro" node:22-bookworm bash -c '
  set -e
  apt-get update -qq >/dev/null && apt-get install -y -qq nginx chromium >/dev/null
  mkdir /work && tar -C /src --exclude=node_modules --exclude=.angular --exclude=.tmp -cf - . | tar -C /work -xf -
  cd /work/tests-fase7 && npm install --no-audit --no-fund >/dev/null 2>&1
  CHROME_PATH=/usr/bin/chromium node --no-warnings headers-csp.test.mjs
'
