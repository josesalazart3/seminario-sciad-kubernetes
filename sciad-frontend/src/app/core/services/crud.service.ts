// Servicios de dominio. Reconciliados al contrato real del backend (Fase 3):
// rutas reales (/usuarios, /zonas-acceso, /registros-acceso, …), payloads reales
// (correo, password obligatoria, token+zonaId, asignación persona+zona+vigencia, …)
// y desempaque de PaginadoDto [{items,total,…}] → items.
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Usuario } from '../models/user.model';
import { Zona, PerfilAcceso } from '../models/access.model';
import { Persona, PersonaPayload } from '../models/persona.model';
import { Credencial } from '../models/credential.model';
import {
  AccesoDelDia,
  Notificacion,
  RegistroAccesoResultado,
  RegistroHistorial,
} from '../models/access-log.model';
import { HallazgoAuditoria, HallazgoEstado, VerificacionAuditoriaResultado } from '../models/audit.model';
import { Reporte } from '../models/reporte.model';
import { Paginado } from '../models/paginado.model';

const API = environment.apiUrl;

/**
 * Filtro de estado de los listados de usuarios, personas y zonas (Fase 8.4). Sin parámetro el backend devuelve solo
 * los ACTIVOS; las pantallas de administración piden 'todos' y separan Activos/Deshabilitados en el cliente.
 */
export type EstadoLista = 'activo' | 'inactivo' | 'todos';

/**
 * Tamaño de página máximo que acepta el backend en historial, notificaciones, auditoría y reportes.
 * Si se pide más de 100, esos servicios IGNORAN el valor y devuelven 20 filas (truncando la lista sin avisar),
 * por eso se pide exactamente 100. (Usuarios y personas no tienen ese tope.)
 */
const MAX_PAGINA = '100';

/** Desempaqueta PaginadoDto → items (el frontend no necesita paginación real). */
function unwrapItems<T>() {
  return map((page: Paginado<T>) => page.items);
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private http: HttpClient) {}
  /** GET /api/usuarios?tamanoPagina=N[&estado] → Usuario[] (desempaquetado). Sin estado: solo activos. */
  list(estado?: EstadoLista): Observable<Usuario[]> {
    let params = new HttpParams().set('tamanoPagina', '500');
    if (estado) params = params.set('estado', estado);
    return this.http.get<Paginado<Usuario>>(`${API}/usuarios`, { params }).pipe(unwrapItems());
  }
  /** POST /api/usuarios — el backend espera `correo` (no email). */
  create(u: Usuario & { password: string }): Observable<Usuario> {
    return this.http.post<Usuario>(`${API}/usuarios`, {
      nombre: u.nombre,
      correo: u.email,
      password: u.password,
      rol: u.rol,
      puesto: u.puesto,
    });
  }
  /** PUT /api/usuarios/{id}. `password` es opcional: si no se envía, la contraseña no cambia. */
  update(u: Usuario, password?: string): Observable<Usuario> {
    return this.http.put<Usuario>(`${API}/usuarios/${u.id}`, {
      nombre: u.nombre,
      correo: u.email,
      rol: u.rol,
      puesto: u.puesto,
      ...(password ? { password } : {}),
    });
  }
  /** PATCH /api/usuarios/{id}/estado {estado} (baja lógica). */
  setEstado(id: string, estado: 'activo' | 'inactivo'): Observable<Usuario> {
    return this.http.patch<Usuario>(`${API}/usuarios/${id}/estado`, { estado });
  }
}

@Injectable({ providedIn: 'root' })
export class PersonasService {
  constructor(private http: HttpClient) {}
  /** GET /api/personas?tamanoPagina=N[&estado] → Persona[]. Sin estado: solo activas. */
  list(estado?: EstadoLista): Observable<Persona[]> {
    let params = new HttpParams().set('tamanoPagina', '500');
    if (estado) params = params.set('estado', estado);
    return this.http.get<Paginado<Persona>>(`${API}/personas`, { params }).pipe(unwrapItems());
  }
  /** Total real de personas (opcionalmente por estado), sin traer la lista: GET /api/personas?tamanoPagina=1 → total. */
  contar(estado?: 'activo' | 'inactivo'): Observable<number> {
    let params = new HttpParams().set('tamanoPagina', '1');
    if (estado) params = params.set('estado', estado);
    return this.http.get<Paginado<Persona>>(`${API}/personas`, { params }).pipe(map((page) => page.total));
  }
  create(p: PersonaPayload): Observable<Persona> {
    return this.http.post<Persona>(`${API}/personas`, p);
  }
  update(p: Persona): Observable<Persona> {
    return this.http.put<Persona>(`${API}/personas/${p.id}`, {
      nombre: p.nombre,
      dpiCodigo: p.dpiCodigo,
      tipo: p.tipo,
    });
  }
  /** PATCH /api/personas/{id}/estado (baja lógica). */
  setEstado(id: string, estado: 'activo' | 'inactivo'): Observable<Persona> {
    return this.http.patch<Persona>(`${API}/personas/${id}/estado`, { estado });
  }
}

