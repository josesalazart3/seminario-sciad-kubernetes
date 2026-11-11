// Activos / Deshabilitados / Todos — patrón común de Usuarios, Personas y Zonas de acceso (Fase 8.4).
//
// - La pestaña vive en la URL (?estado=inactivo|todos): con F5 se vuelve a la misma pestaña y los datos se cargan solos.
// - Los conteos y el filtro salen de la misma lista (la pantalla pide estado=todos una sola vez).
// - Deshabilitar / Reactivar pide confirmación con el nombre, llama al endpoint de baja lógica que ya existe
//   (PATCH …/estado) y actualiza la fila EN SITIO: pasa de pestaña al instante, sin recargar.
// - Nada se borra (RNF-06): es solo el campo estado.
//
//   protected readonly estados = gestorEstado({ datos: this.carga.datos, esActivo: (z) => z.estado === 'activo', … });
//   plantilla: <sci-estado-tabs [valor]="estados.tab()" [conteos]="estados.conteos()" (cambio)="estados.irA($event)" />
import { WritableSignal, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { mensajeError } from './recurso';

export type PestanaEstado = 'activos' | 'deshabilitados' | 'todos';
export type EstadoRegistro = 'activo' | 'inactivo';

export interface ConteosEstado {
  activos: number;
  deshabilitados: number;
  todos: number;
}

export interface ConfigGestorEstado<T> {
  /** Lista completa (todos los estados), normalmente `recurso(…).datos`. */
  datos: WritableSignal<T[]>;
  id: (x: T) => string;
  nombre: (x: T) => string;
  esActivo: (x: T) => boolean;
  /** Llama al endpoint de baja lógica existente y devuelve el registro actualizado. */
  cambiar: (x: T, estado: EstadoRegistro) => Observable<T>;
  /** "usuario" / "persona" / "zona" (singular) y su plural, para los textos. */
  singular: string;
  plural: string;
  /** Género gramatical del sustantivo, para "deshabilitado/a". */
  femenino?: boolean;
}

export interface Confirmacion<T> {
  item: T;
  accion: 'deshabilitar' | 'reactivar';
}

const DE_URL: Record<string, PestanaEstado> = { inactivo: 'deshabilitados', todos: 'todos' };
const A_URL: Record<PestanaEstado, string | null> = { activos: null, deshabilitados: 'inactivo', todos: 'todos' };

/** Debe llamarse en un contexto de inyección (inicializador de campo de un componente). */
export function gestorEstado<T>(cfg: ConfigGestorEstado<T>) {
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const toast = inject(ToastService);
  const a = cfg.femenino ? 'a' : 'o';

  const tab = signal<PestanaEstado>(DE_URL[route.snapshot.queryParamMap.get('estado') ?? ''] ?? 'activos');
  const pendiente = signal<Confirmacion<T> | null>(null);
  const procesando = signal(false);

  const conteos = computed<ConteosEstado>(() => {
    const lista = cfg.datos();
    const activos = lista.filter(cfg.esActivo).length;
    return { activos, deshabilitados: lista.length - activos, todos: lista.length };
  });

  /** Mensaje del estado vacío según la pestaña ("No hay usuarios deshabilitados"). */
  const vacio = computed(() => {
    switch (tab()) {
      case 'activos': return `No hay ${cfg.plural} activ${a}s.`;
      case 'deshabilitados': return `No hay ${cfg.plural} deshabilitad${a}s.`;
      default: return `No hay ${cfg.plural} registrad${a}s.`;
    }
  });

  return {
    tab: tab.asReadonly(),
    conteos,
    vacio,
    pendiente: pendiente.asReadonly(),
    procesando: procesando.asReadonly(),

    /** Cambia de pestaña y la refleja en la URL (sin recargar ni volver a pedir datos). */
    irA(p: PestanaEstado): void {
      tab.set(p);
      void router.navigate([], { relativeTo: route, queryParams: { estado: A_URL[p] }, queryParamsHandling: 'merge', replaceUrl: true });
    },

    /** Aplica la pestaña a una lista (que ya puede venir filtrada por búsqueda, tipo, rol…). */
    filtrar(lista: T[]): T[] {
      const t = tab();
      return t === 'todos' ? lista : lista.filter((x) => cfg.esActivo(x) === (t === 'activos'));
    },

    /** Abre la confirmación de deshabilitar o reactivar. */
    pedir(item: T): void {
      pendiente.set({ item, accion: cfg.esActivo(item) ? 'deshabilitar' : 'reactivar' });
    },
    cancelar(): void {
      if (!procesando()) pendiente.set(null);
    },

    /** Textos del diálogo de confirmación con el nombre del registro. */
    textos(c: Confirmacion<T>) {
      const nombre = cfg.nombre(c.item);
      return c.accion === 'deshabilitar'
        ? {
            titulo: `Deshabilitar ${cfg.singular}`,
            mensaje: `¿Deshabilitar a «${nombre}»? Pasará a la pestaña Deshabilitad${a}s. No se borra nada: su historial se conserva y puede reactivarse cuando quiera.`,
            boton: 'Deshabilitar',
          }
        : {
            titulo: `Reactivar ${cfg.singular}`,
            mensaje: `¿Reactivar a «${nombre}»? Volverá a la pestaña Activ${a}s.`,
            boton: 'Reactivar',
          };
    },

    /** Llama al backend y mueve la fila de pestaña en sitio (sin recargar). */
    confirmar(): void {
      const c = pendiente();
      if (!c || procesando()) return;
      const nuevo: EstadoRegistro = c.accion === 'deshabilitar' ? 'inactivo' : 'activo';
      procesando.set(true);
      cfg.cambiar(c.item, nuevo).subscribe({
        next: (actualizado) => {
          const id = cfg.id(c.item);
          cfg.datos.update((lista) => lista.map((x) => (cfg.id(x) === id ? actualizado : x)));
          procesando.set(false);
          pendiente.set(null);
          const ini = cfg.singular.charAt(0).toUpperCase() + cfg.singular.slice(1);
          toast.success(nuevo === 'inactivo' ? `${ini} deshabilitad${a}` : `${ini} reactivad${a}`, cfg.nombre(actualizado));
        },
        error: (e: unknown) => {
          procesando.set(false);
          pendiente.set(null);
          toast.error(`No se pudo ${c.accion}`, mensajeError(e, 'Intente de nuevo.'));
        },
      });
    },
  };
}

export type GestorEstado<T> = ReturnType<typeof gestorEstado<T>>;
