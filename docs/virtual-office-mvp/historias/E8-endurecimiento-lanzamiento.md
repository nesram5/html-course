# E8 · Endurecimiento y lanzamiento de la beta

| Campo | Valor |
|---|---|
| Objetivo | Llevar el MVP a una calidad apta para equipos reales: observable, seguro, rápido, accesible y desplegado |
| Depende de | E6, E7 |
| Cubre | RNF-01 a RNF-10 y los criterios de aceptación del MVP (brief §11) |
| Puntos | 31 |
| Sprints | 6–7 |
| Resultado demostrable | **Hito M5**: 5 equipos piloto trabajando en Plaza, con un panel que muestra las métricas del brief §3 |

---

### E8-S1 · Observabilidad — 5 pts · Must

**Como** equipo **queremos** ver la salud del sistema en tiempo real **para** detectar problemas antes que los pilotos.

**Criterios de aceptación**
- **Dado** `/metrics` (protegido), **cuando** lo consulto, **entonces** veo: conectados por espacio, duración del *tick* (p50/p95), movimientos rechazados, `media:peers` emitidos, errores por código y latencia "`media:peers` → primer *frame*" que reporta el cliente.
- **Dado** un error no controlado en el cliente o en el servidor, **cuando** ocurre, **entonces** llega a Sentry/GlitchTip con `userId`, `spaceId` y versión (sin datos personales ni contenido de chat).
- **Dado** el panel de Grafana, **cuando** lo abro, **entonces** veo las métricas anteriores y alertas para: *tick* p95 > 20 ms, tasa de errores > 1 %, LiveKit caído.

**Tareas técnicas**
- [ ] `prom-client`, endpoint `/metrics` con autenticación básica; Prometheus + Grafana en el `docker-compose` de *staging*.
- [ ] Endpoint `POST /api/telemetry` para métricas del cliente, con *rate limit*.

---

### E8-S2 · Revisión de seguridad y privacidad — 5 pts · Must

**Como** responsable de seguridad **quiero** revisar la superficie de ataque **para** lanzar sin vulnerabilidades conocidas.

**Criterios de aceptación**
- Lista de verificación completada y guardada en `docs/security-review.md`: CSP y cabeceras, *rate limit* de todos los eventos de socket, autorización en todos los endpoints (test que recorre las rutas sin sesión y con rol *member*), validación zod en todas las entradas, secretos solo en variables de entorno, dependencias sin vulnerabilidades altas (`pnpm audit`).
- **Dado** el test de privacidad de áreas (E6-S4), **cuando** corre en CI, **entonces** pasa.
- **Dado** un *fuzzing* básico de eventos de socket con datos aleatorios, **cuando** se ejecuta 10 000 veces, **entonces** el servidor no cae y responde `error` de validación.

**Tareas técnicas**
- [ ] Script de *fuzzing* con `fast-check` + `socket.io-client`.
- [ ] Revisión de `iframe` de objetos interactivos (`sandbox`, lista blanca).

---

### E8-S3 · Prueba de carga y optimización — 5 pts · Must

**Como** equipo **queremos** confirmar que 50 personas por espacio funcionan bien **para** cumplir RNF-01 y RN-06.

**Criterios de aceptación**
- **Dado** 50 bots (E4-S7) y 3 navegadores reales en el mismo espacio de *staging*, **cuando** se mueven durante 15 min, **entonces**: latencia de movimiento p95 < 200 ms, 60 fps en el portátil de referencia, *tick* p95 < 5 ms, sin fugas de memoria en servidor ni cliente.
- **Dado** 12 personas en una sala con vídeo, **cuando** hablan durante 10 min, **entonces** la CPU del navegador de referencia se mantiene < 70 %.
- Informe con resultados y cambios aplicados en `docs/load-test.md`.