@Injectable({ providedIn: 'root' })
export class ZonasService {
  constructor(private http: HttpClient) {}
  /** GET /api/zonas-acceso[?estado] → Zona[] (sin paginar). Sin estado: solo activas (escáner, perfiles nuevos). */
  list(estado?: EstadoLista): Observable<Zona[]> {
    const params = estado ? new HttpParams().set('estado', estado) : undefined;
    return this.http.get<Zona[]>(`${API}/zonas-acceso`, { params });
  }
  create(z: { nombre: string; nivelSeguridad: string; nivelRiesgo: string; capacidad?: number | null }): Observable<Zona> {
    return this.http.post<Zona>(`${API}/zonas-acceso`, {
      nombre: z.nombre,
      nivelSeguridad: z.nivelSeguridad,
      nivelRiesgo: z.nivelRiesgo,
      capacidad: z.capacidad ?? null,
    });
  }
  update(z: Zona): Observable<Zona> {
    return this.http.put<Zona>(`${API}/zonas-acceso/${z.id}`, {
      nombre: z.nombre,
      nivelSeguridad: z.nivelSeguridad,
      nivelRiesgo: z.nivelRiesgo,
      capacidad: z.capacidad ?? null,
    });
  }
  /** PATCH /api/zonas-acceso/{id}/estado (baja lógica). */
  setEstado(id: string, estado: 'activo' | 'inactivo'): Observable<Zona> {
    return this.http.patch<Zona>(`${API}/zonas-acceso/${id}/estado`, { estado });
  }
}

