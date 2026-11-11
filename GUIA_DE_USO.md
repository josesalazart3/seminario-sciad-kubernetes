# SCIAD — Guía de uso: escanear con el celular y con la computadora

## 1. Arrancar todo (una vez)
```bash
cd SCIAD
cp .env.example .env                 # solo la primera vez (revisa las contraseñas)
# solo la primera vez (o si tu .env es anterior): clave de los QR cifrados, obligatoria; no se muestra en pantalla
grep -q '^QR_ENCRYPTION_KEY=.\+' .env || { sed -i '/^QR_ENCRYPTION_KEY=/d' .env; echo "QR_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env; }
docker compose up --build -d         # base de datos + API + frontend
node sciad-backend/seed-demo.mjs     # crea zonas, personas, perfiles y credenciales de demostración
```
- Aplicación: **http://localhost:8080** · API directa: http://localhost:3000 (Swagger: `/swagger`).
- Cuentas del sistema (creadas por el seeder de la API): `admin@sciad.gt`, `seguridad@sciad.gt`, `gerencia@sciad.gt` — contraseña `sciad123`.
  (Cámbialas antes de exponer el sistema fuera de tu equipo; el build de producción **no** muestra estas cuentas en el login.)

## 2. Escanear desde la computadora (webcam)
1. Abre `http://localhost:8080` (en `localhost` la cámara funciona sin HTTPS) y entra como **seguridad@sciad.gt**
   (o como Admin: menú **Punto de acceso**).
2. Elige la **zona**; el navegador pedirá permiso para la cámara → *Permitir*.
3. Abre `demo-gafetes.html` (lo genera el script de datos demo) en **otra pantalla o en tu celular** y acerca el QR a la cámara.
   También puedes imprimir un gafete desde **Credenciales QR → Ver → Imprimir gafete**.

## 3. Escanear desde el celular (necesita HTTPS)
La cámara del navegador **solo funciona en HTTPS** (o localhost). Para probar en un celular sin dominio:
```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
./scripts/url-celular.sh             # Windows: .\scripts\url-celular.ps1   → imprime https://….trycloudflare.com
```
1. Abre esa URL en el celular, entra como **seguridad@sciad.gt** y permite la cámara.
2. Muestra a la cámara el QR de `demo-gafetes.html` abierto en tu computadora.
3. Instalar como app: Android/Chrome → ⋮ → *Agregar a la pantalla principal* · iPhone/Safari → Compartir → *Agregar a inicio*.
4. Al terminar: `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml stop tunnel`.

🔐 **Antes de encender el túnel, cambia las contraseñas de las 3 cuentas demo** (`sciad123` es pública en esta guía): entra como Admin → **Usuarios** → lápiz (**Editar usuario**) →
**Nueva contraseña (dejar en blanco para no cambiarla)** → **Guardar** (mínimo 8 caracteres; usa una larga). Ver la sección 6. En el stack de desarrollo las cuentas demo existen por diseño; en **producción no se crean** (el administrador inicial se declara con `SCIAD_ADMIN_EMAIL` / `SCIAD_ADMIN_PASSWORD`).
Además, los puertos de desarrollo (8080 y 3000) solo escuchan en `127.0.0.1`: ni la API ni Swagger quedan visibles en tu red local; el celular entra únicamente por el túnel HTTPS.

⚠ Mientras el túnel esté encendido la URL es pública. Úsalo solo para pruebas y no compartas la URL. Para uso real: VPS con dominio y TLS (`DESPLIEGUE.md`).

## 4. Qué debe pasar con cada persona de la demostración
| Persona | Escenario | Resultado al escanear |
|---|---|---|
| Juan Pérez López | Entrada Principal y Oficinas, vigente | ✅ verde: INGRESO; 2.º escaneo: EGRESO |
| María Fernanda Ruiz | Las 3 zonas, vigente | ✅ verde en cualquier zona |
| Carlos Méndez Soto | Perfil vencido | ❌ rojo «Fuera de vigencia» (avisa a Gerencia) |
| Ana Lucía Castillo | Credencial revocada | ❌ rojo «Credencial revocada» (avisa a Gerencia) |
| Roberto Aguilar (visitante) | Solo Entrada Principal | ✅ en Entrada · ❌ «Zona no autorizada» en otras zonas |
| Sofía Morales (visitante) | Sin perfil | ❌ rojo «Zona no autorizada» |