**Tareas técnicas**
- [ ] Perfilado del cliente (Chrome DevTools) y del servidor (`--cpu-prof`).
- [ ] Optimizaciones típicas: capas estáticas en *render texture*, reducir resolución de miniaturas, *batching* de `world:delta`.

---

### E8-S4 · Suite E2E completa — 5 pts · Must

**Como** equipo **queremos** que los flujos principales del brief estén automatizados **para** evitar regresiones.

**Criterios de aceptación**
- Hay tests Playwright para los flujos 1–7 del brief §8 (primera vez, unirse, conversación espontánea, reunión, concentración, *ring*, *spotlight*), con 2–3 contextos de navegador y medios falsos.
- Corren en CI en `main` y en PR con la etiqueta `e2e`, en < 10 min, sin *flakes* en 20 ejecuciones seguidas.

**Tareas técnicas**
- [ ] *Fixtures* de Playwright: usuario autenticado, espacio sembrado, helper `walkTo(page, x, y)`.
- [ ] Atributos `data-testid` solo donde no haya un selector accesible (`getByRole`).

---

### E8-S5 · Despliegue de la beta — 5 pts · Must

**Como** equipo **queremos** un entorno de beta estable y reproducible **para** invitar a los pilotos.

**Criterios de aceptación**
- **Dado** un *merge* en `main`, **cuando** pasa el CI, **entonces** se despliega automáticamente en *staging*; la beta se despliega con una etiqueta `v0.x` y aprobación manual.
- HTTPS con Caddy, LiveKit con TURN/TLS en 443, Postgres con copia diaria verificada (restauración probada una vez).
- **Dado** un despliegue, **cuando** se reinicia el servidor, **entonces** los clientes reconectan solos (E4-S6) sin perder mensajes de chat.
- *Runbook* en `docs/runbook.md`: desplegar, revertir, restaurar la BD, rotar claves de LiveKit, qué hacer si cae el SFU.

**Tareas técnicas**
- [ ] `infra/docker-compose.prod.yml`, imágenes etiquetadas por SHA, *workflow* `deploy.yml`.
- [ ] Apagado ordenado: el servidor avisa a los clientes (`error { code: "SERVER_RESTARTING" }`) antes de cerrar.

---

### E8-S6 · Accesibilidad, i18n y GDPR — 3 pts · Must

**Como** persona usuaria **quiero** una aplicación accesible y respetuosa con mis datos **para** usarla con confianza.

**Criterios de aceptación**
- Auditoría con axe sin errores críticos en todas las pantallas; toda la UI (fuera del canvas) se usa con teclado.
- **Dado** el perfil, **cuando** pulso "Borrar mi cuenta" y confirmo, **entonces** se borran mis datos personales, sesiones y membresías; mis mensajes de chat quedan como "Usuario eliminado".
- Página de privacidad que explica qué se guarda (chat) y qué no (audio, vídeo, posiciones).
- No quedan textos sin traducir (script que detecta *strings* sueltas en JSX).

**Tareas técnicas**
- [ ] `DELETE /api/me`; `axe-core` en los tests de Playwright.

---

### E8-S7 · Onboarding de pilotos y medición — 3 pts · Must

**Como** producto **quiero** incorporar a los equipos piloto y medir los objetivos del brief **para** decidir los siguientes pasos con datos.

**Criterios de aceptación**
- **Dado** un equipo piloto, **cuando** recibe la invitación, **entonces** entra en < 60 s (O5), medido con un evento de analítica de producto.
- Panel con las métricas O1–O5 del brief §3 (conversaciones espontáneas por usuario y día, días de uso por semana, latencia A/V, sesiones sin errores).
- Formulario de *feedback* dentro de la app (botón en el menú) y una entrevista por equipo en la semana 2.

**Tareas técnicas**
- [ ] Eventos de analítica sin datos personales (`space_joined`, `conversation_started`, `conversation_ended`), agregados en Postgres.
- [ ] Guía de bienvenida de 1 página para los pilotos.