@Injectable({ providedIn: 'root' })
export class ProfilesService {
  constructor(private http: HttpClient) {}
  /** GET /api/perfiles-acceso?personaId&zonaId → PerfilAcceso[] (sin paginar). */
  list(filtros?: { personaId?: string; zonaId?: string }): Observable<PerfilAcceso[]> {
    let params = new HttpParams();
    if (filtros?.personaId) params = params.set('personaId', filtros.personaId);
    if (filtros?.zonaId) params = params.set('zonaId', filtros.zonaId);
    return this.http.get<PerfilAcceso[]>(`${API}/perfiles-acceso`, { params });
  }
  /** POST /api/perfiles-acceso — asignación persona + zona + vigencia. */
  create(p: { personaId: string; zonaId: string; vigenciaInicio: string; vigenciaFin: string }): Observable<PerfilAcceso> {
    return this.http.post<PerfilAcceso>(`${API}/perfiles-acceso`, {
      personaId: +p.personaId,
      zonaId: +p.zonaId,
      vigenciaInicio: p.vigenciaInicio,
      vigenciaFin: p.vigenciaFin,
    });
  }
  /** DELETE /api/perfiles-acceso/{id} (borrado físico permitido — entidad operativa). */
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/perfiles-acceso/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class CredentialsService {
  constructor(private http: HttpClient) {}
  /** GET /api/credenciales?personaId → Credencial[] (historial, incluye revocadas). */
  list(personaId?: string): Observable<Credencial[]> {
    const params = personaId ? new HttpParams().set('personaId', personaId) : undefined;
    return this.http.get<Credencial[]>(`${API}/credenciales`, { params });
  }
  /** POST /api/credenciales/{personaId}/generar — genera la 1.ª credencial de la persona. */
  generar(personaId: string): Observable<Credencial> {
    return this.http.post<Credencial>(`${API}/credenciales/${personaId}/generar`, {});
  }
  /** POST /api/credenciales/{id}/reemitir — revoca la anterior y crea una nueva. */
  reemitir(id: string): Observable<Credencial> {
    return this.http.post<Credencial>(`${API}/credenciales/${id}/reemitir`, {});
  }
  /** POST /api/credenciales/{id}/revocar — revocación directa con motivo opcional. */
  revocar(id: string, motivo?: string): Observable<Credencial> {
    return this.http.post<Credencial>(`${API}/credenciales/${id}/revocar`, {
      motivo: motivo ?? null,
    });
  }
}

@Injectable({ providedIn: 'root' })
export class AccessLogService {
  constructor(private http: HttpClient) {}
  /** POST /api/registros-acceso {token, zonaId} — escaneo; el tipo se infiere en el servidor. */
  escanear(payload: { token: string; zonaId: number }): Observable<RegistroAccesoResultado> {
    return this.http.post<RegistroAccesoResultado>(`${API}/registros-acceso`, payload);
  }
  /** GET /api/registros-acceso/hoy?zonaId → personas presentes hoy por zona. */
  hoy(zonaId?: number): Observable<AccesoDelDia[]> {
    const params = zonaId ? new HttpParams().set('zonaId', String(zonaId)) : undefined;
    return this.http.get<AccesoDelDia[]>(`${API}/registros-acceso/hoy`, { params });
  }
  /** GET /api/registros-acceso (historial paginado, filtros opcionales) → RegistroHistorial[]. */
  historial(filtros?: {
    personaId?: number; zonaId?: number; desde?: string; hasta?: string; tipo?: 'ingreso' | 'egreso';
  }): Observable<RegistroHistorial[]> {
    return this.historialPagina(filtros).pipe(unwrapItems());
  }
  /** Igual que `historial` pero devuelve la página completa (con `total` real) y permite fijar `tamanoPagina` (≤ 100). */
  historialPagina(filtros?: {
    personaId?: number; zonaId?: number; desde?: string; hasta?: string; tipo?: 'ingreso' | 'egreso'; tamanoPagina?: number;
  }): Observable<Paginado<RegistroHistorial>> {
    let params = new HttpParams().set('tamanoPagina', String(Math.min(filtros?.tamanoPagina ?? 100, 100)));
    if (filtros?.personaId) params = params.set('personaId', String(filtros.personaId));
    if (filtros?.zonaId) params = params.set('zonaId', String(filtros.zonaId));
    if (filtros?.desde) params = params.set('desde', filtros.desde);
    if (filtros?.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros?.tipo) params = params.set('tipo', filtros.tipo);
    return this.http.get<Paginado<RegistroHistorial>>(`${API}/registros-acceso`, { params });
  }
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  constructor(private http: HttpClient) {}
  /** GET /api/notificaciones?tamanoPagina=N → Notificacion[]. */
  list(): Observable<Notificacion[]> {
    const params = new HttpParams().set('tamanoPagina', MAX_PAGINA);
    return this.http.get<Paginado<Notificacion>>(`${API}/notificaciones`, { params }).pipe(unwrapItems());
  }
  /** PATCH /api/notificaciones/{id}/leida {leida}. */
  setLeida(id: string, leida: boolean): Observable<Notificacion> {
    return this.http.patch<Notificacion>(`${API}/notificaciones/${id}/leida`, { leida });
  }
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  constructor(private http: HttpClient) {}
  /** GET /api/auditoria?tipo&estado → HallazgoAuditoria[]. */
  list(filtros?: { tipo?: string; estado?: string }): Observable<HallazgoAuditoria[]> {
    let params = new HttpParams().set('tamanoPagina', MAX_PAGINA);
    if (filtros?.tipo) params = params.set('tipo', filtros.tipo);
    if (filtros?.estado) params = params.set('estado', filtros.estado);
    return this.http.get<Paginado<HallazgoAuditoria>>(`${API}/auditoria`, { params }).pipe(unwrapItems());
  }
  /** PATCH /api/auditoria/{id}/estado. */
  setEstado(id: string, estado: HallazgoEstado): Observable<HallazgoAuditoria> {
    return this.http.patch<HallazgoAuditoria>(`${API}/auditoria/${id}/estado`, { estado });
  }
  /** POST /api/auditoria/verificar — ejecuta la verificación de integridad (solo Admin). */
  verificar(): Observable<VerificacionAuditoriaResultado> {
    return this.http.post<VerificacionAuditoriaResultado>(`${API}/auditoria/verificar`, {});
  }
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  constructor(private http: HttpClient) {}
  /** GET /api/reportes → Reporte[] (paginado desempaquetado). */
  list(): Observable<Reporte[]> {
    const params = new HttpParams().set('tamanoPagina', MAX_PAGINA);
    return this.http.get<Paginado<Reporte>>(`${API}/reportes`, { params }).pipe(unwrapItems());
  }
  /** POST /api/reportes/generar → CSV (blob). El backend NO guarda el archivo; devuelve el CSV. */
  generar(filtros: { desde: string; hasta: string; personaId?: number; zonaId?: number; tipoEvento?: string }): Observable<Blob> {
    return this.http.post(`${API}/reportes/generar`, filtros, { responseType: 'blob' });
  }
}