# ============================================================
# SCIAD — Reinicio de datos de negocio (herramienta de MANTENIMIENTO, Fase 8)
#
# Borra personas, perfiles, credenciales, accesos, notificaciones, hallazgos de auditoría y reportes.
# CONSERVA roles y usuarios (para poder iniciar sesión) y deja SOLO las 3 zonas oficiales: Puerta principal,
# Puerta secundaria y Bodega (scripts/reset-zonas.sql; las demás zonas, p. ej. las de las pruebas, se borran).
# No es una función de la API ni de la interfaz (RNF-06: en la operación normal no hay borrado físico).
#
# Antes de borrar hace un respaldo obligatorio con pg_dump en backups\sciad_AAAAMMDD_HHMMSS.sql.
#
#   .\scripts\reset-datos.ps1                 # pide escribir BORRAR para confirmar
#   .\scripts\reset-datos.ps1 -Force          # sin confirmación (solo pruebas internas)
#   .\scripts\reset-datos.ps1 -AllowProduction  # necesario si el backend corre con ASPNETCORE_ENVIRONMENT=Production
# ============================================================
param(
    [switch]$Force,
    [switch]$AllowProduction
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

# Tablas que se vacían (verificadas contra las migraciones de EF Core). roles, usuarios y zonas_acceso NO se tocan.
$Tablas = @('personas', 'perfiles_acceso', 'credenciales_qr', 'registros_acceso', 'notificaciones', 'auditoria', 'reportes')
$Conservadas = @('roles', 'usuarios', 'zonas_acceso')
$SqlZonas = Join-Path $PSScriptRoot 'reset-zonas.sql'
if (-not (Test-Path $SqlZonas)) { throw "Falta $SqlZonas." }

function Invoke-Psql([string]$Sql) {
    # psql dentro del contenedor (el puerto de la BD no está publicado). Usuario/BD salen del propio contenedor.
    $Sql | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q -X --single-transaction -f -'
    if ($LASTEXITCODE -ne 0) { throw "psql terminó con código $LASTEXITCODE." }
}

function Show-Conteos {
    $consulta = (($Tablas + $Conservadas) | ForEach-Object { "SELECT '$_' AS tabla, count(*) AS filas FROM public.$_" }) -join ' UNION ALL '
    Invoke-Psql "$consulta;"
}

Write-Host ''
Write-Host '=== SCIAD: reinicio de datos ===' -ForegroundColor Cyan
Write-Host "Se BORRARÁN todas las filas de: $($Tablas -join ', ')"
Write-Host 'Se CONSERVAN: roles, usuarios'
Write-Host 'Zonas: quedan SOLO Puerta principal, Puerta secundaria y Bodega (las equivalentes se renombran; las demás se borran)'
Write-Host 'Antes se hará un respaldo completo en backups\.'
Write-Host ''

# --- 1. La base de datos debe estar en marcha ---
$dbId = docker compose ps -q db
if (-not $dbId) { throw 'El contenedor de la base de datos (servicio db) no está en marcha. Ejecute: docker compose up -d' }

# --- 2. Se niega en producción salvo -AllowProduction ---
$backendId = docker compose ps -a -q backend
$entorno = ''
if ($backendId) {
    $variables = docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' $backendId
    $linea = $variables | Where-Object { $_ -like 'ASPNETCORE_ENVIRONMENT=*' } | Select-Object -First 1
    if ($linea) { $entorno = $linea.Substring('ASPNETCORE_ENVIRONMENT='.Length) }
}
Write-Host "Entorno del backend: $(if ($entorno) { $entorno } else { '(no detectado)' })"
if ($entorno -eq 'Production' -and -not $AllowProduction) {
    throw 'El backend corre con ASPNETCORE_ENVIRONMENT=Production. Si de verdad quiere borrar los datos de producción, repita con -AllowProduction.'
}

# --- 3. Confirmación explícita ---
if (-not $Force) {
    $respuesta = Read-Host 'Escriba BORRAR para confirmar (cualquier otra cosa cancela)'
    if ($respuesta -cne 'BORRAR') {
        Write-Host 'Cancelado: no se borró nada.' -ForegroundColor Yellow
        exit 1
    }
}

# --- 4. Respaldo obligatorio (si falla, se aborta sin borrar) ---
New-Item -ItemType Directory -Force 'backups' | Out-Null
$marca = Get-Date -Format 'yyyyMMdd_HHmmss'
$archivo = "sciad_$marca.sql"
$destino = Join-Path 'backups' $archivo
Write-Host "Respaldando en $destino ..."
docker compose exec -T db sh -c "pg_dump -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" --clean --if-exists --no-owner -f /tmp/$archivo"
if ($LASTEXITCODE -ne 0) { throw 'pg_dump falló: NO se borró nada.' }
docker compose cp "db:/tmp/$archivo" $destino | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar el respaldo fuera del contenedor: NO se borró nada.' }
docker compose exec -T db rm -f "/tmp/$archivo" | Out-Null
if (-not (Test-Path $destino) -or -not (Select-String -Path $destino -Pattern 'PostgreSQL database dump complete' -Quiet)) {
    throw "El respaldo $destino está incompleto: NO se borró nada."
}
Write-Host ("Respaldo OK ({0:N0} bytes)." -f (Get-Item $destino).Length) -ForegroundColor Green

# --- 5. Borrado en UNA transacción ---
# Antes de truncar se comprueba que ninguna tabla fuera de la lista tenga FK hacia las tablas borradas:
# así el CASCADE no puede alcanzar roles, usuarios ni zonas_acceso (si alguna lo hiciera, se aborta todo).
$lista = ($Tablas | ForEach-Object { "'$_'" }) -join ','
$sql = @"
DO `$`$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n FROM pg_constraint
     WHERE contype = 'f'
       AND confrelid::regclass::text = ANY (ARRAY[$lista])
       AND NOT (conrelid::regclass::text = ANY (ARRAY[$lista]));
    IF n > 0 THEN
        RAISE EXCEPTION 'Hay % FK desde tablas conservadas hacia tablas a borrar: se aborta sin cambios.', n;
    END IF;
END `$`$;
TRUNCATE TABLE $($Tablas -join ', ') RESTART IDENTITY CASCADE;
"@
# Fase 8.3: en la MISMA transacción y después del TRUNCATE (ya no hay perfiles ni accesos que apunten a las zonas).
$sql += "`n" + (Get-Content -Raw -Encoding UTF8 $SqlZonas)
Write-Host 'Borrando datos de negocio y dejando las 3 zonas oficiales (una transacción)...'
Invoke-Psql $sql
Write-Host 'Datos borrados.' -ForegroundColor Green

# --- 6. Conteos y cómo restaurar ---
Write-Host ''
Write-Host 'Conteo por tabla:'
Show-Conteos
Write-Host ''
Write-Host 'Zonas de acceso:'
Invoke-Psql 'SELECT id, nombre, nivel_seguridad, nivel_riesgo, capacidad, estado FROM public.zonas_acceso ORDER BY id;'
Write-Host ''
Write-Host 'Siguiente paso: docker compose restart backend'
Write-Host 'Para RESTAURAR este respaldo:'
Write-Host '  docker compose stop backend'
Write-Host "  docker compose cp $destino db:/tmp/restaurar.sql"
Write-Host '  docker compose exec -T db sh -c ''psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /tmp/restaurar.sql'''
Write-Host '  docker compose start backend'
