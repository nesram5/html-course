# Runbook de Plaza

Procedimientos de operación del MVP. Cada sección indica la historia que la originó.

- Medios: [LiveKit + TURN](#servidor-de-medios-livekit--turn--e5-s7-e5-s8) (despliegue,
  alertas, actualizaciones, contingencia, TURN)
- App: [arquitectura](#app-arquitectura-de-producción--e8-s5) ·
  [desplegar](#desplegar--e8-s5) · [revertir](#revertir--e8-s5) ·
  [copias y restauración](#copias-y-restauración-de-la-base-de-datos--e8-s5) ·
  [rotar claves](#rotar-claves--e8-s5) · [monitorización](#monitorización-de-la-app--e8-s1) ·
  [contingencias](#contingencias--e8-s5)
- Seguridad: [security-review.md](./security-review.md) · Carga: [load-test.md](./load-test.md)

---

## Servidor de medios (LiveKit + TURN) — E5-S7, E5-S8

El audio y el vídeo de la charla de pasillo pasan por un LiveKit propio en una VM dedicada
(arquitectura §11.5, ADR-003). La configuración está versionada en
[`infra/livekit/`](../infra/livekit/) **sin secretos**: las claves y los dominios se inyectan por
variables de entorno (`.env`, que nunca se sube al repositorio).

| Pieza                                                                       | Qué hace                                                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`livekit.yaml`](../infra/livekit/livekit.yaml)                             | LiveKit: señalización en `:7880`, ICE/TCP en `7881`, UDP `50000–60000`, TURN/UDP en UDP `443` |
| [`caddy.yaml.tmpl`](../infra/livekit/caddy.yaml.tmpl)                       | Caddy (módulo layer4) en TCP `443`: certificados Let's Encrypt y enrutado por SNI             |
| [`docker-compose.yml`](../infra/livekit/docker-compose.yml)                 | Ambos servicios con `network_mode: host` y `restart: unless-stopped`; versiones fijadas       |
| [`render-config.sh`](../infra/livekit/render-config.sh)                     | Genera `caddy.yaml` con los dominios de `.env` y valida las claves                            |
| [`firewall.sh`](../infra/livekit/firewall.sh)                               | Reglas `ufw`: solo los puertos de medios y SSH desde la IP del equipo                         |
| [`turn-test/run-turn-test.sh`](../infra/livekit/turn-test/run-turn-test.sh) | Prueba local de TURN/TLS con UDP bloqueado (ver más abajo)                                    |

### Dimensionado y proveedor

Carga de la beta: ~50 personas por espacio, hasta ~150 conectadas, conversaciones de 2 a 8
(como máximo 8 _peers_, RN-07). Cada persona publica micro y cámara con _simulcast_ (180p y 360p
sobre 540p) y solo recibe a sus _peers_; _dynacast_ deja de enviar las capas que nadie mira.

| Recurso | Especificación                                                          |
| ------- | ----------------------------------------------------------------------- |
| Máquina | VM optimizada para cómputo, **4 vCPU**, 8 GB RAM, dedicada a LiveKit    |
| Red     | IP pública, puerto ≥ 1 Gbps, **tráfico incluido ≥ 2 TB/mes**            |
| Disco   | 20 GB (sistema, imágenes Docker y certificados; LiveKit no graba nada)  |
| SO      | Ubuntu 24.04 LTS con Docker Engine y el _plugin_ `compose`              |
| Coste   | ~20–40 US$/mes según proveedor (frente a ~240 US$/mes en LiveKit Cloud) |

**Decisión de proveedor (rellenar al contratar):** proveedor ·
tipo de máquina · región (la más cercana a los pilotos) · tráfico incluido · coste mensual real ·
fecha. Elegir uno que incluya el tráfico: en nubes que cobran la salida, el vídeo cuesta más que la
máquina.

### Puertos

| Puerto      | Protocolo | Uso                                                                  |
| ----------- | --------- | -------------------------------------------------------------------- |
| 443         | TCP       | Caddy: `livekit.<dominio>` (WebSocket) y `turn.<dominio>` (TURN/TLS) |
| 7881        | TCP       | ICE sobre TCP (cuando UDP no pasa)                                   |
| 443         | UDP       | TURN/UDP                                                             |
| 50000–60000 | UDP       | Medios WebRTC                                                        |
| 22          | TCP       | SSH, solo desde `ADMIN_CIDR`                                         |

Todo lo demás, cerrado (incluidos `7880`, que solo se usa a través de Caddy, y `6789`, las
métricas Prometheus para un agente local). Replicar estas reglas en el _firewall_ del proveedor.

### Despliegue inicial

1. DNS: registros `A` de `livekit.<dominio>` y `turn.<dominio>` a la IP pública de la VM.
2. En la VM: instalar Docker, copiar `infra/livekit/` (por ejemplo, `git clone` con
   `--sparse` de esa carpeta) y activar Docker al arranque (`systemctl enable docker`).
3. Claves: `docker run --rm livekit/livekit-server:v1.9.12 generate-keys`; guardar el par en el
   gestor de secretos del equipo. `cp .env.example .env` y rellenar claves y dominios.
4. `./render-config.sh` y `ADMIN_CIDR=<ip del equipo>/32 sudo ./firewall.sh`.
5. `docker compose up -d`. Caddy obtiene los certificados por TLS-ALPN en el 443; si el
   proveedor lo impide, abrir temporalmente TCP 80 para el reto HTTP y volver a cerrarlo.
6. Fijar la imagen de Caddy por _digest_:
   `docker inspect --format '{{index .RepoDigests 0}}' livekit/caddyl4` → `CADDY_L4_IMAGE` en `.env`.
7. Comprobar: `curl https://livekit.<dominio>/` responde `OK`; `openssl s_client -connect
turn.<dominio>:443 -servername turn.<dominio>` muestra un certificado válido.
8. Servidor de la app (_staging_): `LIVEKIT_URL=wss://livekit.<dominio>`, `LIVEKIT_API_KEY`,
   `LIVEKIT_API_SECRET` (mismo par) y reiniciar. **Sin cambios de código.**
9. Verificar con el E2E de la charla de pasillo contra _staging_
   (`e2e/tests/hallway.spec.ts`: dos personas se acercan y se ven, se alejan y el vídeo se va).

### Reinicio de la VM

Docker arranca con el sistema y los dos servicios tienen `restart: unless-stopped`, así que
LiveKit vuelve solo. Los clientes reconectan sin intervención: LiveKit reanuda los cortes cortos y,
si la conexión se perdió del todo, el `MediaController` del navegador reintenta con un _token_
nuevo (1 s, 2 s, 5 s, 10 s y luego cada 30 s) y vuelve a aplicar la última lista de _peers_.
Comprobación tras un reinicio: `docker compose ps` (ambos `running`, LiveKit `healthy`).

### Monitorización y alertas

- **Disponibilidad:** monitor externo (UptimeRobot, Better Stack o el del proveedor) cada minuto
  sobre `https://livekit.<dominio>/` (espera `200 OK`) y un chequeo TCP a `turn.<dominio>:443`.
  Alerta al canal del equipo tras 2 fallos seguidos.
- **CPU > 70 % durante 5 min:** alerta del proveedor o `node_exporter` + reglas de Prometheus.
  Con CPU alta de forma sostenida, subir a 8 vCPU (LiveKit escala casi lineal con los núcleos).
- **Tráfico mensual > 80 % del incluido:** alerta de facturación del proveedor.
- **Salud de la charla:** `GET /api/health` del servidor de la app expone `avgMediaPeersPerTick`
  (mensajes `media:peers` por _tick_); en Sentry, la transacción `media.peers_to_first_frame`
  mide el tiempo desde `media:peers` hasta el primer _frame_ (objetivo p95 < 1,5 s).
- Métricas de LiveKit (Prometheus) en `127.0.0.1:6789` para un agente local, nunca abiertas.

### Actualizaciones

Las versiones están fijadas (`livekit/livekit-server:v1.9.12` y Caddy por _digest_). Para
actualizar: leer el _changelog_ de LiveKit, cambiar la etiqueta en `docker-compose.yml` en un PR,
desplegar fuera del horario de los pilotos (`docker compose pull && docker compose up -d`) y
comprobar como en el despliegue inicial. Marcha atrás: volver a la etiqueta anterior y repetir.
Anotar cada actualización (fecha, versión, incidencias) al final de esta sección.

### Contingencia: la VM de medios cae

Solo se pierde el audio y el vídeo del pasillo; el mapa, el chat y las salas de Meet siguen.

1. Si no vuelve en 10 min: crear (o reactivar) el proyecto de LiveKit Cloud en plan de pago.
2. En el servidor de la app: `LIVEKIT_URL=wss://<proyecto>.livekit.cloud`, `LIVEKIT_API_KEY` y
   `LIVEKIT_API_SECRET` del proyecto; reiniciar el servidor.
3. Los navegadores abiertos reintentan con un _token_ nuevo, que ya trae la URL nueva: se
   conectan a LiveKit Cloud sin recargar.
4. Al recuperar la VM, repetir el paso 2 con sus valores.

### Seguridad de los medios

- Los _tokens_ de LiveKit duran **10 min** (`MEDIA_TOKEN_TTL_SECONDS`) y el navegador pide uno
  nuevo 2 min antes de que caduque y tras cada reconexión del tiempo real. Al expulsar a alguien
  del espacio se le saca de la sala de LiveKit (`removeParticipant`) y el _endpoint_ de _tokens_
  le responde `404`, así que no puede volver con el que tenía más allá de esos 10 min.
- Rotar las claves: generar un par nuevo, ponerlo en `.env` de la VM y en el servidor de la app y
  reiniciar ambos (los clientes reconectan solos).

### TURN y redes corporativas (E5-S8)

LiveKit anuncia a los clientes `turns:turn.<dominio>:443?transport=tcp`: en una red que solo deja
salir TCP 443, los medios van por TURN sobre TLS (Caddy termina el TLS con un certificado válido y
pasa el flujo a LiveKit en `:5349`).

**Prueba local** (`infra/livekit/turn-test/run-turn-test.sh`, requiere Docker y el Chromium de
Playwright): arranca un segundo LiveKit con TURN/TLS en el 443 local, sin ICE/TCP, y dos Chromium
con UDP bloqueado (`--force-webrtc-ip-handling-policy=disable_non_proxied_udp`) e ICE limitado a
_relays_. Pasa si el vídeo llega y el par ICE elegido es `relay` sobre `tls`.

| Fecha      | Entorno        | Resultado                                                                         |
| ---------- | -------------- | --------------------------------------------------------------------------------- |
| 2026-09-27 | Local (Docker) | OK: vídeo 320 px recibido; candidato `relay`, `relayProtocol: tls`, `turns:…:443` |

Límites de la prueba local: el TLS lo termina LiveKit con un certificado autofirmado (aceptado con
`--ignore-certificate-errors`), no Caddy con Let's Encrypt, y el bloqueo de UDP lo hace el
navegador, no un cortafuegos. La cadena completa (Caddy + certificado real + red corporativa) se
valida en _staging_ y con la red de cada piloto.

**Prueba con la red de un piloto (antes de invitarlos):** con su área de TI y la
[guía de requisitos de red](./network-requirements.md), dos personas del piloto entran a un
espacio de _staging_ desde su red, se acercan y comprueban que se ven y se oyen; en
`chrome://webrtc-internals` se anota el tipo de candidato elegido (`host`/`srflx` por UDP, `tcp`
o `relay`). Registrar cada prueba aquí:

| Fecha | Piloto | Red (oficina/VPN) | Candidato | Resultado |
| ----- | ------ | ----------------- | --------- | --------- |
|       |        |                   |           |           |

---

## App: arquitectura de producción — E8-S5

Dos VMs por entorno (_staging_ y beta, con **secretos distintos**; arquitectura §11.4):

| VM     | Qué corre                                                                                                                                    | Configuración                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| App    | `web` (Caddy: HTTPS, SPA y _proxy_ de `/api`, `/realtime`, `/assets/maps`), `server`, `migrate` y, con el perfil `db`, `postgres` + `backup` | [`infra/app/`](../infra/app/) (compose + `.env`) |
| Medios | LiveKit + TURN                                                                                                                               | [`infra/livekit/`](../infra/livekit/) (arriba)   |

Imágenes (GHCR, construidas por [`plaza-deploy.yml`](../../.github/workflows/plaza-deploy.yml)):

| Imagen                         | Dockerfile                                            | Contenido                                                                                            |
| ------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ghcr.io/<owner>/plaza-server` | [`apps/server/Dockerfile`](../apps/server/Dockerfile) | `node dist/main.js` como usuario `node`, dependencias de producción, Prisma CLI para las migraciones |
| `ghcr.io/<owner>/plaza-web`    | [`apps/web/Dockerfile`](../apps/web/Dockerfile)       | Caddy + el _build_ de Vite (`VITE_APP_VERSION`, `VITE_SENTRY_DSN` fijados al construir)              |

Etiquetas: `sha-<commit>` y `main` (cada _merge_ con CI verde), `v0.x.y` y `beta` (cada etiqueta).

### Preparar una VM de app (una vez por entorno)

1. VM de 2 vCPU / 4 GB (la carga de 50 personas usa < 10 % de un núcleo, ver
   [load-test.md](./load-test.md)), Ubuntu 24.04, Docker Engine + _plugin_ `compose`,
   `systemctl enable docker`. Abrir **TCP 80 y 443 y UDP 443**; SSH solo desde la IP del equipo.
2. DNS: registro `A` de `plaza.<dominio>` (o `staging.plaza.<dominio>`) a la IP de la VM.
3. Usuario de despliegue en el grupo `docker`, con la clave pública del _workflow_ en
   `~/.ssh/authorized_keys`. Carpeta `/opt/plaza` suya.
4. `/opt/plaza/.env` a partir de
   [`infra/app/.env.production.example`](../infra/app/.env.production.example), `chmod 600`.
   Secretos nuevos para cada entorno: `SESSION_SECRET`, `HEALTH_TOKEN`, `POSTGRES_PASSWORD`,
   cliente OAuth de Google del proyecto de producción, claves de la VM de medios de ese entorno.
   `COMPOSE_PROFILES=db` en el `.env` para usar el Postgres incluido (o `DATABASE_URL` de uno
   gestionado, sin perfil).
5. GitHub → Settings → Environments: `staging` (sin revisores) y `beta` (**revisores
   obligatorios** = aprobación manual). Secretos de cada uno, solo por nombre en el _workflow_:
   `APP_SSH_HOST`, `APP_SSH_USER`, `APP_SSH_KEY`, `APP_SSH_KNOWN_HOSTS`
   (`ssh-keyscan <host>`), `APP_DIR` (opcional, `/opt/plaza`). Variable de repositorio
   `VITE_SENTRY_DSN` (pública: va en el JavaScript).
6. Google Cloud (proyecto de producción): pantalla de consentimiento en modo _Testing_ con los
   usuarios piloto (o _Internal_ si todos son de un Workspace); URIs de redirección
   `https://<dominio>/api/auth/google/callback` y `https://<dominio>/api/auth/google/meet/callback`.
7. Primer despliegue: ejecutar el _workflow_ a mano (_Run workflow_) con la etiqueta a desplegar.

## Desplegar — E8-S5

| Entorno   | Cuándo                                                                         | Cómo                                                                                                 |
| --------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| _staging_ | Cada _merge_ en `main` cuyo CI («Plaza CI») pasa                               | Automático: _build_ → GHCR (`sha-<commit>`) → `deploy.sh` en la VM de _staging_                      |
| beta      | Al publicar una etiqueta `v0.x.y` (`git tag v0.3.0 && git push origin v0.3.0`) | _Build_ → GHCR (`v0.3.0`) → el _job_ espera la **aprobación** del _environment_ `beta` → `deploy.sh` |

Qué hace [`infra/app/deploy.sh`](../infra/app/deploy.sh) en la VM (el _workflow_ lo copia junto
al `docker-compose.yml` de esa versión):

1. `docker compose pull` de las imágenes nuevas.
2. `docker compose up -d --wait`: **`migrate`** aplica las migraciones pendientes
   (`prisma migrate deploy`); solo si termina bien se recrean `server` y `web`, y se espera a que
   el _healthcheck_ del servidor pase.
3. Anota las imágenes en `.env` y en `deployed-versions.log` (para revertir).

**Reinicio sin cortes largos:** al parar el contenedor, el servidor recibe `SIGTERM`, cierra las
conexiones de tiempo real **sin terminar las sesiones de Socket.IO** y sale con código 0 en menos
de 8 s (`stop_grace_period: 15s`). Los navegadores muestran «Reconectando…» y vuelven solos al
servidor nuevo (E4-S6; test `shutdown.int.test.ts`). Caddy reintenta las peticiones a la API
hasta 10 s mientras el servidor arranca. Las posiciones no se guardan: tras un despliegue cada
persona reaparece en su escritorio o en un punto de aparición.

**Migraciones compatibles hacia atrás:** como no hay migraciones «down», cada migración debe
funcionar con la versión anterior de la app (añadir columnas opcionales o tablas; borrar o
renombrar en dos versiones: primero dejar de usarlo, después quitarlo). Si una migración no
cumple esto, hacer una copia manual justo antes (ver [Copias](#copias-y-restauración-de-la-base-de-datos--e8-s5)).

**Comprobar tras desplegar:**

```bash
curl -s https://<dominio>/api/health                      # {"status":"ok","version":"<la nueva>"}
curl -s -H "X-Health-Token: $HEALTH_TOKEN" https://<dominio>/api/health   # figuras de tiempo real
docker compose ps                                          # server healthy, migrate Exited (0)
docker compose logs --since 10m server | grep -i error
```

y entrar a un espacio con dos personas (se ven, se oyen, el chat funciona).

## Revertir — E8-S5

1. Ver la versión anterior en `/opt/plaza/deployed-versions.log` (o en GHCR).
2. GitHub → Actions → «Plaza deploy» → _Run workflow_: entorno y etiqueta anterior
   (`v0.2.1`, `sha-abc1234`). En beta pide la aprobación.
   Sin GitHub: en la VM, `./deploy.sh ghcr.io/<owner>/plaza-server:v0.2.1 ghcr.io/<owner>/plaza-web:v0.2.1`
   (tras `docker login ghcr.io` con un _token_ de solo lectura).
3. Si la versión revertida incluía una migración **no** compatible hacia atrás: restaurar la
   copia de antes del despliegue (siguiente sección) y después revertir la imagen.

## Copias y restauración de la base de datos — E8-S5

- **Postgres incluido** (perfil `db`): el servicio `backup` hace `pg_dump` (formato _custom_)
  cada día a las `BACKUP_HOUR` UTC en `BACKUP_DIR` (`/opt/plaza/backups`) y borra las de más de
  `BACKUP_KEEP_DAYS` días. **Copiarlas fuera de la VM** (instantáneas del proveedor o
  `rclone copy /opt/plaza/backups remoto:plaza-backups` en un `cron` diario).
- **Postgres gestionado**: copias diarias y recuperación a un instante del proveedor, con
  retención ≥ 7 días. `pg_dump` manual antes de migraciones delicadas.
- Copia manual en cualquier momento:
  `docker compose exec -T backup pg_dump --format=custom --no-owner --file=/backups/plaza-manual.dump`

**Restaurar** (la app deja de escribir mientras tanto):

```bash
cd /opt/plaza
docker compose stop server                     # los navegadores muestran «Reconectando…»
docker compose exec -T postgres pg_restore --clean --if-exists --no-owner \
  -U plaza -d plaza < backups/plaza-AAAAMMDD-HHMMSS.dump
docker compose start server
curl -s https://<dominio>/api/health
```

Para comprobar una copia sin tocar producción, restaurarla en otra base
(`docker compose exec -T postgres createdb -U plaza plaza_check` y `-d plaza_check`) y contar filas.

| Fecha      | Entorno                        | Resultado                                                                                                                                                         |
| ---------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-27 | Local (compose de `infra/app`) | OK: copia de 2 usuarios, 2 espacios y 4 membresías; `DELETE` de usuarios y espacios; `pg_restore --clean --if-exists` → 2/2/4 y 3 migraciones; servidor _healthy_ |

## Rotar claves — E8-S5

Generar valores con `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`,
guardarlos en el gestor de secretos del equipo, editar `/opt/plaza/.env` y aplicar con
`docker compose up -d` (solo recrea lo que cambió). Un entorno cada vez: primero _staging_.

| Secreto                    | Efecto de rotarlo                                                                                                                                                                                                                                                                                                        | Pasos                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`           | **Todos los enlaces de invitación cambian** (son un HMAC del secreto): los antiguos dejan de funcionar y cada _owner_ debe copiar el nuevo en Ajustes del espacio. Los inicios de sesión con Google en curso (10 min) fallan y hay que repetirlos. Las sesiones abiertas **siguen** (su _token_ no depende del secreto). | Avisar a los _owners_ antes; cambiar `.env`; `docker compose up -d`. Solo si se sospecha que se filtró                    |
| Cerrar todas las sesiones  | Todo el mundo vuelve a iniciar sesión                                                                                                                                                                                                                                                                                    | `docker compose exec -T postgres psql -U plaza -d plaza -c 'DELETE FROM "Session";'`                                      |
| `GOOGLE_CLIENT_SECRET`     | Ninguno si se hace en dos pasos                                                                                                                                                                                                                                                                                          | Google Cloud → Credenciales → añadir secreto nuevo; desplegarlo; deshabilitar el antiguo                                  |
| `LIVEKIT_API_KEY`/`SECRET` | Los medios del pasillo se cortan unos segundos; los navegadores piden _token_ nuevo y reconectan solos                                                                                                                                                                                                                   | Par nuevo en la VM de medios (`.env` de `infra/livekit`) y en la app; reiniciar ambos (sección «Seguridad de los medios») |
| `HEALTH_TOKEN`             | El monitor con cabecera falla hasta actualizarlo                                                                                                                                                                                                                                                                         | Cambiar `.env` y el monitor                                                                                               |
| `POSTGRES_PASSWORD`        | Ninguno si se cambia a la vez en la BD y en `.env`                                                                                                                                                                                                                                                                       | `ALTER USER plaza PASSWORD '…'` en `psql`; actualizar `POSTGRES_PASSWORD` y `DATABASE_URL`; `docker compose up -d`        |
| DSN de Sentry (web)        | Va dentro del JavaScript: requiere construir la imagen web de nuevo                                                                                                                                                                                                                                                      | Cambiar la variable `VITE_SENTRY_DSN` y desplegar una versión nueva                                                       |
| Clave SSH de despliegue    | Ninguno                                                                                                                                                                                                                                                                                                                  | Clave nueva en `authorized_keys` y en `APP_SSH_KEY`; quitar la antigua                                                    |

## Monitorización de la app — E8-S1

- **Errores (Sentry):** proyectos `plaza-server` (`SENTRY_DSN`) y `plaza-web`
  (`VITE_SENTRY_DSN`). Cada error llega con la versión (`release`), `user.id` y la etiqueta
  `spaceId`; nunca cuerpos de chat, _tokens_, cookies, enlaces de invitación ni e-mails
  (`beforeSend` con `scrubEvent`, ver [security-review.md](./security-review.md)). Alertas:
  «nuevo _issue_» y «más de 20 eventos en 5 min» al canal del equipo.
- **Disponibilidad (monitor externo):** UptimeRobot, Better Stack o el del proveedor, cada
  minuto, alerta tras 2 fallos seguidos:
  - `https://<dominio>/api/health` espera `200` y el texto `"status":"ok"` (proceso vivo detrás
    de Caddy);
  - `https://<dominio>/` espera `200` (Caddy y la web);
  - los dos de la VM de medios (sección «Monitorización y alertas» de LiveKit).
- **Figuras de tiempo real:** `GET /api/health` con la cabecera `X-Health-Token` añade
  `realtime.connectedBySpace`, `realtime.inConversationBySpace` (personas con _peers_ de medios,
  incluye a quien está en los 30 s de reconexión), `avgTickMs`, `avgMediaPeersPerTick` y
  `process.rssMb`/`heapUsedMb`. Referencia con 50 personas moviéndose: _tick_ 1–2 ms, ~130 MB
  de RSS estables ([load-test.md](./load-test.md)). Investigar si `avgTickMs` pasa de 20 ms de
  forma sostenida o la memoria sube sin parar. Si el monitor admite cabeceras, un segundo
  monitor con `X-Health-Token` que busque `"avgTickMs"`.
- **VM de medios:** alerta de **CPU > 70 % durante 5 min** y de **tráfico mensual > 80 % del
  incluido** en el proveedor (sección de LiveKit). Con las cifras de [load-test.md](./load-test.md)
  se estima el consumo mensual para fijar el umbral.

## Contingencias — E8-S5

| Qué cae                | Efecto                                                                                                                                     | Qué hacer                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VM de medios (LiveKit) | Sin audio/vídeo del pasillo; mapa, chat y salas de Meet siguen                                                                             | Sección [Contingencia: la VM de medios cae](#contingencia-la-vm-de-medios-cae): pasar a LiveKit Cloud cambiando `LIVEKIT_URL`/`KEY`/`SECRET` en `/opt/plaza/.env`, `docker compose up -d`, y añadir su origen a `CSP_CONNECT_SRC` |
| Google (login u OAuth) | Nadie puede **iniciar** sesión; las sesiones abiertas (30 días deslizantes) siguen. Si cae Meet, las salas no abren pero el resto funciona | Esperar y avisar a los pilotos (status.cloud.google.com). **Nunca** activar `AUTH_TEST_LOGIN` como atajo: el servidor no arranca con él en producción                                                                             |
| Servidor de la app     | «Reconectando…» en todos los navegadores                                                                                                   | `docker compose ps` / `logs server`; `docker compose up -d`; si una versión nueva falla, [revertir](#revertir--e8-s5)                                                                                                             |
| Base de datos          | La API responde 500 (Sentry avisa); el tiempo real no deja entrar                                                                          | `docker compose logs postgres`; espacio en disco (`df -h`); restaurar la última copia si está dañada                                                                                                                              |
| VM de app completa     | Todo                                                                                                                                       | VM nueva ([Preparar](#preparar-una-vm-de-app-una-vez-por-entorno)), restaurar la última copia externa, apuntar el DNS, desplegar la última versión                                                                                |
