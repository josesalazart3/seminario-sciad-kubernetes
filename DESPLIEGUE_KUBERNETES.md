# SCIAD — Despliegue en Kubernetes (k3s)

SCIAD se despliega en un clúster **k3s** de 3 nodos (1 *control-plane* + 2 *workers*) en Google Cloud, dentro del namespace `jsalazart3`, y se publica en:

**https://jsalazart3-sciad.duckdns.org**

## Arquitectura

```
Internet ──HTTPS──► Traefik (Ingress) ── certificado Let's Encrypt (cert-manager)
                        │
                        ▼
              Service frontend :80 ──► Deployment frontend (2 réplicas, nginx + Angular)
                                             │  /api/
                                             ▼
              Service backend :8080 ──► Deployment backend (2 réplicas, .NET 8)
                                             │
                                             ▼
              Service db :5432 ──► StatefulSet db (PostgreSQL 16 + volumen persistente 2 GiB)
```

| Archivo | Contenido |
|---|---|
| `k8s/00-configmap-nginx.yaml` | ConfigMap con la configuración de nginx (CSP con nonce, HSTS, cabeceras OWASP, proxy `/api`) |
| `k8s/01-secret.example.yaml` | Plantilla de los secretos (sin valores reales) |
| `k8s/02-db.yaml` | Service *headless* + StatefulSet de PostgreSQL con volumen persistente |
| `k8s/03-backend.yaml` | Service + Deployment (2 réplicas) + PodDisruptionBudget del API |
| `k8s/04-frontend.yaml` | Service + Deployment (2 réplicas) + PodDisruptionBudget del frontend |
| `k8s/05-ingress.yaml` | Ingress con TLS automático |
| `k8s/06-networkpolicy.yaml` | Aislamiento de red entre capas |
| `k8s/kustomization.yaml` | Aplica todo con `kubectl apply -k k8s/` |
| `k8s/scripts/` | Subir imágenes, crear secretos y migrar datos |

## Resiliencia y buenas prácticas

| Práctica | Implementación |
|---|---|
| Alta disponibilidad | 2 réplicas de frontend y backend, repartidas entre nodos (`topologySpreadConstraints`) |
| Actualizaciones sin caída | `RollingUpdate` con `maxUnavailable: 0`; *rollback* con `kubectl rollout undo` |
| Autorreparación | `startupProbe`, `readinessProbe` (`/api/health`, verifica la BD) y `livenessProbe` |
| Disponibilidad mínima | `PodDisruptionBudget` con `minAvailable: 1` |
| Persistencia | PostgreSQL en StatefulSet con `PersistentVolumeClaim` |
| Configuración externa | nginx en ConfigMap; credenciales en Secret (nunca en el repositorio ni en la imagen) |
| Contenedores endurecidos | Sistema de archivos de solo lectura, sin escalada de privilegios, backend sin root y sin capacidades, `seccomp RuntimeDefault` |
| Límites de recursos | `requests`/`limits` en todos los contenedores, dentro de la cuota del namespace |
| Mínimo privilegio | Acceso por kubeconfig con RBAC limitado al namespace; pods sin token de la API |
| Red | NetworkPolicy: frontend ← Traefik, backend ← frontend, db ← backend |

### Recursos asignados

| Componente | Réplicas | Memoria (request / limit) | CPU (request / limit) |
|---|---|---|---|
| frontend | 2 | 32 Mi / 128 Mi | 20m / 100m |
| backend | 2 | 192 Mi / 512 Mi | 60m / 400m |
| db | 1 | 128 Mi / 512 Mi | 50m / 300m |
| **Total** | **5 pods** | **576 Mi / 1.75 Gi** | **210m / 1.3** |

## Requisitos

- `kubectl` configurado con el acceso al namespace `jsalazart3` (`~/.kube/config`).
- Imágenes construidas del frontend y backend (`docker compose ... build`).
- Archivo `.env.prod` con los secretos (no versionado).
- Dominio `jsalazart3-sciad.duckdns.org` apuntando a la IP pública del clúster.
- Dos tokens de GitHub: uno con `write:packages` (subir imágenes) y otro con `read:packages` (descarga desde el clúster).

## Pasos de despliegue

Desde la raíz del repositorio:

```bash
# 1. Publicar las imágenes en el registro privado (GHCR)
./k8s/scripts/subir-imagenes.sh 1.0.0

# 2. Crear los Secrets (credenciales + acceso al registro)
./k8s/scripts/crear-secretos.sh .env.prod

# 3. Configuración y base de datos
kubectl apply -f k8s/00-configmap-nginx.yaml -f k8s/02-db.yaml

# 4. Migrar los datos existentes a la base de datos del clúster
./k8s/scripts/migrar-datos.sh sciad-tesis-db

# 5. Backend, frontend e Ingress
kubectl apply -k k8s/
kubectl rollout status deployment/backend
kubectl rollout status deployment/frontend

# 6. Aislamiento de red (cuando todo responda correctamente)
kubectl apply -f k8s/06-networkpolicy.yaml
```

## Verificación

```bash
kubectl get pods -o wide              # 5 pods en Running, repartidos entre nodos
kubectl get svc,ingress,pvc           # servicios, dominio y volumen
kubectl get certificate               # sciad-tls READY True
curl -s https://jsalazart3-sciad.duckdns.org/api/health
```

## Pruebas de resiliencia

```bash
# Autorreparación: se elimina un pod y Kubernetes crea otro; la app no se cae
kubectl delete pod -l app.kubernetes.io/name=sciad-backend --wait=false
kubectl get pods -w

# Escalado
kubectl scale deployment/backend --replicas=3
kubectl scale deployment/backend --replicas=2

# Actualización sin caída y vuelta atrás
kubectl set image deployment/frontend nginx=ghcr.io/josesalazart3/sciad-frontend:1.0.1
kubectl rollout status deployment/frontend
kubectl rollout undo deployment/frontend
```

## Limitación conocida

Las IPs de los pods cambian en Kubernetes, por lo que el backend no tiene una IP fija de proxy de confianza (`ForwardedHeaders__KnownProxies`) y ve todas las peticiones con la IP del proxy interno. El límite de intentos de login por IP (SEC-04) se comparte entre todos los clientes; por eso se amplió a 30 intentos cada 5 minutos. La solución definitiva es confiar en el rango de red de los pods (`KnownNetworks`) y conservar la IP del cliente en el Ingress (`externalTrafficPolicy: Local`).