## 5. Reglas que conviene conocer
- **El servidor alterna ingreso/egreso** en cada escaneo válido. La app no reenvía el mismo QR mientras siga frente a la cámara
  (hay que retirarlo y volver a presentarlo; además hay una espera de 15 s para el mismo código).
- **Un solo ingreso por persona y día** (regla del DERCAS, CU-04): el 3.er escaneo del día devuelve «Ingreso ya registrado» (409) hasta mañana.
  Quien entra a una 2.ª zona el mismo día, o sale y vuelve a entrar, también recibe ese aviso. Para repetir pruebas el mismo día usa otra persona.
- **QR cifrado**: el QR de cada credencial contiene un sobre cifrado y autenticado (AES-256-GCM) que empieza con
  `SCIAD1.`; el servidor lo descifra y valida al escanear. Un QR alterado, ajeno o del formato anterior (64 caracteres
  hexadecimales) se rechaza como «Credencial no reconocida» o «Código no reconocido»: **los QR antiguos dejaron de ser válidos**
  y hay que emitir credenciales nuevas. Las pantallas y el gafete muestran solo un código corto (8 caracteres); en
  **Registro manual (sin cámara)** se pega el texto completo del QR (por ejemplo, copiado desde la app de cámara del teléfono).
- **La clave `QR_ENCRYPTION_KEY`** (en `.env`) es obligatoria: sin ella el backend no arranca. **Perderla o cambiarla
  invalida todas las credenciales emitidas**; guárdala en un gestor de contraseñas y respáldala junto con el archivo de entorno.
- **Horas**: el sistema trabaja en **hora de Guatemala (UTC-6)**; el día cambia a medianoche local, no a las 18:00.
- Las listas (historial, notificaciones, auditoría, reportes) muestran hasta **100** filas; usa los filtros para acotar.
- **Accesos del turno** (y **Accesos de hoy** del Admin) muestra **una fila por persona y zona** con su último movimiento del día
  (IN/OUT y hora) y los contadores Dentro / Fuera / Total.
- **Inicio de sesión y bloqueo**: desde un mismo equipo se aceptan **5 intentos de inicio de sesión cada 5 minutos** (al superarlos:
  «No se pudo iniciar sesión. Intenta de nuevo.», HTTP 429). Por separado, **10 intentos fallidos en 15 minutos bloquean la cuenta 10 minutos**
  (mientras dure, responde igual que una contraseña incorrecta). La sesión dura 8 horas; para salir usa **Salir** al pie del menú lateral.

## 6. Tareas del administrador
- **Cambiar la contraseña de un usuario**: **Usuarios** → lápiz → **Nueva contraseña (dejar en blanco para no cambiarla)** → **Guardar**.
  Mismas reglas que al crear (8 a 72 caracteres). En blanco no cambia nada. El usuario entra desde ese momento con la nueva; si el
  administrador cambia la suya, conserva la sesión abierta.
- **Reemitir una credencial QR**: **Credenciales QR** → ícono de flechas (**Reemitir**) en una credencial activa → confirmar. En una sola
  operación la credencial actual queda **revocada con motivo «Reemisión»** y se emite una nueva con otro token; el gafete anterior deja de
  funcionar en el punto de acceso («Credencial revocada»). También aparece en la credencial revocada más reciente de una persona que ya no
  tiene ninguna activa. Se rechaza si la persona está inactiva.
- **Reportes CSV**: en **Generar reporte**, **Persona** y **Zona** empiezan en **«Todas las personas»** / **«Todas las zonas»** (sin filtro);
  elige una persona o zona solo para acotar el CSV.

## 7. Si algo no funciona
| Síntoma | Causa y solución |
|---|---|
| «La cámara solo funciona en HTTPS» | Abriste `http://192.168.x.x`. Usa `localhost` en la PC o el túnel HTTPS en el celular. |
| «Se bloqueó el permiso de la cámara» | Candado de la barra de direcciones → Cámara → Permitir; recarga. En iPhone: Ajustes → Safari → Cámara. |
| No lee el QR | Más luz, acércalo/aléjalo, evita reflejos; usa la linterna (🔦) o «Leer desde foto». |
| «Sin conexión» | El celular perdió red o el stack está apagado: `docker compose ps`. |
| Login bloqueado | «No se pudo iniciar sesión. Intenta de nuevo.» (429): 5 intentos en 5 min desde ese equipo; espera 5 min. Si la contraseña correcta da «Credenciales incorrectas» tras muchos fallos, la cuenta quedó bloqueada 10 min. |
| La URL del túnel no aparece | `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml logs tunnel`. |
