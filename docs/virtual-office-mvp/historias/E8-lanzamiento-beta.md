# E8 · Lanzamiento de la beta

| Campo | Valor |
|---|---|
| Objetivo | Llevar el MVP a una calidad apta para equipos reales: seguro, rápido, accesible, desplegado y medido |
| Depende de | E6, E7 |
| Cubre | RNF-01 a RNF-10 y los criterios de aceptación del MVP (brief §11) |
| Puntos | 22 |
| Sprint | 5 |
| Resultado demostrable | **Hito M4**: 5 equipos piloto trabajando en Plaza y un panel con las métricas O1–O6 |

---

### E8-S1 · Monitorización básica — 2 pts

**Como** equipo **queremos** enterarnos de los errores antes que los pilotos **para** reaccionar rápido.

**Criterios de aceptación**
- **Dado** un error en cliente o servidor, **cuando** ocurre, **entonces** llega a Sentry con versión, `userId` y `spaceId` (sin contenido de chat ni *tokens*).
- **Dado** `GET /api/health`, **cuando** lo consulto, **entonces** veo conectados por espacio y la duración media del *tick*; un monitor externo avisa si falla.

---

### E8-S2 · Revisión de seguridad y privacidad — 3 pts

**Como** responsable de seguridad **quiero** revisar la superficie de ataque **para** lanzar sin vulnerabilidades conocidas.

**Criterios de aceptación**
- Lista de verificación en `docs/security-review.md`: flujo OAuth (PKCE, `state`, verificación del `id_token`), que no se guardan *tokens* de Google, `AUTH_TEST_LOGIN` imposible en producción, CSP y cabeceras, *rate limit* de los eventos de socket, autorización en todos los endpoints (test que los recorre sin sesión y con rol *member*), `pnpm audit` sin vulnerabilidades altas.
- El test de privacidad de salas (E6-S3) pasa en CI.

---

### E8-S3 · Prueba de carga — 3 pts

**Como** equipo **queremos** confirmar que 50 personas por espacio funcionan bien **para** cumplir RNF-01 y RN-06.

**Criterios de aceptación**
- **Dado** 50 bots y 3 navegadores reales en *staging*, **cuando** se mueven 15 min, **entonces**: latencia de movimiento p95 < 200 ms, 60 fps en el portátil de referencia y sin fugas de memoria.
- Informe breve en `docs/load-test.md`.

**Tareas técnicas**
- [ ] `tools/load/` con `socket.io-client` y usuarios creados con el login de prueba.

---

### E8-S4 · Tests E2E de los flujos principales — 5 pts

**Como** equipo **queremos** automatizar los flujos clave **para** evitar regresiones.

**Criterios de aceptación**
- Tests Playwright (2–3 contextos, medios falsos, login de prueba) para: unirse con enlace (flujo 2), conversación espontánea (flujo 3) y entrar en una sala (flujo 4, comprobando la tarjeta y el `meetUri`, sin abrir Meet real).
- Corren en CI en `main` en < 10 min, sin *flakes* en 20 ejecuciones seguidas.

---

### E8-S5 · Despliegue de la beta — 3 pts

**Como** equipo **queremos** un entorno de beta estable y reproducible **para** invitar a los pilotos.

**Criterios de aceptación**
- **Dado** un *merge* en `main`, **cuando** pasa el CI, **entonces** se despliega en *staging*; la beta se despliega con una etiqueta `v0.x` y aprobación manual.
- HTTPS, Postgres con copia diaria (restauración probada una vez), secretos de Google y LiveKit Cloud de producción configurados.
- Proyecto de Google Cloud de producción con la pantalla de consentimiento lista (modo de pruebas con los usuarios piloto o app interna por Workspace).
- *Runbook* en `docs/runbook.md`: desplegar, revertir, restaurar la BD, rotar claves, qué hacer si cae LiveKit Cloud o Google.

---

### E8-S6 · Accesibilidad, i18n y GDPR — 3 pts

**Como** persona usuaria **quiero** una aplicación accesible y respetuosa con mis datos **para** usarla con confianza.

**Criterios de aceptación**
- Auditoría con axe sin errores críticos; toda la UI (fuera del canvas) se usa con teclado.
- **Dado** "Borrar mi cuenta", **cuando** confirmo, **entonces** se borran mis datos, sesiones y membresías; mis mensajes quedan como "Usuario eliminado".
- Página de privacidad: qué se guarda (perfil de Google básico, chat), qué no (audio, vídeo, posiciones, *tokens* de Google) y que las salas usan Google Meet.
- No quedan textos sin traducir.

---

### E8-S7 · Onboarding de pilotos y medición — 3 pts

**Como** producto **quiero** incorporar a los equipos piloto y medir los objetivos del brief **para** decidir los siguientes pasos con datos.

**Criterios de aceptación**
- Panel con las métricas O1–O6 (conversaciones espontáneas por usuario y día, días de uso por semana, latencia A/V, sesiones sin errores, tiempo de entrada, % de entradas a sala que abren Meet).
- Formulario de *feedback* dentro de la app y una entrevista por equipo en la semana 2.
- Guía de bienvenida de 1 página para los pilotos.

**Tareas técnicas**
- [ ] Eventos de producto sin datos personales (`space_joined`, `conversation_started`, `conversation_ended`, `room_entered`, `room_meet_opened`) agregados en Postgres.
