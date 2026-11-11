# DERCAS — Sistema de Control Integral de Identidad y Acceso Digital (SCIAD)

> **Documento de Especificaciones, Requerimientos y Criterios de Aceptación del Software**
>
> Universidad Mariano Gálvez de Guatemala  
> Facultad de Ingeniería en Sistemas de Información  
> Proyecto de Graduación I — Ciclo 2026
>
> **Autor:** José Leonel Salazar Tejeda  
> **Carné:** 7690-22-8974  
> **Versión:** 1.0  
> **Fecha:** Agosto 2026  
> **Ref.:** `SCIAD-2026-DERCAS-v1.0`

---

## Tabla de contenido

1. [Introducción](#1-introducción)
2. [Descripción general del sistema](#2-descripción-general-del-sistema)
3. [Requerimientos funcionales](#3-requerimientos-funcionales)
4. [Especificación detallada de casos de uso](#4-especificación-detallada-de-casos-de-uso)
5. [Requerimientos no funcionales](#5-requerimientos-no-funcionales)
6. [Criterios de aceptación](#6-criterios-de-aceptación)
7. [Modelo conceptual de base de datos](#7-modelo-conceptual-de-base-de-datos)
8. [Interfaces externas](#8-interfaces-externas)
9. [Plan de pruebas](#9-plan-de-pruebas)
10. [Gestión de riesgos](#10-gestión-de-riesgos)
11. [Restricciones técnicas del sistema](#11-restricciones-técnicas-del-sistema)
12. [Cronograma de actividades](#12-cronograma-de-actividades)
13. [Matriz de trazabilidad](#13-matriz-de-trazabilidad)
14. [Control de versiones](#14-control-de-versiones)

---

## 1. Introducción

### 1.1 Propósito del documento

El presente DERCAS establece de manera formal los **requerimientos funcionales**, **no funcionales** y los **criterios de aceptación** del Sistema de Control Integral de Identidad y Acceso Digital (SCIAD). Su propósito es servir como acuerdo técnico entre el desarrollador y los _stakeholders_ del proyecto —administradores, personal de seguridad, gerencia y auditoría de organizaciones ubicadas en la Zona 1 de la Ciudad de Guatemala— y como referencia base para las fases de diseño, desarrollo, pruebas y validación.

### 1.2 Alcance del sistema

El SCIAD automatiza los procesos críticos de control de acceso físico y trazabilidad de personal:

- **Autenticación y gestión de usuarios** mediante credenciales y roles (RBAC).
- **Gestión de perfiles de acceso** con zonas autorizadas, horarios y vigencias por colaborador/visitante.
- **Generación y gestión de credenciales QR cifradas** con tokens únicos de 64 caracteres hexadecimales (SHA-256).
- **Registro de ingreso/egreso mediante escaneo QR** desde dispositivos móviles (BYOD) con validación en tiempo real contra PostgreSQL.
- **Consulta de reportes de accesos del día** para personal de seguridad (presencia actual en instalaciones).
- **Historial completo de accesos** en tiempo real para gerencia y auditoría (latencia máxima 5 segundos).
- **Generación de reportes de auditoría** exportables en CSV/PDF por período, colaborador, zona o tipo de evento.
- **Auditoría de integridad de bitácoras** (accesos sin egreso, duplicados, tokens inválidos, campos nulos, accesos fuera de horario).
- **Notificaciones automáticas** por eventos anómalos: accesos fuera de horario, intentos de suplantación, tokens revocados, concentración de personas.
- **Infraestructura Cloud (VPS)** con disponibilidad objetivo 99.9% y escalabilidad para ≥500 escaneos concurrentes en hora pico.

> ⚠️ **Fuera del alcance:** módulos de nómina, recursos humanos, gestión documental, control de activos, sistemas biométricos, hardware de lectores fijos.

### 1.3 Definiciones y acrónimos

| Término / Acrónimo | Definición |
|---|---|
| **SCIAD** | Sistema de Control Integral de Identidad y Acceso Digital — sistema objeto de este documento. |
| **RBAC** | _Role-Based Access Control_ — modelo de autorización que restringe el acceso según el rol del usuario autenticado. |
| **QR** | _Quick Response_ — código de respuesta rápida bidimensional que codifica el token cifrado. |
| **Token QR** | Hash alfanumérico de 64 caracteres (CHAR(64)) generado con SHA-256 + salt. No contiene datos personales legibles (Privacy by Design, RNF-01, RNF-10). |
| **BYOD** | _Bring Your Own Device_ — uso del dispositivo móvil del personal de seguridad como terminal de escaneo. Sin inversión en hardware especializado. |
| **ACID** | _Atomicity, Consistency, Isolation, Durability_ — propiedades de integridad transaccional de PostgreSQL 16. |
| **JWT** | _JSON Web Token_ — token de autenticación para sesiones API. Algoritmo HS256, expiración 8 h de inactividad. |
| **bcrypt** | Función de hash para contraseñas de usuarios del sistema. Cost factor 10. |
| **VPS** | _Virtual Private Server_ — servidor virtual privado (Contabo: 4 vCPU, 8 GB RAM, Ubuntu Server). |
| **CUI/DPI** | Código Único de Identificación / Documento Personal de Identificación — documento de identidad guatemalteco. |
| **CU / RF / RNF / CA** | Caso de uso / Requerimiento Funcional / No Funcional / Criterio de Aceptación. |
| **IAM** | _Identity and Access Management_ — gestión de identidad y acceso. |

### 1.4 Referencias

| # | Documento | Fuente |
|---|---|---|
| R1 | Constitución Política de la República de Guatemala — Art. 31 | Congreso de la República de Guatemala |
| R2 | Decreto 57-2008 — Ley de Acceso a la Información Pública | Congreso de la República de Guatemala |
| R3 | Expediente 863-2011 — Derecho de autodeterminación informativa | Corte de Constitucionalidad de Guatemala |
| R4 | Anteproyecto SCIAD — Capítulos I a III | Salazar Tejeda, J. L. (2026) |
| R5 | IEEE Std 830-1998 — Práctica recomendada para SRS | IEEE |
| R6 | Proceso Unificado de Rational (RUP) — Fases y disciplinas | Rational Software / IBM |
| R7 | `database/schema.sql` — Esquema PostgreSQL 16 del SCIAD | Repositorio SCIAD (2026) |
| R8 | `README.md` — Arquitectura y stack tecnológico | Repositorio SCIAD (2026) |
| R9 | Tabla 1 — Arquitectura técnica del SCIAD (Cap. I, Tesis) | Salazar Tejeda, J. L. (2026) |
| R10 | Tabla 7 — Requerimientos funcionales (Cap. III, Tesis) | Salazar Tejeda, J. L. (2026) |
| R11 | Tabla 8 — Requerimientos no funcionales (Cap. III, Tesis) | Salazar Tejeda, J. L. (2026) |
| R12 | Tabla 9 — Correspondencia módulos/pantallas (Cap. III, Tesis) | Salazar Tejeda, J. L. (2026) |
| R13 | Tabla 10 — Endpoints API REST (Cap. III, Tesis) | Salazar Tejeda, J. L. (2026) |
| R14 | Tabla 11 — Diccionario de datos (Cap. III, Tesis) | Salazar Tejeda, J. L. (2026) |

---

## 2. Descripción general del sistema

### 2.1 Perspectiva del producto

El SCIAD es un **sistema de control de acceso físico y trazabilidad** diseñado para organizaciones de la Zona 1 de la Ciudad de Guatemala. Opera como una plataforma **Cloud-centralizada** que elimina la dependencia de bitácoras físicas, credenciales magnéticas y sistemas biométricos aislados, consolidando una única fuente de verdad auditable en tiempo real.

```
┌─────────────────────────────────────────────────────────────────┐
│              ORGANIZACIÓN - ZONA 1, CIUDAD DE GUATEMALA         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Dispositivo │  │  Estación   │  │    Dispositivo Personal  │  │
│  │   Móvil     │  │  de Trabajo │  │  (Gerencia / Auditoría)  │  │
│  │ (BYOD)      │  │  (Admin)    │  │                          │  │
│  │             │  │             │  │                          │  │
│  │ Angular SPA │  │ Angular SPA │  │      Angular SPA         │  │
│  │ Módulo      │  │ Panel       │  │      Portal de           │  │
│  │ Escaneo QR  │  │ Administrativo│  │      Trazabilidad      │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬──────────────┘  │
│         │                │                    │                  │
│         └────────────────┼────────────────────┘                  │
│                          │ HTTPS/TLS 1.3 (Puerto 443)            │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  VPS CLOUD (Contabo)                      │   │
│  │  4 vCPU / 8 GB RAM / Ubuntu Server                        │   │
│  │  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐  │   │
│  │  │  Contenedor     │  │  PostgreSQL  │  │  Archivos   │  │   │
│  │  │  .NET Runtime   │  │     16       │  │  Estáticos  │  │   │
│  │  │  API REST       │  │  (ACID)      │  │  (Angular   │  │   │
│  │  │  C# / .NET Core │  │              │  │   Bundle)   │  │   │
│  │  └─────────────────┘  └──────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```



![Diagrama de Arquitectura](diagramas/02_Arquitectura_del_Sistema.png)

### 2.2 Funciones principales y actores

| Actor | Descripción | Módulos accesibles |
|---|---|---|
| **Administrador** | Configuración global, gestión de usuarios/roles, perfiles de acceso, credenciales QR, auditoría de bitácoras, reportes | Gestión y Auditoría, Identificación y Acceso, Gestión de Perfiles y Zonas |
| **Personal de Seguridad** | Operación en puntos de acceso: escaneo QR, registro ingreso/egreso, consulta accesos del día | Registro de Accesos, Identificación y Acceso |
| **Gerencia / Auditoría** | Consulta pasiva (solo lectura): historial, reportes, notificaciones, trazabilidad | Portal de Trazabilidad |
| **Sistema (SCIAD)** | Generación automática de notificaciones por eventos anómalos | Notificaciones (interno) |

### 2.3 Credenciales del sistema (demo — contraseña `123456`)

| Usuario | Rol | Email | Módulos |
|---|---|---|---|
| `admin` | Administrador | admin@sciad.local | Todos |
| `seguridad1` | Personal de Seguridad | seg1@sciad.local | Registro de Accesos, Accesos del Día |
| `gerencia1` | Gerencia / Auditoría | ger1@sciad.local | Historial, Reportes, Notificaciones |

> **Nota:** En producción, `SCIAD_JWT_SECRET` es obligatorio (mín. 32 chars). Fail-fast si falta. Contraseñas hasheadas con bcrypt (cost 10).

### 2.4 Restricciones

- **Infraestructura:** VPS único (sin alta disponibilidad multi-zona en v1.0).
- **Conectividad:** Requiere Internet estable en puntos de acceso (Wi-Fi/datos móviles).
- **BYOD:** Personal de seguridad debe disponer de smartphone Android 8+ / iOS 14+ con cámara funcional y navegador Chrome ≥90 / Safari ≥14.
- **Cifrado:** Tokens QR SHA-256 + salt (64 hex). Comunicación obligatoria HTTPS/TLS 1.3.
- **Sesión:** Expiración automática a 8 horas de inactividad (RF-10, RNF-01).
- **No eliminación física:** Registros históricos inmutables (RNF-06, integridad referencial).

### 2.5 Supuestos y dependencias

- La organización provee datos base de colaboradores/visitantes (nombre, DPI, zona, horarios) con veracidad.
- Existe conectividad a Internet en los puntos de acceso (supuesto de investigación validado en fase piloto).
- Personal de seguridad y colaboradores tienen alfabetización digital básica para operar la interfaz de escaneo.
- La gerencia ha manifestado interés institucional y aval para pruebas piloto (abril 2026).
- Cumplimiento normativo: Constitución Art. 31 y Decreto 57-2008 (protección de datos sensibles).

---

## 3. Requerimientos funcionales

Los requerimientos funcionales se derivan directamente de los casos de uso definidos para el SCIAD (Tabla 7 de la Tesis, Capítulo III). Cada uno incluye identificador, caso de uso de origen, actor responsable, descripción y nivel de prioridad.

| ID | CU | Nombre | Actor | Descripción | Prioridad |
|---|---|---|---|---|---|
| **RF-01** | CU-01 | Gestionar usuarios | Administrador | CRUD de perfiles con asignación de rol (RBAC). La deshabilitación no elimina el registro (baja lógica). Incluye autenticación (CU-10). | Alta |
| **RF-02** | CU-02 | Gestionar Perfiles de Acceso | Administrador | Definir zonas autorizadas, horarios de acceso y perfiles por colaborador/visitante. Un colaborador puede tener múltiples zonas asignadas con vigencia (inicio/fin). Incluye autenticación (CU-10). | Alta |
| **RF-03** | CU-03 | Gestionar Credenciales QR | Administrador | Generar token cifrado (SHA-256, 64 hex), exportar para impresión. Reemitir en caso de extravío invalidando el token anterior (trazabilidad via `reemitido_de`). Incluye autenticación (CU-10). | Alta |
| **RF-04** | CU-04 | Registrar Ingreso/Egreso mediante Escaneo QR | Personal de Seguridad (BYOD) | Escanear credencial QR, validar token contra PostgreSQL y registrar timestamp con zona de acceso. Alerta visual verde/roja si token válido/inválido, revocado o sin autorización. Incluye autenticación (CU-10). | Alta |
| **RF-05** | CU-05 | Consultar Reporte de Accesos del Día | Personal de Seguridad | Ver quiénes se encuentran actualmente en las instalaciones, basándose en escaneos de ingreso/egreso del día. Distingue colaboradores activos, visitantes y salidas. Incluye autenticación (CU-10). | Media |
| **RF-06** | CU-06 | Consultar Historial de Accesos | Gerencia / Auditoría | Historial completo de ingresos/egresos por colaborador, visitante o zona con timestamp exacto. Actualización en tiempo real (máx. 5 seg de latencia). Incluye autenticación (CU-10). | Alta |
| **RF-07** | CU-07 | Generar Reportes de Auditoría | Administrador / Gerencia | Exportar reportes de acceso en formato CSV o PDF por período, colaborador, zona o tipo de evento. Incluye trazabilidad completa para auditorías internas y externas. Incluye autenticación (CU-10). | Alta |
| **RF-08** | CU-08 | Auditar Integridad de Bitácoras | Administrador | Reporte de inconsistencias en PostgreSQL: accesos sin egreso, duplicados, tokens inválidos, campos nulos, accesos fuera de horario autorizado. Incluye autenticación (CU-10). | Media |
| **RF-09** | CU-09 | Recibir Notificaciones Automáticas | Sistema → Gerencia | Enviar alertas automáticas por eventos anómalos: accesos fuera de horario, intentos de suplantación, tokens revocados, concentración de personas en zonas específicas. | Media |
| **RF-10** | CU-10 | Autenticarse en el Sistema | Todos | Validar credenciales y asignar permisos por rol (RBAC). Sesión expira tras 8h de inactividad. Es incluido por todos los casos de uso. | Alta |

---

## 4. Especificación detallada de casos de uso

### Diagrama general del sistema



![Diagrama de Casos de Uso](diagramas/01_Diagrama_Casos_de_Uso.png)

---

### CU-01: Gestionar Usuarios

| Atributo | Detalle |
|---|---|
| **Actor primario** | Administrador |
| **Precondición** | Usuario autenticado con rol Administrador (RF-10) |
| **Flujo principal** | 1. Acceder a pantalla "Usuarios"<br>2. Listar usuarios existentes con paginación<br>3. Crear/Editar: ingresar nombre, correo, rol, estado<br>4. Guardar → validar unicidad de correo → persistir<br>5. Deshabilitar: cambio de estado a `inactivo` (baja lógica) |
| **Flujos alternativos** | A1: Correo duplicado → error 409<br>A2: Rol inexistente → error 400 |
| **Postcondición** | Usuario creado/actualizado/deshabilitado en BD con auditoría |
| **RF asociados** | RF-01, RF-10 |

---

### CU-02: Gestionar Perfiles de Acceso

| Atributo | Detalle |
|---|---|
| **Actor primario** | Administrador |
| **Precondición** | Usuario autenticado con rol Administrador; zonas y personas existen |
| **Flujo principal** | 1. Acceder a pantalla "Perfiles de Acceso"<br>2. Seleccionar persona (colaborador/visitante)<br>3. Asignar zona(s) autorizada(s) con vigencia (fecha inicio/fin)<br>4. Definir horarios permitidos por zona<br>5. Guardar → validar solapamientos y referencias FK |
| **Flujos alternativos** | A1: Zona no existe → error 404<br>A2: Vigencia inválida (fin < inicio) → error 400<br>A3: Persona inactiva → advertencia |
| **Postcondición** | Perfil(es) de acceso creado(s) en `perfiles_acceso` |
| **RF asociados** | RF-02, RF-10 |

---

### CU-03: Gestionar Credenciales QR

| Atributo | Detalle |
|---|---|
| **Actor primario** | Administrador |
| **Precondición** | Usuario autenticado con rol Administrador; persona existe y está activa |
| **Flujo principal** | 1. Acceder a pantalla "Credenciales QR"<br>2. Seleccionar persona → generar token SHA-256 único (64 hex)<br>3. Exportar QR (imagen PNG/SVG) para impresión de gafete<br>4. Reemisión: invalidar token anterior (`estado=revocado`), registrar `reemitido_de` → nuevo token |
| **Flujos alternativos** | A1: Persona inactiva → bloquear generación<br>A2: Colisión de token (extremadamente improbable) → reintento automático |
| **Postcondición** | Credencial en `credenciales_qr` con token único; anterior marcada `revocada` si reemisión |
| **RF asociados** | RF-03, RF-10, RNF-01 |

---

### CU-04: Registrar Ingreso/Egreso mediante Escaneo QR

| Atributo | Detalle |
|---|---|
| **Actor primario** | Personal de Seguridad (BYOD) |
| **Precondición** | Usuario autenticado con rol Personal de Seguridad; dispositivo con cámara y navegador compatible |
| **Flujo principal** | 1. Acceder a pantalla "Registro de Accesos"<br>2. Activar cámara → escanear credencial QR del colaborador/visitante<br>3. Cliente decodifica token → POST `/accesos` {token, zona, timestamp} + Bearer JWT<br>4. Backend valida: sesión, rol, token QR existe y `estado=activo`, persona `activa`, perfil autorizado para zona<br>5. Verifica no duplicado (única por persona/fecha/tipo via BD)<br>6. INSERT en `registros_acceso` (transacción ACID)<br>7. Evalúa disparadores notificación (fuera de horario, patrón inusual) → RF-09<br>8. Respuesta 200 OK → alerta visual verde (autorizado) / roja (denegado) |
| **Flujos alternativos** | A1: Sesión expirada → 401 → redirigir login<br>A2: Token QR inválido/revoco → 400 → alerta roja<br>A3: Persona inactiva → 400 → alerta roja<br>A4: Zona no autorizada para perfil → 400 → alerta roja<br>A5: Ingreso duplicado mismo día → 409 → alerta roja<br>A6: Error de red → reintento / cola local |
| **Postcondición** | Registro en `registros_acceso` con timestamp exacto; notificación si aplica |
| **RF asociados** | RF-04, RF-10, RNF-01, RNF-03, RNF-04, RNF-06 |
| **Diagrama de secuencia** | Ver [Sección 8.1](#81-api-rest--backend-cnet-core) |

---

### CU-05: Consultar Reporte de Accesos del Día

| Atributo | Detalle |
|---|---|
| **Actor primario** | Personal de Seguridad |
| **Precondición** | Usuario autenticado con rol Personal de Seguridad |
| **Flujo principal** | 1. Acceder a pantalla "Accesos del Día"<br>2. Consulta GET `/accesos?fecha=hoy` → lista en tiempo real<br>3. Vista: dentro/fuera, colaborador/visitante, zona, hora |
| **Flujos alternativos** | A1: Filtrar por zona / tipo persona |
| **Postcondición** | Vista actualizada (latencia < 2 seg, RNF-03) |
| **RF asociados** | RF-05, RF-10 |

---

### CU-06: Consultar Historial de Accesos

| Atributo | Detalle |
|---|---|
| **Actor primario** | Gerencia / Auditoría |
| **Precondición** | Usuario autenticado con rol Gerencia/Auditoría |
| **Flujo principal** | 1. Acceder a pantalla "Historial de Accesos"<br>2. Filtros: persona, zona, fecha rango, tipo (ingreso/egreso)<br>3. Consulta GET `/accesos` con parámetros → paginado<br>4. Exportar CSV/PDF opcional |
| **Flujos alternativos** | A1: Sin resultados → lista vacía |
| **Postcondición** | Historial consultado (latencia máx. 5 seg, RF-06) |
| **RF asociados** | RF-06, RF-10 |

---

### CU-07: Generar Reportes de Auditoría

| Atributo | Detalle |
|---|---|
| **Actor primario** | Administrador / Gerencia |
| **Precondición** | Usuario autenticado con rol Administrador o Gerencia/Auditoría |
| **Flujo principal** | 1. Acceder a pantalla "Reportes de Auditoría"<br>2. Seleccionar parámetros: período, colaborador/visitante, zona, tipo evento<br>3. Generar → Backend agrega datos → exporta CSV/PDF<br>4. Registro en `reportes` con `usuario_id`, `periodo`, `total_registros`, `generado` |
| **Flujos alternativos** | A1: Período sin datos → reporte vacío con cabecera |
| **Postcondición** | Archivo descargado; registro en tabla `reportes` |
| **RF asociados** | RF-07, RF-10 |

---

### CU-08: Auditar Integridad de Bitácoras

| Atributo | Detalle |
|---|---|
| **Actor primario** | Administrador |
| **Precondición** | Usuario autenticado con rol Administrador |
| **Flujo principal** | 1. Acceder a pantalla "Auditoría de Bitácoras"<br>2. Ejecutar verificación automática (POST `/auditoria/verificar`)<br>3. Consultas BD: ingresos sin egreso, duplicados (misma persona/fecha/tipo), tokens inexistentes, campos nulos, accesos fuera de horario según perfil<br>4. Resultados insertados en `auditoria` con `tipo`, `descripcion`, `persona_id`, `estado`, `fecha` |
| **Flujos alternativos** | A1: Sin inconsistencias → reporte limpio |
| **Postcondición** | Hallazgos registrados en `auditoria` para trazabilidad |
| **RF asociados** | RF-08, RF-10, RNF-06 |

---

### CU-09: Recibir Notificaciones Automáticas

| Atributo | Detalle |
|---|---|
| **Actor primario** | Sistema (automático) → Gerencia / Auditoría |
| **Precondición** | Evento de acceso registrado (CU-04) |
| **Flujo principal** | 1. Backend evalúa disparadores tras INSERT en `registros_acceso`:<br>   - Hora fuera de rango permitido en `perfiles_acceso`<br>   - Token revocado usado (intento suplantación)<br>   - Concentración > umbral en zona/hora<br>2. Si se cumple → INSERT en `notificaciones` (`usuario_id` gerencia, `persona_id`, `tipo`, `mensaje`, `leida=false`)<br>3. Gerencia/Auditoría ve notificación en Portal (campana/badge) |
| **Flujos alternativos** | A1: Sin gerentes activos → notificación queda pendiente (`leida=false`) |
| **Postcondición** | Notificación persistida y visible en Portal de Trazabilidad |
| **RF asociados** | RF-09 |

---

### CU-10: Autenticarse en el Sistema

| Atributo | Detalle |
|---|---|
| **Actor primario** | Todos (Administrador, Personal de Seguridad, Gerencia/Auditoría) |
| **Precondición** | Usuario registrado en `usuarios` con `estado=activo` |
| **Flujo principal** | 1. Acceder a `/login` → ingresar correo + contraseña<br>2. POST `/Autenticación` → Backend valida bcrypt(hash) ↔ password_hash<br>3. Si OK → genera JWT (HS256, 8h, claims: user_id, rol, exp)<br>4. Cliente guarda JWT en memoria (no localStorage) → redirige a dashboard según rol |
| **Flujos alternativos** | A1: Credenciales inválidas → 401 + mensaje genérico<br>A2: Usuario inactivo → 403<br>A3: JWT expirado → 401 → redirigir login |
| **Postcondición** | Sesión autenticada con rol validado en cada request (RBAC) |
| **RF asociados** | RF-10, RNF-01, RNF-10 |

---

## 5. Requerimientos no funcionales

Los requerimientos no funcionales definen los atributos de calidad que el SCIAD debe satisfacer (Tabla 8 de la Tesis, Capítulo III).

| ID | Categoría | Descripción | Prioridad |
|---|---|---|---|
| **RNF-01** | Seguridad | Token QR: hash SHA-256 + salt. No contiene datos legibles. Comunicación bajo protocolo HTTPS/TLS 1.3. | Alta |
| **RNF-02** | Disponibilidad | Uptime ≥ 99.9% mensual. Mantenimiento programado fuera de horario de mayor afluencia (6:00–9:00 y 12:00–14:00). | Alta |
| **RNF-03** | Rendimiento | Escaneo QR y registro en base de datos en menos de 2 segundos bajo condiciones normales de red. | Alta |
| **RNF-04** | Escalabilidad | Soportar al menos 500 escaneos concurrentes en hora pico (7:00–8:00 a.m.) sin degradación del servicio. | Alta |
| **RNF-05** | Compatibilidad | Interfaz de escaneo BYOD compatible con navegadores Chrome ≥90 y Safari ≥14, en dispositivos Android 8+ e iOS 14+, sin requerir instalación nativa. | Alta |
| **RNF-06** | Integridad | Todas las escrituras en PostgreSQL cumplen las propiedades ACID. No se permite la eliminación física de registros históricos. | Alta |
| **RNF-07** | Normativa | Los reportes de auditoría cumplen con los estándares de protección de datos (Constitución Política Art. 31 y Decreto 57-2008). | Alta |
| **RNF-08** | Usabilidad | Cualquier acción principal se completa en un máximo de 3 pasos. Tiempo de capacitación inicial ≤ 2 horas. | Media |
| **RNF-09** | Mantenibilidad | Costo de mantenimiento ≤ Q634.00/año. Código desarrollado bajo principios SOLID y documentado mediante comentarios XML (C#). | Media |
| **RNF-10** | Privacidad | Datos personales de colaboradores y visitantes tratados conforme al Decreto 57-2008. Contraseñas de usuarios almacenadas mediante hash bcrypt. | Alta |

---

## 6. Criterios de aceptación

| CA-ID | RF/RNF | Descripción | Verificación |
|---|---|---|---|
| CA-01 | RF-01 | CRUD usuarios con RBAC; baja lógica (no delete físico) | Prueba unitaria + E2E: crear, listar, editar, deshabilitar, verificar `estado=inactivo` |
| CA-02 | RF-02 | Perfiles de acceso con zonas, horarios, vigencias; múltiples zonas por persona | Prueba unitaria: crear perfil, validar FK, solapamiento de horarios |
| CA-03 | RF-03 | Token QR único 64 hex (SHA-256); reemisión invalida anterior (`reemitido_de`) | Prueba unitaria: generar 1000 tokens → 0 colisiones; reemitir → anterior `revocada` |
| CA-04 | RF-04 | Escaneo → validación token + persona + perfil + zona → registro ACID < 2 seg; alerta visual | Prueba E2E: 100 escaneos válidos/inválidos; medir latencia P95 < 2s; verificar alerta |
| CA-05 | RF-05 | Reporte día muestra presentes/ausentes por zona, tipo persona, tiempo real | Prueba E2E: ingresar 5 personas → consultar → 5 en lista "dentro" |
| CA-06 | RF-06 | Historial con filtros (persona, zona, fecha, tipo); latencia ≤ 5 seg | Prueba carga: 10k registros → consulta filtrada P95 < 5s |
| CA-07 | RF-07 | Exportar CSV/PDF con trazabilidad completa; registro en tabla `reportes` | Prueba E2E: generar reporte → verificar archivo + fila en `reportes` |
| CA-08 | RF-08 | Auditoría detecta: sin egreso, duplicados, tokens inválidos, nulos, fuera horario | Prueba unitaria: sembrar datos con anomalías → ejecutar → verificar hallazgos en `auditoria` |
| CA-09 | RF-09 | Notificación automática por eventos anómalos; visible en Portal | Prueba E2E: ingresar fuera de horario → notificación en `notificaciones` + Portal |
| CA-10 | RF-10 | Login → JWT 8h; expiración inactividad; RBAC en cada endpoint | Prueba seguridad: token expirado → 401; rol incorrecto → 403 |
| CA-11 | RNF-01 | HTTPS/TLS 1.3 obligatorio; token QR sin datos legibles | Escaneo tráfico (Wireshark): solo ciphertext; QR decode → solo token hex |
| CA-12 | RNF-02 | Uptime ≥ 99.9% (métrica Prometheus/Grafana en piloto) | Monitoreo 30 días piloto |
| CA-13 | RNF-03 | P95 latencia escaneo+registro < 2s | Prueba carga 500 concurrentes (k6/JMeter) |
| CA-14 | RNF-04 | 500 escaneos concurrentes sin error 5xx ni timeout | Prueba carga sostenida 5 min |
| CA-15 | RNF-05 | Funciona en Chrome 90+, Safari 14+, Android 8+, iOS 14+ | Matriz de compatibilidad (BrowserStack / dispositivos reales) |
| CA-16 | RNF-06 | Transacciones ACID; no DELETE físico en tablas históricas | Revisión código + migración BD: solo `estado` / soft delete |
| CA-17 | RNF-07 | Reportes cumplen Art. 31 y Decreto 57-2008 | Checklist legal: consentimiento, minimización, acceso, rectificación |
| CA-18 | RNF-08 | Flujo principal ≤ 3 clics; capacitación ≤ 2h | Test usabilidad con 5 usuarios representación |
| CA-19 | RNF-09 | Costo mantenimiento ≤ Q634/año; código SOLID + XML docs | Factura VPS + dominio; SonarQube / revisión código |
| CA-20 | RNF-10 | bcrypt cost 10 en `password_hash`; datos personales no en QR | Inspección BD: hash ≠ plaintext; QR decode → solo token |

---

## 7. Modelo conceptual de base de datos

### 7.1 Diagrama entidad-relación



![Modelo Conceptual](diagramas/03_Modelo_Conceptual.png)

![Modelo Entidad-Relación](diagramas/04_Modelo_Entidad_Relacion.png)

### 7.2 Descripción de tablas (Diccionario de datos — Tabla 11 Tesis)

#### `roles`
| Campo | Tipo | Restricción | Descripción |
|---|---|---|---|
| id | SERIAL | PK | Identificador del rol |
| nombre | VARCHAR(40) | UNIQUE, NOT NULL | Nombre del rol (Administrador, Personal de Seguridad, Gerencia/Auditoría) |

#### `usuarios`
| Campo | Tipo | Restricción | Descripción |
|---|---|---|---|
| id | SERIAL | PK | Identificador del usuario |
| nombre | VARCHAR(120) | NOT NULL | Nombre completo del usuario |
| correo | VARCHAR(120) | UNIQUE, NOT NULL | Correo electrónico institucional (login) |
| password_hash | VARCHAR(100) | NOT NULL | Contraseña cifrada mediante hash bcrypt (cost 10) |
| rol_id | INTEGER | FK → roles(id) | Rol asignado al usuario |
| estado | VARCHAR(20) | NOT NULL, DEFAULT 'activo' | Alta/baja lógica del usuario |

#### `zonas_acceso`
| Campo | Tipo | Restricción | Descripción |
|---|---|---|---|
| id | SERIAL | PK | Identificador de la zona de acceso |
| nombre | VARCHAR(80) | NOT NULL | Nombre de la zona o punto de acceso |
| nivel_seguridad | VARCHAR(20) | NOT NULL | Nivel de seguridad de la zona (bajo, medio, alto) |

#### `personas` (Colaboradores / Visitantes)
| Campo | Tipo | Restricción | Descripción |
|---|---|---|---|
| id | SERIAL | PK | Identificador de la persona |
| nombre | VARCHAR(120) | NOT NULL | Nombre completo de la persona |
| dpi_codigo | VARCHAR(20) | UNIQUE, NOT NULL | Código Único de Identificación (DPI) |
| tipo | INTEGER | NOT NULL | Tipo: 1=colaborador, 2=visitante |
| estado | VARCHAR(20) | NOT NULL, DEFAULT 'activo' | Estado de la persona (activo/inactivo) |

#### `perfiles_acceso`
| Campo | Tipo | Restricción | Descripción |
|---|---|---|---|
| id | SERIAL | PK | Identificador del perfil de acceso |
| persona_id | INTEGER | FK → personas(id) | Persona asociada al perfil |
| zona_id | INTEGER | FK → zonas_acceso(id) | Zona autorizada para la persona |
| vigencia_inicio | DATE | NOT NULL | Fecha de inicio de vigencia del perfil |
| vigencia_fin | DATE | NOT NULL | Fecha de fin de vigencia del perfil |

#### `credenciales_qr`
| Campo | Tipo | Restricción | Descripción |
|---|---|---|---|
| id | SERIAL | PK | Identificador de la credencial QR |
| persona_id | INTEGER | FK → personas(id) | Persona propietaria de la credencial |
| token | CHAR(64) | UNIQUE, NOT NULL | Token cifrado de 64 caracteres hexadecimales (RNF-01) |
| estado | VARCHAR(20) | NOT NULL, DEFAULT 'activa' | Estado: activa, revocada, vencida |
| emitido | DATE | NOT NULL | Fecha de emisión de la credencial |
| reemitido_de | INTEGER | FK → credenciales_qr(id), NULLABLE | Referencia a la credencial anterior en caso de reemisión |

#### `registros_acceso`
| Campo | Tipo | Restricción | Descripción |
|---|---|---|---|
| id | SERIAL | PK | Identificador del registro de acceso |
| persona_id | INTEGER | FK → personas(id) | Persona que registra el movimiento |
| zona_id | INTEGER | FK → zonas_acceso(id) | Zona donde se registra el acceso |
| fecha | DATE | NOT NULL | Fecha del evento de acceso |
| hora | TIME | NOT NULL | Hora exacta del escaneo (timestamp) |
| tipo | VARCHAR(10) | CHECK IN ('ingreso','egreso') | Tipo de movimiento registrado |
| usuario_id | INTEGER | FK → usuarios(id) | Usuario (Personal de Seguridad) que realizó el escaneo |

#### `reportes`
| Campo | Tipo | Restricción | Descripción |
|---|---|---|---|
| id | SERIAL | PK | Identificador del reporte |
| periodo | VARCHAR(80) | NOT NULL | Período que cubre el reporte de auditoría |
| total_registros | INTEGER | NOT NULL | Cantidad total de registros incluidos en el reporte |
| generado | DATE | NOT NULL | Fecha de generación del reporte |
| usuario_id | INTEGER | FK → usuarios(id) | Usuario que generó el reporte |

#### `auditoria`
| Campo | Tipo | Restricción | Descripción |
|---|---|---|---|
| id | SERIAL | PK | Identificador del hallazgo de auditoría |
| tipo | VARCHAR(30) | NOT NULL | Categoría de inconsistencia detectada |
| descripcion | TEXT | NOT NULL | Descripción detallada del hallazgo |
| persona_id | INTEGER | FK → personas(id), NULLABLE | Persona relacionada al hallazgo (si aplica) |
| estado | VARCHAR(20) | NOT NULL | Estado del hallazgo (abierto, cerrado, en revisión) |
| fecha | DATE | NOT NULL | Fecha de detección del hallazgo |

#### `notificaciones`
| Campo | Tipo | Restricción | Descripción |
|---|---|---|---|
| id | SERIAL | PK | Identificador de la notificación |
| usuario_id | INTEGER | FK → usuarios(id), NULLABLE | Usuario destinatario (gerencia/auditoría) |
| persona_id | INTEGER | FK → personas(id), NULLABLE | Persona relacionada al evento |
| tipo | VARCHAR(30) | NOT NULL | Tipo de notificación (fuera_horario, suplantacion, concentracion, token_revocado) |
| mensaje | TEXT | NOT NULL | Mensaje descriptivo de la alerta |
| leida | BOOLEAN | NOT NULL, DEFAULT false | Estado de lectura |

### 7.3 Índices definidos (extraídos de `schema.sql`)

```sql
-- Índices para rendimiento de consultas frecuentes
CREATE INDEX idx_registros_persona_fecha ON registros_acceso(persona_id, fecha);
CREATE INDEX idx_registros_zona_fecha ON registros_acceso(zona_id, fecha);
CREATE INDEX idx_registros_tipo_fecha ON registros_acceso(tipo, fecha);
CREATE INDEX idx_credenciales_token ON credenciales_qr(token);
CREATE INDEX idx_credenciales_persona_estado ON credenciales_qr(persona_id, estado);
CREATE INDEX idx_perfiles_persona_vigencia ON perfiles_acceso(persona_id, vigencia_inicio, vigencia_fin);
CREATE INDEX idx_notificaciones_usuario_leida ON notificaciones(usuario_id, leida);
CREATE INDEX idx_auditoria_fecha ON auditoria(fecha);
-- Restricción única para prevenir doble ingreso mismo día
CREATE UNIQUE INDEX uq_ingreso_diario ON registros_acceso(persona_id, fecha, tipo) WHERE tipo = 'ingreso';
```

### 7.4 Integridad referencial

- **Cascada controlada:** `ON DELETE RESTRICT` en todas las FK hacia tablas maestras (`roles`, `zonas_acceso`, `personas`, `usuarios`).
- **Soft delete:** Tablas `usuarios`, `personas`, `credenciales_qr` usan campo `estado` (activo/inactivo/revocada) en lugar de eliminación física.
- **Validación a nivel BD:** `CHECK (tipo IN ('ingreso','egreso'))`, `UNIQUE (token)`, `UNIQUE (correo)`, `UNIQUE (dpi_codigo)`.
- **Trigger de integridad (opcional):** Validar que `persona_id` en `registros_acceso` tenga perfil vigente para `zona_id` en la fecha del acceso.

---

## 8. Interfaces externas

### 8.1 API REST — Backend C# / .NET Core

**Base URL:** `https://api.sciad.local/v1` (producción) / `https://localhost:5001/v1` (desarrollo)

**Autenticación:** Bearer Token (JWT HS256, 8h expiración, claims: `user_id`, `rol`, `exp`)

**Formato:** JSON (request/response), UTF-8, HTTPS/TLS 1.3 obligatorio.

**Estructura de endpoints (Tabla 10 Tesis):**

| Recurso | Operaciones | Módulo asociado |
|---|---|---|
| `/Autenticación` | Iniciar sesión, validar token, renovar token | Identificación y Acceso |
| `/Usuarios` | CRUD perfiles (GET, POST, PUT, PATCH estado) | Gestión y Auditoría |
| `/perfiles-acceso` | Gestión de zonas y horarios autorizados (CRUD) | Gestión de Perfiles y Zonas |
| `/credenciales` | Generación y reemisión de tokens QR (POST, PATCH reemitir) | Identificación y Acceso |
| `/accesos` | Registro (POST) y consulta (GET con filtros) de ingresos/egresos | Registro de Accesos |
| `/reportes` | Generación de reportes de auditoría (POST generar, GET descargar) | Portal de Trazabilidad |
| `/notificaciones` | Consulta (GET) y envío (POST interno) de alertas | Portal de Trazabilidad |
| `/auditoria` | Verificación de integridad de bitácoras (POST verificar, GET hallazgos) | Gestión y Auditoría |

**Códigos de estado HTTP estándar:**
- `200 OK` — Consulta/actualización exitosa
- `201 Created` — Recurso creado (credencial, registro, reporte)
- `400 Bad Request` — Validación fallida (token inválido, zona no autorizada, duplicado)
- `401 Unauthorized` — JWT inválido, expirado o ausente
- `403 Forbidden` — Rol sin permiso para la operación (RBAC)
- `404 Not Found` — Recurso no existe
- `409 Conflict` — Duplicado (ingreso ya registrado hoy, correo/DPI único)
- `500 Internal Server Error` — Error interno no controlado (loggeado)

**Ejemplo request registro acceso:**
```http
POST /v1/accesos
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "token": "a1b2c3d4e5f6... (64 hex chars)",
  "zona_id": 3,
  "timestamp": "2026-08-21T07:15:32-06:00"
}
```

**Ejemplo response éxito:**
```json
{
  "success": true,
  "data": {
    "persona": "Juan Pérez López",
    "tipo": "ingreso",
    "zona": "Entrada Principal",
    "hora": "07:15:32",
    "estado": "autorizado"
  }
}
```

**Ejemplo response error (token revocado):**
```json
{
  "success": false,
  "error": {
    "code": "CREDENTIAL_REVOKED",
    "message": "La credencial ha sido revocada. Contacte al administrador."
  }
}
```

### 8.2 API QR — Microservicio Python FastAPI (Generación de credenciales)

**Base URL:** `https://qr.sciad.local` (interno VPS) / `http://localhost:8000` (desarrollo)

**Endpoints:**
- `POST /generate` — Genera token SHA-256 único, retorna `{token, qr_png_base64, qr_svg}`
- `POST /reissue` — Recibe `credencial_id` anterior, marca `revocada`, genera nuevo token
- `GET /verify/{token}` — Valida existencia y estado del token (usado por Backend)

**Seguridad:** Comunicación interna VPS (localhost / red privada), API key compartida.

### 8.3 Interfaz de notificaciones (Push/Email)

- **Proveedor:** Firebase Cloud Messaging (FCM) para push a navegador / SMTP para email.
- **Eventos:** `fuera_horario`, `suplantacion_intento`, `concentracion_zona`, `token_revocado_usado`.
- **Formato payload FCM:** `{ "notification": { "title": "Alerta SCIAD", "body": "..." }, "data": { "tipo": "...", "persona_id": "..." } }`

---

## 9. Plan de pruebas

### 9.1 Estrategia general

- **Pirámide de pruebas:** Unitarias (70%) → Integración (20%) → E2E (10%).
- **Cobertura objetivo:** ≥ 80% líneas críticas (Backend C#, Servicios dominio).
- **Herramientas:** xUnit (C#), Jest + Testing Library (Angular), k6 (carga), Postman/Newman (API), OWASP ZAP (seguridad).
- **Entornos:** Desarrollo (local) → Staging (VPS idéntico a prod) → Producción.

### 9.2 Pruebas de humo (Smoke Tests)

| ID | Endpoint / Flujo | Criterio de paso |
|---|---|---|
| ST-01 | `POST /Autenticación` | Login válido → 200 + JWT |
| ST-02 | `GET /Usuarios` (auth Admin) | 200 + lista paginada |
| ST-03 | `POST /credenciales` (generar) | 201 + token 64 hex + QR base64 |
| ST-04 | `POST /accesos` (escaneo válido) | 201 + registro en BD |
| ST-05 | `GET /accesos?fecha=hoy` | 200 + datos coherentes |
| ST-06 | `GET /reportes` (generar CSV) | 200 + archivo descargable |

### 9.3 Pruebas de seguridad (Security Tests)

| ID | Prueba | Herramienta | Criterio |
|---|---|---|---|
| SEC-01 | Escaneo OWASP Top 10 | OWASP ZAP | 0 vulnerabilidades críticas/altas |
| SEC-02 | Prueba inyección SQL | Manual + sqlmap | 0 vectores exitosos (parametrizado EF Core) |
| SEC-03 | Prueba XSS en inputs | Manual | Sanitización Angular + CSP |
| SEC-04 | Fuerza bruta login | Manual | Rate limit 5 intentos/min → 429 |
| SEC-05 | Bypass RBAC | Manual | 403 en endpoints sin rol |
| SEC-06 | Token QR predecible | Análisis entropía | 256 bits entropía (SHA-256) |
| SEC-07 | Intercepción tráfico | Wireshark | Solo TLS 1.3, sin plaintext |
| SEC-08 | Contraseñas en BD | Inspección | Solo bcrypt hash, nunca plaintext |

### 9.4 Pruebas del piloto en campo (Septiembre 2026)

| Métrica | Objetivo | Instrumento |
|---|---|---|
| Tiempo promedio procesamiento ingreso | < 2 seg (RNF-03) | Guía Cronometraje (Tesis) |
| Tasa intentos suplantación | < método tradicional | Guía Auditoría Bitácoras (Tesis) |
| Tiempo generación reporte | < consolidación manual | Guía Generación Reportes (Tesis) |
| Percepción seguridad (Likert 1-5) | ≥ 4.0 promedio | Cuestionario Percepción (Tesis) |
| Disponibilidad sistema (Uptime) | ≥ 99.9% | Prometheus/Grafana |
| Integridad registros | 0 inconsistencias | Auditoría automática (CU-08) |
| Adopción sistema | ≥ 90% colaboradores activos | Registro uso credenciales QR |

---

## 10. Gestión de riesgos

| ID | Riesgo | Probabilidad | Impacto | Mitigación | Responsable |
|---|---|---|---|---|---|
| RSK-01 | Falta de conectividad en punto de acceso | Media | Alto | Cola local en cliente (IndexedDB) + sincronización automática al recuperar red | DevOps |
| RSK-02 | Resistencia al cambio (personal seguridad) | Alta | Media | Capacitación 2h (RNF-08), interfaz 3 pasos, retroalimentación visual inmediata | PM / Usuario |
| RSK-03 | Colisión token QR (probabilidad teórica) | Muy baja | Alto | SHA-256 256 bits + verificación unicidad BD + reintento automático | Backend |
| RSK-04 | Pérdida/robo dispositivo BYOD | Media | Medio | JWT en memoria (no storage), expiración 8h, revocación remota sesión | Seguridad |
| RSK-05 | Carga pico > 500 concurrentes | Baja | Alto | Escalado vertical VPS (Contabo permite upgrade), rate limiting graceful | DevOps |
| RSK-06 | Incumplimiento normativo (Decreto 57-2008) | Baja | Muy alto | Privacy by Design, minimización datos, consentimiento, logs auditoría | Legal / Dev |
| RSK-07 | Falla disco / corrupción BD | Baja | Crítico | Backups diarios automáticos (pg_dump), replicación WAL, prueba restauración mensual | DevOps |
| RSK-08 | Vulnerabilidad cero-day dependencias | Media | Alto | Dependabot/Snyk scanning semanal, actualizaciones de seguridad en 48h | Dev |

---

## 11. Restricciones técnicas del sistema

| Restricción | Detalle |
|---|---|
| **Lenguaje Backend** | C# 12 / .NET 8 (LTS) |
| **Framework Frontend** | Angular 17+ / TypeScript 5+ (Standalone Components, Signals) |
| **Base de datos** | PostgreSQL 16 (ACID, JSONB, advisory locks) |
| **ORM** | Entity Framework Core 8 (Code First, Migraciones) |
| **API QR** | Python 3.11+ / FastAPI / qrcode[pil] / hashlib |
| **Infraestructura** | VPS Contabo (4 vCPU, 8 GB RAM, 200 GB SSD, Ubuntu 22.04 LTS) |
| **Contenedores** | Docker + Docker Compose (backend, db, qr-api, nginx reverse proxy) |
| **CI/CD** | GitHub Actions → Build → Test → Deploy VPS (SSH + docker compose) |
| **Observabilidad** | Serilog (logs estructurados JSON) → Loki/Grafana; Prometheus metrics `/metrics` |
| **Autenticación** | JWT HS256, issuer `sciad`, audience `sciad`, expiry 8h sliding |
| **Contraseñas** | BCrypt.Net-Next, work factor 10 |
| **CORS** | Solo origen frontend permitido (`https://app.sciad.local`) |
| **Rate Limiting** | 100 req/min/IP global; 10 req/min/login; 500 req/min/accesos (bursts) |
| **Tamaño request** | Máx. 1 MB (JSON), 5 MB (multipart QR image upload) |

---

## 12. Cronograma de actividades

Basado en la Tabla 4 de la Tesis (Capítulo I) — 7 meses, 300 horas totales.

| Fase | Mes | Actividades Principales | Horas Est. |
|---|---|---|---|
| **I. Levantamiento de Requerimientos** | Abril | Entrevistas con directivos, definición de procesos de control de acceso, diagramación de casos de uso. | 40 hrs |
| **II. Diseño y Arquitectura** | Mayo | Diseño BD PostgreSQL, configuración entorno C#/.NET, diseño interfaces Angular, definición API. | 40 hrs |
| **III. Desarrollo Módulos (Iteración 1)** | Junio | Módulo Identificación y Acceso: autenticación (JWT), generación credenciales QR (Python API), tokens SHA-256. | 45 hrs |
| **IV. Desarrollo Módulos (Iteración 2)** | Julio | Módulo Registro de Accesos: escaneo QR BYOD, validación token/perfil/zona, registro ACID, reporte día. | 45 hrs |
| **V. Desarrollo Módulos (Iteración 3)** | Agosto | Portal Trazabilidad: historial, reportes auditoría CSV/PDF, notificaciones automáticas, auditoría bitácoras. | 45 hrs |
| **VI. Pruebas Piloto y Ajustes** | Septiembre | Implementación prueba de campo, auditoría integridad datos, corrección bugs, métricas tesis. | 45 hrs |
| **VII. Entrega Final y Documentación** | Octubre | Manuales técnico/usuario, capacitación personal, defensa final proyecto de graduación. | 40 hrs |
| **TOTAL** | | | **300 hrs** |



---

## 13. Matriz de trazabilidad

| Req. | Descripción | CU | RF | RNF | CA | Componente | Prueba |
|---|---|---|---|---|---|---|---|
| TR-01 | Gestión usuarios + RBAC | CU-01 | RF-01 | RNF-10 | CA-01, CA-10 | Backend: `UsuariosService`, `AuthController` | xUnit + E2E |
| TR-02 | Perfiles acceso (zona, horario, vigencia) | CU-02 | RF-02 | RNF-06 | CA-02 | Backend: `PerfilesAccesoService` | xUnit |
| TR-03 | Credenciales QR (token SHA-256, reemisión) | CU-03 | RF-03 | RNF-01 | CA-03, CA-11 | QR API (Python) + Backend | xUnit + E2E |
| TR-04 | Registro ingreso/egreso escaneo QR | CU-04 | RF-04 | RNF-01,03,04,06 | CA-04, CA-11,12,13 | Backend: `AccesosController`, `AccesoService` | k6 + E2E |
| TR-05 | Reporte accesos día (tiempo real) | CU-05 | RF-05 | RNF-03 | CA-05 | Backend: `AccesosController` GET | E2E |
| TR-06 | Historial accesos (filtros, ≤5s) | CU-06 | RF-06 | RNF-03 | CA-06 | Backend: `AccesosController` GET filtros | k6 |
| TR-07 | Reportes auditoría CSV/PDF | CU-07 | RF-07 | RNF-07 | CA-07 | Backend: `ReportesService`, `ReportesController` | E2E |
| TR-08 | Auditoría integridad bitácoras | CU-08 | RF-08 | RNF-06 | CA-08 | Backend: `AuditoriaService`, Job programado | xUnit |
| TR-09 | Notificaciones automáticas anómalos | CU-09 | RF-09 | RNF-02 | CA-09 | Backend: `NotificacionesService` (trigger post INSERT) | E2E |
| TR-10 | Autenticación JWT + RBAC | CU-10 | RF-10 | RNF-01,10 | CA-10,11,20 | Backend: `AuthController`, `JwtMiddleware`, `RbacAttribute` | xUnit + Security |

---

## 14. Control de versiones

| Versión | Fecha | Autor | Descripción de cambios |
|---|---|---|---|
| 1.0 | Agosto 2026 | José Leonel Salazar Tejeda | Versión inicial alineada con tesis PG2_V1 (SCIAD). Migración completa desde SCIA académico a SCIAD control de acceso. |
| | | | **Cambios mayores vs versión anterior (SCIA):**<br>• Sistema: Académico (SCIA) → Control Acceso Físico (SCIAD)<br>• Actores: Docentes/Padres/Estudiantes → Admin/Seguridad/Gerencia<br>• Dominio: Calificaciones/Asistencia/SIRE → QR/Accesos/Trazabilidad/Auditoría<br>• BD: 15+ tablas académicas → 10 tablas acceso/identidad<br>• API: Endpoints académicos → 8 recursos REST acceso<br>• Seguridad: JWT + bcrypt (mantenido), agregado SHA-256 QR tokens<br>• Infraestructura: Mismo stack (Angular/.NET/PostgreSQL/VPS) |
| | | | **Diagramas actualizados:**<br>• Casos de uso (10 CU vs 12 CU anterior)<br>• Arquitectura 3 capas (mismo patrón, actores distintos)<br>• Modelo conceptual / ER (entidades acceso vs académicas)<br>• Proceso principal (ingreso QR vs calificaciones)<br>• Secuencia (escaneo QR vs registro notas)<br>• Despliegue (mismo VPS, componentes actualizados) |

---

## Apéndice A: Diagramas del sistema (carpeta `diagramas/`)

| Archivo | Descripción | Sección DERCAS |
|---|---|---|
| `01_Diagrama_Casos_de_Uso.puml` / `.png` | Diagrama de casos de uso UML (10 CU, 4 actores) | §4 |
| `02_Arquitectura_del_Sistema.puml` / `.png` | Arquitectura 3 capas + Cloud (Frontend, API, Backend, DB, Notificaciones) | §2.1 |
| `03_Modelo_Conceptual.puml` / `.png` | Modelo conceptual entidad-relación (vista lógica) | §7.1 |
| `04_Modelo_Entidad_Relacion.puml` / `.png` | Modelo Entidad-Relación físico (tablas, PK/FK, tipos) | §7.1 |
| `05_Diseno_Proceso_Principal.puml` / `.png` | Diagrama de actividad: proceso ingreso QR (CU-04) | §4 (CU-04) |
| `06_Diagrama_Secuencia.puml` / `.png` | Diagrama de secuencia: flujo registro acceso (CU-04) | §4 (CU-04), §8.1 |
| `07_Diagrama_Despliegue.puml` / `.png` | Diagrama de despliegue UML (nodos, artefactos, VPS, BD) | §2.1 |

[enlace para repositorio](https://github.com/josesalazart3/SCIA)