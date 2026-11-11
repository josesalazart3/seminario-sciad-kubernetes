# Ejecuta la prueba de CSP/cabeceras (nginx REAL + Chromium + toda la app) dentro de un contenedor Linux (Windows, sin WSL).
# Requiere el build: npx ng build --configuration production
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')          # → sciad-frontend\
if (-not (Test-Path 'dist\sciad-frontend\browser')) { Write-Error 'Falta el build: npx ng build --configuration production' }
$script = @'
set -e
apt-get update -qq >/dev/null && apt-get install -y -qq nginx chromium >/dev/null
mkdir /work && tar -C /src --exclude=node_modules --exclude=.angular --exclude=.tmp -cf - . | tar -C /work -xf -
cd /work/tests-fase7 && npm install --no-audit --no-fund >/dev/null 2>&1
CHROME_PATH=/usr/bin/chromium node --no-warnings headers-csp.test.mjs
'@
docker run --rm -v "${PWD}:/src:ro" node:22-bookworm bash -c $script
