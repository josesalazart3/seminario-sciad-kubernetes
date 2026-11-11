#!/usr/bin/env bash
# Genera nginx.vps.conf (despliegue de tesis en el VPS, Estrategia B: TLS propio en el puerto 8443)
# a partir de la plantilla original del repo, sin modificarla:
#   - dominio sciad.gt → sciad.169-58-166-175.sslip.io (server_name y rutas del certificado)
#   - redirecciones a https incluyen el puerto público 8443
#   - HTTP plano enviado al puerto TLS (error 497) → 301 a https://…:8443
#   - absolute_redirect off: las redirecciones internas de nginx no pierden el puerto público
# El puerto 80 del contenedor NO se publica; solo lo usa el healthcheck interno de la imagen.
set -euo pipefail
cd "$(dirname "$0")"
DOMINIO=sciad.169-58-166-175.sslip.io
PUERTO=8443
SRC=sciad-frontend/nginx.prod.conf
DST=nginx.vps.conf
sed -e "s#server_name  sciad.gt www.sciad.gt;#server_name  ${DOMINIO};#" \
    -e "s#/etc/letsencrypt/live/sciad.gt/#/etc/letsencrypt/live/${DOMINIO}/#" \
    -e "s#return 301 https://\$host\$request_uri;#return 301 https://\$host:${PUERTO}\$request_uri;#" \
    -e "s#^    ssl_protocols TLSv1.2 TLSv1.3;#&\n\n    \# VPS (8443): HTTP plano al puerto TLS → HTTPS; redirecciones relativas (conservan :${PUERTO}).\n    error_page 497 =301 https://\$host:${PUERTO}\$request_uri;\n    absolute_redirect off;#" \
    "$SRC" > "$DST.tmp"
if grep -q 'sciad\.gt' "$DST.tmp"; then echo "ERROR: quedó 'sciad.gt' en $DST" >&2; grep -n 'sciad\.gt' "$DST.tmp" >&2; exit 1; fi
[ "$(grep -c "error_page 497" "$DST.tmp")" = 1 ] || { echo "ERROR: no se insertó error_page 497" >&2; exit 1; }
[ "$(grep -c ":${PUERTO}\$request_uri" "$DST.tmp")" = 2 ] || { echo "ERROR: redirecciones sin puerto" >&2; exit 1; }
mv "$DST.tmp" "$DST"; chmod 644 "$DST"
echo "OK: $DST generado"
