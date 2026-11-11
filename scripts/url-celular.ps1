# Imprime la URL https del túnel (docker-compose.tunnel.yml) para abrirla en el celular. (Windows)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$compose = @('compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.tunnel.yml')

Write-Host 'Esperando la URL del túnel…'
$url = $null
for ($i = 0; $i -lt 30 -and -not $url; $i++) {
  $logs = (& docker @compose logs tunnel 2>&1) -join "`n"
  $m = [regex]::Matches($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($m.Count -gt 0) { $url = $m[$m.Count - 1].Value } else { Start-Sleep -Seconds 2 }
}
if (-not $url) {
  Write-Error 'No apareció la URL. Revisa: docker compose -f docker-compose.yml -f docker-compose.tunnel.yml logs tunnel'
}
Write-Host ''
Write-Host "  Abre en el celular:  $url"
Write-Host ''
Write-Host '  • Entra con una cuenta de Personal de Seguridad y permite la cámara.'
Write-Host '  • Es una URL temporal y pública: no la compartas.'
Write-Host '  • Para apagarla:  docker compose -f docker-compose.yml -f docker-compose.tunnel.yml stop tunnel'
