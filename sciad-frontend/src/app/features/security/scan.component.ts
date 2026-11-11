// Escaneo QR (CU-04) con cámara real. Funciona en celular (BYOD) y en computadora (webcam).
//
// Flujo: elegir zona → apuntar la cámara al QR de la credencial → su contenido (sobre cifrado «SCIAD1.…») se envía a
// POST /registros-acceso {token, zonaId} → el servidor valida y decide ingreso/egreso → alerta
// verde/roja a pantalla completa con sonido y vibración.
//
// Notas de diseño:
//  - El servidor ALTERNA ingreso/egreso en cada escaneo válido. Una cámara lee el mismo QR muchas
//    veces por segundo, por eso `ScanGate` impide reenviar el mismo código (ver core/util/token.ts).
//  - La cámara exige HTTPS (o localhost). Si no se cumple, se explica y se ofrece la alternativa
//    de leer desde una foto o pegar el código de la credencial a mano.
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AccessLogService, ZonasService } from '../../core/services/crud.service';
import { RegistroAccesoResultado } from '../../core/models/access-log.model';
import { Zona } from '../../core/models/access.model';
import { Button } from '../../shared/ui/button.component';
import { Icon } from '../../shared/ui/icon.component';
import { Card } from '../../shared/ui/card.component';
import { ToastService } from '../../shared/ui/toast.service';
import { extractToken, ScanGate } from '../../core/util/token';
import { horaLocal } from '../../core/util/time';
import {
  CAMARA_MENSAJES,
  CamaraError,
  CamaraErrorCode,
  decodificarImagen,
  QrCameraScanner,
} from '../../core/util/qr-camera';
import { recurso } from '../../core/util/recurso';
import { tap } from 'rxjs';

interface EscanerResultado {
  ok: boolean;
  titulo: string;
  persona?: string;
  zona?: string;
  tipo?: string;
  hora?: string;
  motivo?: string;
}

interface Reciente extends EscanerResultado {
  at: number;
}

type CamState = 'idle' | 'starting' | 'live' | 'error';

const ZONA_KEY = 'sciad.scan.zona';
const RESULT_MS = 2500;

const TITULOS_ERROR: Record<string, string> = {
  TOKEN_INVALIDO: 'Credencial no reconocida',
  CREDENCIAL_REVOCADA: 'Credencial revocada',
  PERSONA_INACTIVA: 'Persona inactiva',
  ZONA_NO_AUTORIZADA: 'Zona no autorizada',
  FUERA_VIGENCIA: 'Fuera de vigencia',
};

