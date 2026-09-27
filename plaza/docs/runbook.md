# Runbook de Plaza

Procedimientos de operación del MVP. Cada sección indica la historia que la originó.

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
- Salas de reunión (E6-S3): al pisar una sala, el servidor silencia las pistas de la persona y le
  quita el permiso de publicar en LiveKit (`updateParticipant` con `canPublish: false`, que
  despublica todo lo que tenga), y los _tokens_ que se le emitan dentro de la sala tampoco permiten
  publicar; al volver al pasillo (o salir del espacio) se le devuelve el permiso y es su cliente
  quien vuelve a encender micro y cámara. Si LiveKit falla se registra un aviso y se envía a
  Sentry (`World media isolation on room entry failed`).
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
