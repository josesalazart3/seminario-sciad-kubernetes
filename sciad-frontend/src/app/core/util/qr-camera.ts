// Lector de QR por cámara (CU-04). Funciona en móvil y computadora, sin instalar nada (RNF-05):
//  - Usa la API nativa `BarcodeDetector` cuando existe (Chrome/Android, Edge, Safari reciente).
//  - Si no, cae a `jsQR` (JavaScript puro) sobre un canvas — necesario para iOS/Firefox.
// Requiere contexto seguro (HTTPS o localhost): es una restricción del navegador para getUserMedia.

/** ABORTED: se apagó la cámara mientras aún se estaba iniciando (no es un error para el usuario). */
export type CamaraErrorCode = 'INSECURE' | 'DENIED' | 'NOCAMERA' | 'BUSY' | 'UNSUPPORTED' | 'UNKNOWN' | 'ABORTED';

export class CamaraError extends Error {
  constructor(
    readonly code: CamaraErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const CAMARA_MENSAJES: Record<CamaraErrorCode, string> = {
  INSECURE:
    'El navegador solo permite usar la cámara en páginas seguras (HTTPS). Abre la aplicación desde una dirección https:// o desde localhost.',
  DENIED:
    'Se bloqueó el permiso de la cámara. Permítelo en el candado de la barra de direcciones (o en Ajustes del navegador) y vuelve a intentar.',
  NOCAMERA: 'No se encontró ninguna cámara en este dispositivo.',
  BUSY: 'La cámara está en uso por otra aplicación. Ciérrala e inténtalo de nuevo.',
  UNSUPPORTED: 'Este navegador no permite acceder a la cámara. Prueba con Chrome o Safari actualizados.',
  UNKNOWN: 'No se pudo iniciar la cámara.',
  ABORTED: 'Se canceló el inicio de la cámara.',
};

const abortada = () => new CamaraError('ABORTED', CAMARA_MENSAJES.ABORTED);

function mapError(e: unknown): CamaraError {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')
    return new CamaraError('DENIED', CAMARA_MENSAJES.DENIED);
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError')
    return new CamaraError('NOCAMERA', CAMARA_MENSAJES.NOCAMERA);
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError')
    return new CamaraError('BUSY', CAMARA_MENSAJES.BUSY);
  return new CamaraError('UNKNOWN', CAMARA_MENSAJES.UNKNOWN);
}

/** Decodifica un QR desde píxeles RGBA con jsQR (carga diferida: no pesa en el bundle inicial). */
export async function decodificarPixeles(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  probarInvertido = false,
): Promise<string | null> {
  const jsQR = (await import('jsqr')).default;
  const r = jsQR(data, width, height, {
    // En vivo se evita la pasada invertida (duplicaría el costo por fotograma).
    inversionAttempts: probarInvertido ? 'attemptBoth' : 'dontInvert',
  });
  return r?.data ?? null;
}

/** Decodifica un QR desde un archivo de imagen (alternativa cuando la cámara en vivo no está disponible). */
export async function decodificarImagen(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, w, h);
  return decodificarPixeles(img.data, w, h, true);
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare const BarcodeDetector: {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

export class QrCameraScanner {
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private paused = false;
  private detector: BarcodeDetectorLike | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private lastText: string | null = null;
  /**
   * Generación del arranque (Fase 8.5). Cada stop() la incrementa: si llega a terminar un start() de una generación
   * anterior (p. ej. el usuario salió de la pantalla mientras getUserMedia aún estaba pendiente), sus pistas se
   * detienen de inmediato y no queda ningún flujo de vídeo vivo.
   */
  private generacion = 0;

  /** Intervalo entre intentos de lectura (ms). ~8 lecturas/s es suficiente y cuida la batería. */
  private readonly intervalMs = 120;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onDetect: (text: string) => void,
  ) {}

  get active(): boolean {
    return this.running;
  }

  /** ¿Puede este navegador usar la cámara? */
  static soportado(): CamaraErrorCode | null {
    if (typeof window === 'undefined') return 'UNSUPPORTED';
    if (!window.isSecureContext) return 'INSECURE';
    if (!navigator.mediaDevices?.getUserMedia) return 'UNSUPPORTED';
    return null;
  }

  /** Cámaras de vídeo disponibles (las etiquetas solo aparecen tras conceder el permiso). */
  static async camaras(): Promise<MediaDeviceInfo[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'videoinput');
    } catch {
      return [];
    }
  }

