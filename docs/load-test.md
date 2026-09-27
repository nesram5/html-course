# Prueba de carga — E8-S3

Dos pruebas: el **tiempo real** con 50 personas simuladas moviéndose por un espacio (RNF-01,
RN-06) y los **medios del pasillo** con 12 conversaciones simultáneas de 4 personas con vídeo
(dimensionado de la VM de medios, arquitectura §11.5). Herramientas en
[`tools/load/`](../tools/load/README.md); se repiten con los comandos de cada sección.

**Resumen (2026-09-27, máquina de desarrollo compartida de 4 núcleos):**

| Criterio                                              | Objetivo                  | Resultado                                                                                                               |
| ----------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Latencia de movimiento p95, 50 bots, 5 min            | < 200 ms                  | ✅ **65,8 ms** (p99 68,3 ms, máx. 196,7 ms), estable en cada intervalo de 30 s                                          |
| Fugas de memoria del servidor                         | Sin crecimiento sostenido | ✅ _Heap_ 39,7 → 38,2 MB (−0,38 MB/min tras el calentamiento); RSS 123–133 MB                                           |
| Errores / desconexiones                               | 0                         | ✅ 0 / 0; 0 movimientos rechazados                                                                                      |
| CPU de la VM de medios, 12 × 4 con vídeo, 10 min      | < 60 %                    | ✅ **10,5 %** de 4 vCPU de media (42,0 % de un núcleo; máx. 12,2 %)                                                     |
| Ancho de banda de la VM de medios                     | Anotarlo                  | Entrada 21,3 Mbps · salida **61,1 Mbps** de media (máx. 70,3): ~1,3 Mbps de salida por persona en una conversación de 4 |
| 60 fps en el portátil de referencia con 3 navegadores | 60 fps                    | ⏳ Pendiente en _staging_ (aquí solo hay Chromium sin GPU, ver abajo)                                                   |

