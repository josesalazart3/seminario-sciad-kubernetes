#!/usr/bin/env sh
# Imprime la URL https del túnel (docker-compose.tunnel.yml) para abrirla en el celular.
set -e
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.tunnel.yml"

echo "Esperando la URL del túnel…"
url=""
for _ in $(seq 1 30); do
  url=$($COMPOSE logs tunnel 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -n 1 || true)
  [ -n "$url" ] && break
  sleep 2
done

if [ -z "$url" ]; then
  echo "No apareció la URL. Revisa:  $COMPOSE logs tunnel" >&2
  exit 1
fi

echo
echo "  Abre en el celular:  $url"
echo
echo "  • Entra con una cuenta de Personal de Seguridad y permite la cámara."
echo "  • Es una URL temporal y pública: no la compartas."
echo "  • Para apagarla:  $COMPOSE stop tunnel"