  async start(deviceId?: string): Promise<void> {
    const motivo = QrCameraScanner.soportado();
    if (motivo) throw new CamaraError(motivo, CAMARA_MENSAJES[motivo]);

    this.stop(); // nunca dos flujos: se cierra el anterior antes de abrir uno nuevo
    const gen = this.generacion;
    const video: MediaTrackConstraints = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      throw gen !== this.generacion ? abortada() : mapError(e);
    }
    if (gen !== this.generacion) {
      // Se pidió apagar mientras se esperaba el permiso / la cámara: se libera ya.
      stream.getTracks().forEach((t) => t.stop());
      throw abortada();
    }
    this.stream = stream;

    // iOS Safari exige estos atributos para reproducir en línea.
    this.video.muted = true;
    this.video.setAttribute('playsinline', 'true');
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch (e) {
      if (gen !== this.generacion) throw abortada();
      this.stop();
      throw mapError(e);
    }
    if (gen !== this.generacion) throw abortada(); // stop() ya liberó el flujo

    await this.prepararDetector();
    if (gen !== this.generacion) throw abortada();
    this.running = true;
    this.paused = false;
    this.lastText = null;
    this.programar();
  }

  /** Apaga la cámara de verdad: pistas detenidas (luz apagada), bucle cancelado, detector/canvas liberados. */
  stop(): void {
    this.generacion++; // invalida cualquier start() que aún esté en curso
    this.running = false;
    this.paused = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.detector = null;
    if (this.canvas) {
      this.canvas.width = 0; // libera la memoria del canvas
      this.canvas.height = 0;
    }
    this.canvas = null;
    this.ctx = null;
    this.lastText = null;
  }

  pause(): void {
    this.paused = true;
  }

  /**
   * Reanuda la lectura. NO se olvida el último código: si la credencial sigue frente a la cámara
   * no se vuelve a disparar; solo lo hará cuando salga del encuadre y vuelva a presentarse.
   */
  resume(): void {
    this.paused = false;
  }

  /** ¿La cámara activa tiene linterna? */
  get linterna(): boolean {
    const track = this.stream?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    return !!caps?.torch;
  }

  async setLinterna(on: boolean): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
  }

  /** Id de la cámara en uso (para alternar entre frontal y trasera). */
  get deviceIdActual(): string | undefined {
    return this.stream?.getVideoTracks()[0]?.getSettings().deviceId;
  }

  private async prepararDetector(): Promise<void> {
    this.detector = null;
    try {
      if (typeof BarcodeDetector !== 'undefined') {
        const formats = (await BarcodeDetector.getSupportedFormats?.()) ?? ['qr_code'];
        if (formats.includes('qr_code')) this.detector = new BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch {
      this.detector = null;
    }
  }

  private programar(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.tick(), this.intervalMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    try {
      if (!this.paused && this.video.readyState >= 2 && this.video.videoWidth > 0) {
        const text = await this.leerFotograma();
        if (!this.running) return; // se apagó mientras se leía el fotograma
        if (text && text !== this.lastText) {
          this.lastText = text;
          this.onDetect(text);
        } else if (!text) {
          this.lastText = null;
        }
      }
    } catch {
      // Un fotograma fallido no debe detener el escáner.
    }
    this.programar();
  }

  private async leerFotograma(): Promise<string | null> {
    if (this.detector) {
      const found = await this.detector.detect(this.video);
      return found[0]?.rawValue ?? null;
    }
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const max = 800;
    const scale = Math.min(1, max / Math.max(vw, vh));
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!this.ctx) return null;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(this.video, 0, 0, w, h);
    const img = this.ctx.getImageData(0, 0, w, h);
    return decodificarPixeles(img.data, w, h);
  }
}