No apareció ningún cuello de botella en el servidor ni en LiveKit. Sí en las herramientas: un
solo proceso con 48 clientes de `@livekit/rtc-node` se quedaba sin CPU y fallaba al conectar
(`wait_pc_connection timed out`); la herramienta de medios reparte ahora a las personas entre
varios procesos, conecta a todo el mundo antes de encender las cámaras y reintenta las
suscripciones (ver [Método](#método-medios)).

---

## 1. Tiempo real: 50 personas moviéndose

### Perfil de la prueba

La prueba necesita el login de prueba (los bots no pueden pasar por Google) y el servidor se
niega a arrancar con `AUTH_TEST_LOGIN=true` y `NODE_ENV=production` (E8-S2). Por eso se usa un
**perfil dedicado, no productivo**: la **imagen de producción** (`plaza-server`, el mismo
`node dist/main.js` compilado, las mismas dependencias y el mismo Node 22) con `NODE_ENV=test`,
`AUTH_TEST_LOGIN=true` y una base de datos propia. Frente a producción solo cambia que existe la
ruta de login de prueba, que los _assets_ de mapas no se cachean y que el límite HTTP se sube
para que 50 bots puedan iniciar sesión desde una IP; el código del tiempo real es idéntico.

```bash
docker build -f apps/server/Dockerfile -t plaza-server:local .
docker run --rm --network host -e DATABASE_URL=postgresql://postgres@localhost:5432/plaza_load \
  plaza-server:local migrate
docker run -d --name plaza-load --network host --cpus 2 \
  -e NODE_ENV=test -e AUTH_TEST_LOGIN=true -e PORT=3502 -e LOG_LEVEL=warn \
  -e DATABASE_URL=postgresql://postgres@localhost:5432/plaza_load \
  -e SESSION_SECRET=<32+ caracteres> -e PUBLIC_URL=http://localhost:5502 \
  -e LIVEKIT_URL=ws://localhost:7880 -e LIVEKIT_API_KEY=devkey -e LIVEKIT_API_SECRET=secret \
  -e RATE_LIMIT_PER_MINUTE=100000 -e HEALTH_TOKEN=<16+ caracteres> plaza-server:local
PLAZA_HEALTH_TOKEN=<el mismo> pnpm --filter @plaza/load load \
  --url http://127.0.0.1:3502 --bots 50 --duration 300 --sample-every 30
```

- Servidor limitado a **2 CPU** (`--cpus 2`, el tamaño propuesto para la VM de app).
- 50 bots de `socket.io-client` en un proceso, en `office-small@1`, 4 pasos/s cada uno (200
  movimientos/s en total; el servidor admite 10/s por persona) con paseo aleatorio que respeta
  las colisiones. Cada 30 s se lee `/api/health` con `X-Health-Token`.
- **Latencia de movimiento:** desde que un bot emite `player:move` hasta que **otro** bot recibe
  el `world:delta` con esa posición (mismo proceso y reloj); incluye la espera al siguiente
  _tick_ de 15 Hz (hasta 66 ms), así que es lo que ve una persona real menos la red.

### Resultados (5 min)

| Figura                            | Resultado                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Movimientos enviados              | 59 866 (199/s), 0 rechazados (`player:correct`)                              |
| `world:delta` por bot             | 14,9/s (uno por _tick_ como máximo)                                          |
| Latencia (2 933 140 muestras)     | p50 36,1 ms · **p95 65,8 ms** · p99 68,3 ms · máx. 196,7 ms                  |
| _Tick_ medio (`/api/health`)      | 1,2–1,7 ms (de un presupuesto de 66 ms)                                      |
| CPU del servidor (`docker stats`) | 5–7 % de un núcleo                                                           |
| Memoria                           | RSS 123 → 133 MB; _heap_ 35–44 MB sin tendencia (−0,38 MB/min)               |
| `media:peers` por _tick_          | 7,4 de media (los bots pasean al azar: las conversaciones cambian sin parar) |
| Errores de socket / desconexiones | 0 / 0                                                                        |

p95 de la latencia en cada intervalo de 30 s: 65,9 · 65,6 · 65,8 · 65,4 · 66,2 · 65,9 · 65,9 ·
65,7 · 65,8 · 65,9 ms. Memoria (RSS, MB): 123 · 130 · 131 · 132 · 132 · 126 · 127 · 133 · 133 · 133.

### Navegadores reales

Con 47 bots caminando y **3 Chromium reales** (Playwright, sin GPU) dentro del mismo espacio
(50 personas, el máximo de RN-06) a través de la **imagen web de producción** (Caddy) y la del
servidor, durante 3 min:

| Figura                                    | Resultado                                                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Latencia de movimiento de los bots        | p95 65,7 ms (igual que sin navegadores), 0 errores, 0 desconexiones                                                                                                            |
| Navegadores                               | Los 3 entran y siguen en la oficina todo el rato; **0 errores** de página o de consola (tampoco violaciones de CSP)                                                            |
| Memoria del servidor                      | RSS 140–149 MB                                                                                                                                                                 |
| Fotogramas por segundo en los navegadores | 8–9 fps (`requestAnimationFrame`), **no representativo**: 3 lienzos de Phaser con WebGL por software (SwiftShader) en la misma máquina de 4 núcleos que los bots y el servidor |

El criterio de **60 fps en el portátil de referencia** no se puede medir aquí: queda para
_staging_ con navegadores de verdad (ver [Qué queda para staging](#qué-queda-para-staging)). El
test E2E `world-performance.spec.ts` ya vigila el presupuesto por fotograma del cliente.

## 2. Medios del pasillo: 12 conversaciones de 4 personas

### Método (medios)

- **LiveKit dedicado** para la medida (no el de desarrollo compartido): `livekit/livekit-server:v1.9`
  con `network_mode: host`, puertos propios y métricas Prometheus, misma versión que la VM de
  medios. La CPU se lee con `docker stats` (100 % = un núcleo) y el tráfico con los contadores
  `livekit_packet_bytes{direction}`.
- **48 personas en UNA sala de LiveKit**, como un espacio de Plaza (`space_<id>`), repartidas en
  4 procesos de `@livekit/rtc-node`. Cada una publica micrófono (tono de 220 Hz, Opus sin DTX:
  siempre envía) y cámara, y se suscribe **solo** a las otras 3 de su conversación, que es lo que
  hace el navegador con `media:peers` (`autoSubscribe: false`).
- **Cámara sintética:** ruido de 320×180 a 15 fps con el tope de 450 kbps del perfil `h360` de
  LiveKit, en una sola capa. El ruido no se comprime, así que el codificador envía siempre al
  tope: el SFU reenvía tantos paquetes como con una cámara real a esa tasa, con una fracción del
  coste de codificar 540p. Equivale al caso «tira de vídeo»: con _adaptive stream_ y _dynacast_
  (activos en Plaza) cada persona solo sube la capa que alguien mira (180p o 360p), y esta prueba
  supone siempre la de 360p para cada _peer_, es decir, **por encima** de lo real. Al ampliar un
  vídeo (capa de 540p, ~800 kbps) sube el tráfico de esa persona, no la CPU de forma apreciable.
- Los clientes corren con `nice 10` para que LiveKit tenga prioridad, pero la máquina es
  compartida (otros equipos ejecutaban sus _tests_; carga media de 9 a 20 en 4 núcleos): el ritmo
  de fotogramas que los clientes consiguieron codificar fue menor que 15 fps y el tráfico medido
  queda algo por debajo del teórico (24 Mbps de entrada y 72 de salida para 48 personas). Por eso
  se da también la CPU **por Mbps reenviado**, que es lo que escala.

```bash
docker run -d --name plaza-livekit-load --network host \
  -v $PWD/livekit-load.yaml:/etc/livekit.yaml:ro livekit/livekit-server:v1.9 --config /etc/livekit.yaml
# livekit-load.yaml: port 7980, rtc.tcp_port 7981, rtc.udp_port 7982, prometheus_port 7989, keys
nice -n 10 pnpm --filter @plaza/load media --livekit-url ws://127.0.0.1:7980 \
  --api-key <key> --api-secret <secret> --groups 12 --size 4 --duration 600 --processes 4 \
  --container plaza-livekit-load --metrics-url http://127.0.0.1:7989/metrics
```

### Resultados (10 min)

| Figura                                         | Ejecución final                                        | Primera ejecución (antes de reintentar suscripciones) |
| ---------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Personas / conversaciones                      | 48 / 12, las 48 conectadas; **48/48** con sus 6 pistas | 48 / 12; 44/48 con sus 6 pistas                       |
| CPU de LiveKit (100 % = un núcleo)             | media **42,0 %**, máx. 48,9 %                          | media 40,8 %, máx. 49,8 %                             |
| … como parte de una VM de 4 vCPU               | media **10,5 %**, máx. 12,2 %                          | media 10,2 %, máx. 12,4 %                             |
| Tráfico de entrada (lo que suben las personas) | 21,3 Mbps de media                                     | 18,9 Mbps                                             |
| Tráfico de salida (lo que reciben)             | **61,1 Mbps** de media, máx. 70,3                      | 49,9 Mbps                                             |
| CPU por Mbps reenviado (entrada + salida)      | 0,51 % de un núcleo por Mbps                           | 0,59 %                                                |
| CPU de LiveKit en reposo                       | 0,2 %                                                  | 0,2 %                                                 |

Muestras cada ~16 s de la ejecución final (CPU % de un núcleo / entrada / salida en Mbps):
40/19/55 · 44/22/65 · 39/22/64 · 33/20/60 · 42/21/63 · 40/18/46 · 45/24/66 · 35/23/65 ·
46/23/66 · 42/23/66 · 43/21/59 · 40/20/56 · 49/22/61 · 36/20/56 · 41/24/70 · 44/23/63: estable
durante los 10 min, sin deriva.

### Dimensionado de la VM de medios

- **CPU:** extrapolando al tráfico teórico completo (24 Mbps de entrada y 72 de salida si todos
  los clientes hubieran enviado a 15 fps), LiveKit usaría ~49 % de un núcleo, un **12 %** de la
  VM de 4 vCPU: muy lejos del 60 %. El 60 % de 4 vCPU (240 % de un núcleo) daría para unos
  470 Mbps reenviados, ~5 veces esta carga (~240 personas en conversaciones de 4), por encima
  de las ~150 conectadas de la beta. **La VM de 4 vCPU de §11.5 sobra; no hace falta más.**
- **Tráfico:** 1 Mbps de salida sostenido durante la jornada (8 h × 22 días) son **0,079 TB al
  mes**. Esta prueba (12 conversaciones de 4 todo el día) serían 4,8 TB/mes, pero no es el uso
  esperado. Estimación de la beta: ~150 conectadas, un 15 % en conversación a la vez (~22
  personas, 3 _peers_ cada una): con la capa de 360p (cota superior de esta prueba) ~31 Mbps →
  **~2,5 TB/mes**; con las miniaturas de 180p que elige _adaptive stream_ en la tira (~150 kbps)
  ~11 Mbps → ~0,9 TB/mes. Los 2 TB incluidos de §11.5 se quedan justos en el peor caso:
  **elegir un proveedor con ≥ 5 TB incluidos (o sin límite)** y dejar la alerta del 80 % del
  runbook. Revisar la estimación con el tráfico real del primer mes (panel del proveedor).
- **Red:** 70 Mbps de pico en esta prueba frente al puerto de ≥ 1 Gbps: sin problema.

## Qué queda para _staging_

- La misma prueba de tiempo real contra _staging_ (red real entre bots y servidor) durante
  15 min, con 3 navegadores reales en el portátil de referencia midiendo los fps (objetivo 60).
- La prueba de medios contra la VM de medios real (4 vCPU): ahí la CPU se lee en el panel del
  proveedor y los clientes corren en otra máquina, sin competir con LiveKit.
- Anotar aquí los resultados con la fecha y la versión desplegada.