@Component({
  selector: 'app-scan',
  standalone: true,
  imports: [ReactiveFormsModule, Button, Icon, Card],
  template: `
    <div class="scan">
      <div class="zona-row">
        <label class="uppercase-label" for="zona-sel">Zona de acceso</label>
        <select id="zona-sel" class="token-input" [formControl]="form.controls.zonaId" aria-label="Zona de acceso">
          <option value="" disabled>Selecciona la zona…</option>
          @for (z of zonaOptions(); track z.id) {
            <option [value]="z.id">{{ z.nombre }}</option>
          }
        </select>
        @if (cargaZonas.cargando()) {
          <p class="hint">Cargando zonas…</p>
        } @else if (cargaZonas.error(); as e) {
          <div class="zona-error" role="alert">
            <span>{{ e }}</span>
            <button sci-btn variant="secondary" size="sm" iconName="refresh" type="button" (click)="cargaZonas.cargar()">Reintentar</button>
          </div>
        } @else if (zonaOptions().length === 0) {
          <p class="hint">No hay zonas activas. Actívalas desde administración.</p>
        }
      </div>

      <div class="viewport" [class.live]="cam() === 'live'">
        <video #video class="video" playsinline muted></video>

        @if (cam() !== 'live') {
          <div class="placeholder">
            <sci-icon name="qr" [size]="84" />
            <p>
              @switch (cam()) {
                @case ('starting') { Iniciando cámara… }
                @case ('error') { Cámara no disponible }
                @default { Cámara apagada }
              }
            </p>
          </div>
        } @else if (!result()) {
          <div class="reticle" aria-hidden="true">
            <span class="c tl"></span><span class="c tr"></span><span class="c bl"></span><span class="c br"></span>
            <span class="scanline"></span>
          </div>
          <div class="live-hint">Apunta al código QR de la credencial</div>
        }

        @if (cam() === 'live') {
          <div class="tools">
            @if (linterna()) {
              <button type="button" class="tool" [class.on]="linternaOn()" (click)="toggleLinterna()" aria-label="Linterna">
                <sci-icon name="zap" [size]="20" />
              </button>
            }
            @if (camaras().length > 1) {
              <button type="button" class="tool" (click)="cambiarCamara()" aria-label="Cambiar de cámara">
                <sci-icon name="refresh" [size]="20" />
              </button>
            }
          </div>
        }

        @if (result(); as r) {
          <div class="overlay" [class.ok]="r.ok" [class.bad]="!r.ok" [attr.role]="r.ok ? 'status' : 'alert'" aria-live="assertive">
            <sci-icon [name]="r.ok ? 'checkCircle' : 'alertTriangle'" [size]="76" />
            <div class="o-title">{{ r.titulo }}</div>
            @if (r.persona) { <div class="o-name">{{ r.persona }}</div> }
            @if (r.ok) {
              <div class="o-sub">{{ r.tipo === 'ingreso' ? 'INGRESO' : 'EGRESO' }} · {{ r.zona }}</div>
              <div class="o-when mono">{{ r.hora }}</div>
            } @else if (r.motivo) {
              <div class="o-sub">{{ r.motivo }}</div>
            }
          </div>
        }

        @if (loading()) {
          <div class="busy"><span class="spin"></span> Validando…</div>
        }
      </div>

      @if (camError(); as msg) {
        <div class="cam-error" role="alert">
          <sci-icon name="alertTriangle" [size]="20" />
          <div>
            <div class="ce-msg">{{ msg }}</div>
            @if (camErrorCode() === 'INSECURE') {
              <div class="ce-sub">Mientras tanto puedes usar «Leer desde foto» o pegar el código en «Registro manual».</div>
            }
          </div>
        </div>
      }

      <div class="actions">
        @if (cam() === 'live') {
          <button sci-btn variant="secondary" size="md" iconName="x" (click)="detener()">Apagar cámara</button>
        } @else {
          <button sci-btn variant="primary" size="md" iconName="camera" [loading]="cam() === 'starting'" (click)="iniciar()">
            {{ cam() === 'error' ? 'Reintentar cámara' : 'Activar cámara' }}
          </button>
        }
        <label class="file-btn">
          <input type="file" accept="image/*" capture="environment" (change)="onFoto($event)" hidden />
          <sci-icon name="scan" [size]="18" /> Leer desde foto
        </label>
      </div>

      @if (recientes().length > 0) {
        <sci-card class="recientes">
          <div class="manual-label uppercase-label">Últimos escaneos</div>
          <ul class="rec-list">
            @for (r of recientes(); track r.at) {
              <li class="rec" [class.rec-ok]="r.ok" [class.rec-bad]="!r.ok">
                <sci-icon [name]="r.ok ? 'checkCircle' : 'alertCircle'" [size]="18" />
                <div class="rec-main">
                  <div class="rec-t">{{ r.persona ?? r.titulo }}</div>
                  <div class="rec-s">{{ r.ok ? (r.tipo === 'ingreso' ? 'Ingreso' : 'Egreso') + ' · ' + r.zona : r.motivo ?? r.titulo }}</div>
                </div>
                <div class="rec-h mono">{{ r.hora ?? '' }}</div>
              </li>
            }
          </ul>
        </sci-card>
      }

      <sci-card class="manual">
        <details>
          <summary class="manual-label uppercase-label">Registro manual (sin cámara)</summary>
          <form [formGroup]="form" (ngSubmit)="submitManual()" class="manual-form">
            <input
              formControlName="token"
              placeholder="Pegue el código completo (SCIAD1.…)"
              aria-label="Código completo de la credencial"
              class="token-input mono"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              (input)="form.controls.token.setValue($any($event.target).value.trim(), { emitEvent: false })"
            />
            <button sci-btn variant="primary" size="md" [loading]="loading()" [disabled]="zonaOptions().length === 0">
              Registrar acceso
            </button>
          </form>
        </details>
      </sci-card>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .scan { max-width: 560px; margin: 0 auto; padding: 16px 16px 40px; display: flex; flex-direction: column; gap: 16px; }
      .zona-row { display: flex; flex-direction: column; gap: 6px; }
      .zona-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--sciad-danger-soft); color: var(--sciad-danger); font-size: 13px; font-weight: 500; }
      .uppercase-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-subtle); }
      .hint { font-size: 12px; color: var(--text-subtle); }

      .viewport {
        position: relative; width: 100%; aspect-ratio: 1 / 1; max-height: 68dvh; margin: 0 auto;
        border-radius: 20px; overflow: hidden; background: #0b1220; border: 2px solid var(--border-strong);
      }
      .viewport.live { border-color: var(--sciad-brand); }
      .video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .viewport:not(.live) .video { visibility: hidden; }
      .placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #94a3b8; font-size: 14px; }

      .reticle { position: absolute; inset: 14%; pointer-events: none; }
      .c { position: absolute; width: 34px; height: 34px; border: 4px solid #fff; opacity: 0.95; }
      .tl { top: 0; left: 0; border-right: 0; border-bottom: 0; border-top-left-radius: 12px; }
      .tr { top: 0; right: 0; border-left: 0; border-bottom: 0; border-top-right-radius: 12px; }
      .bl { bottom: 0; left: 0; border-right: 0; border-top: 0; border-bottom-left-radius: 12px; }
      .br { bottom: 0; right: 0; border-left: 0; border-top: 0; border-bottom-right-radius: 12px; }
      .scanline { position: absolute; left: 6px; right: 6px; height: 3px; border-radius: 3px; background: var(--sciad-brand); box-shadow: 0 0 12px var(--sciad-brand); animation: scanmove 1.8s ease-in-out infinite; }
      @keyframes scanmove { 0%, 100% { top: 6%; } 50% { top: 92%; } }
      .live-hint { position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; color: #fff; font-size: 13px; font-weight: 600; text-shadow: 0 1px 4px rgb(0 0 0 / 0.7); pointer-events: none; }

      .tools { position: absolute; top: 10px; right: 10px; display: flex; gap: 8px; z-index: 3; }
      .tool { width: 42px; height: 42px; border-radius: 50%; border: 0; display: grid; place-items: center; color: #fff; background: rgb(15 23 42 / 0.6); backdrop-filter: blur(4px); }
      .tool.on { background: var(--sciad-warning); }

      .overlay { position: absolute; inset: 0; z-index: 4; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 20px; text-align: center; color: #fff; animation: pop 0.2s var(--ease-out); }
      .overlay.ok { background: rgb(21 127 67 / 0.94); }
      .overlay.bad { background: rgb(198 40 40 / 0.94); }
      @keyframes pop { from { transform: scale(0.97); opacity: 0; } }
      .o-title { font-size: 24px; font-weight: 800; line-height: 1.15; }
      .o-name { font-size: 20px; font-weight: 700; }
      .o-sub { font-size: 15px; font-weight: 600; opacity: 0.95; }
      .o-when { font-size: 28px; font-weight: 700; margin-top: 4px; }

      .busy { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); z-index: 5; display: inline-flex; align-items: center; gap: 8px; background: rgb(15 23 42 / 0.75); color: #fff; font-size: 13px; font-weight: 600; padding: 6px 12px; border-radius: 999px; }
      .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; border-right-color: transparent; animation: sp 0.7s linear infinite; }
      @keyframes sp { to { transform: rotate(360deg); } }

      .cam-error { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: var(--radius-md); background: var(--sciad-warning-soft); color: var(--sciad-warning); font-size: 13px; }
      .ce-msg { font-weight: 600; }
      .ce-sub { margin-top: 4px; opacity: 0.9; }

      .actions { display: flex; flex-wrap: wrap; gap: 10px; }
      .file-btn { display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; height: 44px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); font-weight: 600; font-size: 14px; cursor: pointer; }

      .recientes, .manual { padding: 16px 18px; }
      .manual-label { cursor: pointer; }
      .rec-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
      .rec { display: flex; align-items: center; gap: 10px; }
      .rec-ok { color: var(--sciad-success); }
      .rec-bad { color: var(--sciad-danger); }
      .rec-main { flex: 1; min-width: 0; }
      .rec-t { font-weight: 600; font-size: 14px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rec-s { font-size: 12px; color: var(--text-muted); }
      .rec-h { font-size: 13px; color: var(--text-muted); }

      .manual-form { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
      .token-input { width: 100%; height: 48px; padding: 0 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); font-size: 15px; }
      .token-input:focus { outline: none; border-color: var(--sciad-brand); box-shadow: 0 0 0 3px var(--sciad-brand-soft); }
    `,
  ],
})
export class ScanComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly service = inject(AccessLogService);
  private readonly zonasSvc = inject(ZonasService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private scanner: QrCameraScanner | null = null;
  private readonly gate = new ScanGate();
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private lastInvalidAt = 0;
  private audio: AudioContext | null = null;
  private resumeOnVisible = false;
  /** Fase 8.5: el componente ya se destruyó (el usuario salió de Escanear): nunca volver a encender la cámara. */
  private destruido = false;
  /** Al volver a la pestaña había un resultado en pantalla: se reinicia la cámara cuando ese resultado se cierre. */
  private reiniciarTrasResultado = false;

  protected readonly cam = signal<CamState>('idle');
  protected readonly camError = signal<string | null>(null);
  protected readonly camErrorCode = signal<CamaraErrorCode | null>(null);
  protected readonly camaras = signal<MediaDeviceInfo[]>([]);
  protected readonly linterna = signal(false);
  protected readonly linternaOn = signal(false);
  protected readonly loading = signal(false);
  /** Carga común (Fase 8.2): estado cargando / listo / error + reintentar. Al llegar, preselecciona la zona guardada. */
  protected readonly cargaZonas = recurso(
    () => this.zonasSvc.list().pipe(tap((zs) => this.preseleccionarZona(zs))),
    [] as Zona[],
    'No se pudieron cargar las zonas.',
  );
  protected readonly zonas = this.cargaZonas.datos;
  protected readonly result = signal<EscanerResultado | null>(null);
  protected readonly recientes = signal<Reciente[]>([]);

  protected readonly zonaOptions = computed(() => this.zonas().filter((z) => z.estado === 'activo'));
  protected readonly form = this.fb.group({
    zonaId: this.fb.nonNullable.control('', Validators.required),
    token: ['', [Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.form.controls.zonaId.valueChanges.subscribe((v) => {
      try {
        if (v) localStorage.setItem(ZONA_KEY, v);
      } catch {
        /* almacenamiento no disponible: se ignora */
      }
    });

    this.cargaZonas.cargar();
  }

  private preseleccionarZona(zs: Zona[]): void {
    const activas = zs.filter((z) => z.estado === 'activo');
    let guardada: string | null = null;
    try {
      guardada = localStorage.getItem(ZONA_KEY);
    } catch {
      guardada = null;
    }
    const elegida = activas.find((z) => z.id === guardada) ?? activas[0];
    if (elegida && !this.form.controls.zonaId.value) this.form.controls.zonaId.setValue(String(elegida.id));
  }

  ngAfterViewInit(): void {
    // El <video> ya existe: se intenta abrir la cámara de inmediato (el navegador pedirá permiso).
    void this.iniciar();
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.resumeOnVisible = false;
    this.reiniciarTrasResultado = false;
    this.scanner?.stop(); // también cancela un arranque pendiente (getUserMedia aún sin resolver)
    this.scanner = null;
    if (this.resultTimer) clearTimeout(this.resultTimer);
    void this.audio?.close().catch(() => undefined);
  }

  /**
   * Libera la cámara al ocultar la pestaña (batería/privacidad), también si aún se estaba iniciando, y la reanuda al
   * volver solo si se sigue en Escanear y no hay un resultado en pantalla (si lo hay, al cerrarse).
   */
  @HostListener('document:visibilitychange')
  onVisibility(): void {
    if (document.hidden) this.suspender();
    else this.reanudar();
  }

  /** Salir de la página / cerrar la pestaña / bfcache: la cámara se apaga siempre. */
  @HostListener('window:pagehide')
  onPageHide(): void {
    this.suspender();
  }

  /** Volver desde el bfcache (atrás/adelante) con la pantalla de Escanear. */
  @HostListener('window:pageshow', ['$event'])
  onPageShow(ev: PageTransitionEvent): void {
    if (ev.persisted && !document.hidden) this.reanudar();
  }

  private suspender(): void {
    if (this.cam() === 'live' || this.cam() === 'starting') {
      this.resumeOnVisible = true;
      this.scanner?.stop();
      this.cam.set('idle');
      this.linterna.set(false);
    }
  }

  private reanudar(): void {
    if (!this.resumeOnVisible || this.destruido) return;
    this.resumeOnVisible = false;
    if (this.result()) {
      this.reiniciarTrasResultado = true;
      return;
    }
    void this.iniciar();
  }

  protected async iniciar(deviceId?: string): Promise<void> {
    if (this.destruido || this.cam() === 'starting') return;
    this.cam.set('starting');
    this.camError.set(null);
    this.camErrorCode.set(null);
    this.prepararAudio();
    try {
      if (!this.scanner) {
        this.scanner = new QrCameraScanner(this.videoRef().nativeElement, (t) => this.onLectura(t));
      }
      await this.scanner.start(deviceId);
      if (this.destruido) {
        this.scanner?.stop(); // salió de la pantalla justo al terminar el arranque
        return;
      }
      this.cam.set('live');
      this.linterna.set(this.scanner.linterna);
      this.linternaOn.set(false);
      this.camaras.set(await QrCameraScanner.camaras());
    } catch (e) {
      const ce = e instanceof CamaraError ? e : new CamaraError('UNKNOWN', CAMARA_MENSAJES.UNKNOWN);
      if (this.destruido) return;
      if (ce.code === 'ABORTED') {
        // Se apagó a propósito mientras se iniciaba (pestaña oculta, botón Apagar): no es un error.
        if (this.cam() === 'starting') this.cam.set('idle');
        return;
      }
      this.cam.set('error');
      this.camErrorCode.set(ce.code);
      this.camError.set(ce.message);
    }
  }

  /** Botón "Apagar cámara": la apaga de verdad (pistas detenidas) y no se reenciende sola al volver a la pestaña. */
  protected detener(): void {
    this.resumeOnVisible = false;
    this.reiniciarTrasResultado = false;
    this.scanner?.stop();
    this.cam.set('idle');
    this.linterna.set(false);
  }

  protected async toggleLinterna(): Promise<void> {
    try {
      const next = !this.linternaOn();
      await this.scanner?.setLinterna(next);
      this.linternaOn.set(next);
    } catch {
      this.toast.warning('Linterna', 'Este dispositivo no permite controlar la linterna.');
    }
  }

  protected async cambiarCamara(): Promise<void> {
    const lista = this.camaras();
    if (lista.length < 2) return;
    const actual = this.scanner?.deviceIdActual;
    const idx = lista.findIndex((d) => d.deviceId === actual);
    const siguiente = lista[(idx + 1) % lista.length];
    await this.iniciar(siguiente.deviceId);
  }

  /** Lectura de la cámara (puede llegar muchas veces por segundo). */
  private onLectura(texto: string): void {
    const token = extractToken(texto);
    const now = Date.now();
    if (!token) {
      // Un QR ajeno a SCIAD: se avisa una vez cada pocos segundos, sin molestar.
      if (!this.gate.isBusy && !this.result() && now - this.lastInvalidAt > 3000) {
        this.lastInvalidAt = now;
        this.mostrar({ ok: false, titulo: 'Código no reconocido', motivo: 'El QR no es una credencial SCIAD.' }, false);
      }
      return;
    }
    if (!this.gate.canProcess(token, now)) return;
    this.enviar(token, true);
  }

  protected submitManual(): void {
    const t = extractToken(this.form.controls.token.value);
    if (!t) {
      this.mostrar({ ok: false, titulo: 'Código inválido', motivo: 'Pegue el código completo de la credencial (empieza con «SCIAD1.»).' }, false);
      return;
    }
    if (this.loading()) return;
    this.enviar(t, false);
  }

  protected async onFoto(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.loading()) return;
    try {
      const texto = await decodificarImagen(file);
      const t = extractToken(texto);
      if (!t) {
        this.mostrar(
          { ok: false, titulo: 'No se leyó ningún QR', motivo: 'Acerca la foto al código y evita reflejos.' },
          false,
        );
        return;
      }
      this.enviar(t, false);
    } catch {
      this.toast.error('Error', 'No se pudo leer la imagen.');
    }
  }

  private enviar(token: string, porCamara: boolean): void {
    const zonaId = Number(this.form.controls.zonaId.value);
    if (!zonaId) {
      this.toast.warning('Zona requerida', 'Selecciona la zona de acceso antes de escanear.');
      return;
    }
    if (porCamara) this.gate.begin(token, Date.now());
    this.scanner?.pause();
    this.loading.set(true);

    this.service.escanear({ token, zonaId }).subscribe({
      next: (res: RegistroAccesoResultado) => {
        this.loading.set(false);
        if (porCamara) this.gate.end(Date.now());
        this.form.controls.token.reset('');
        this.mostrar(
          {
            ok: true,
            titulo: 'Acceso autorizado',
            persona: res.personaNombre,
            zona: res.zonaNombre,
            tipo: res.tipo,
            hora: this.horaDe(res),
          },
          true,
        );
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        if (porCamara) {
          this.gate.end(Date.now());
          // Fallos de red/servidor: permitir reintentar el mismo QR enseguida.
          if (e.status === 0 || e.status >= 500) this.gate.forget();
        }
        this.mostrar(this.errorResultado(e), true);
      },
    });
  }

  private horaDe(res: RegistroAccesoResultado): string {
    const d = new Date(res.timestamp);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return horaLocal(res.fecha, res.hora);
  }

  private errorResultado(e: HttpErrorResponse): EscanerResultado {
    if (e.status === 0) {
      return { ok: false, titulo: 'Sin conexión', motivo: 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.' };
    }
    if (e.status >= 500) {
      return { ok: false, titulo: 'Error del servidor', motivo: 'El servidor no pudo procesar el escaneo. Reintenta.' };
    }
    if (e.status === 403) {
      return { ok: false, titulo: 'Sin permiso', motivo: 'Tu rol no puede registrar accesos.' };
    }
    const body = e.error as { code?: string; detail?: string } | null;
    // 409 = UNIQUE de BD (doble ingreso el mismo día); la API lo envía con code "CONFLICT".
    if (e.status === 409) {
      return { ok: false, titulo: 'Ingreso ya registrado', motivo: body?.detail ?? 'Ya existe un ingreso para hoy.' };
    }
    const titulo = (body?.code && TITULOS_ERROR[body.code]) || 'Acceso denegado';
    return { ok: false, titulo, motivo: body?.detail ?? 'El acceso fue rechazado.' };
  }

  /** Muestra el resultado a pantalla completa, da feedback y reanuda la cámara. */
  private mostrar(r: EscanerResultado, registrar: boolean): void {
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.result.set(r);
    this.feedback(r.ok);
    if (registrar) {
      this.recientes.update((l) => [{ ...r, at: Date.now() }, ...l].slice(0, 6));
    }
    this.resultTimer = setTimeout(() => {
      this.result.set(null);
      if (this.reiniciarTrasResultado && !this.destruido && !document.hidden) {
        this.reiniciarTrasResultado = false;
        void this.iniciar();
        return;
      }
      this.scanner?.resume();
    }, RESULT_MS);
  }

  private prepararAudio(): void {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx && !this.audio) this.audio = new Ctx();
      void this.audio?.resume();
    } catch {
      this.audio = null;
    }
  }

  private feedback(ok: boolean): void {
    try {
      navigator.vibrate?.(ok ? 80 : [140, 70, 140]);
    } catch {
      /* sin vibración */
    }
    try {
      if (!this.audio) return;
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.type = ok ? 'sine' : 'square';
      osc.frequency.value = ok ? 880 : 200;
      gain.gain.value = 0.12;
      osc.connect(gain).connect(this.audio.destination);
      osc.start();
      osc.stop(this.audio.currentTime + (ok ? 0.12 : 0.35));
    } catch {
      /* sin audio */
    }
  }
}
