# E8 · Lanzamiento de la beta

| Campo                 | Valor                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| Objetivo              | Llevar el MVP a una calidad apta para equipos reales: seguro, rápido, accesible, desplegado y medido |
| Depende de            | E6, E7 (E8-S5 y E8-S7 también de E9)                                                                 |
| Cubre                 | RNF-01 a RNF-10 y los criterios de aceptación del MVP (brief §11)                                    |
| Puntos                | 22                                                                                                   |
| Sprints               | 5–6 (E8-S5 y E8-S7 en el sprint 6)                                                                   |
| Resultado demostrable | **Hito M5**: 5 equipos piloto trabajando en Plaza y un panel con las métricas O1–O6                  |

---

### E8-S1 · Monitorización básica — 2 pts

**Como** equipo **queremos** enterarnos de los errores antes que los pilotos **para** reaccionar rápido.

**Criterios de aceptación**

- **Dado** un error en cliente o servidor, **cuando** ocurre, **entonces** llega a Sentry con versión, `userId` y `spaceId` (sin contenido de chat ni _tokens_).
- **Dado** `GET /api/health`, **cuando** lo consulto, **entonces** veo conectados por espacio y la duración media del _tick_; un monitor externo avisa si falla (el de la VM de medios se configura en E5-S7).
- **Dado** el tráfico mensual de la VM de medios, **cuando** supera el 80 % de lo incluido por el proveedor, **entonces** llega una alerta.

---

### E8-S2 · Revisión de seguridad y privacidad — 3 pts

**Como** responsable de seguridad **quiero** revisar la superficie de ataque **para** lanzar sin vulnerabilidades conocidas.

**Criterios de aceptación**

- Lista de verificación en `docs/security-review.md`: flujo OAuth (PKCE, `state`, verificación del `id_token`), que no se guardan _tokens_ de Google, `AUTH_TEST_LOGIN` imposible en producción, CSP y cabeceras, _rate limit_ de los eventos de socket, autorización en todos los endpoints (test que los recorre sin sesión y con rol _member_), `pnpm audit` sin vulnerabilidades altas.
- El test de privacidad de salas (E6-S3) pasa en CI.

---

### E8-S3 · Prueba de carga — 3 pts

**Como** equipo **queremos** confirmar que 50 personas por espacio funcionan bien **para** cumplir RNF-01 y RN-06.

**Criterios de aceptación**

- **Dado** 50 bots y 3 navegadores reales en _staging_, **cuando** se mueven 15 min, **entonces**: latencia de movimiento p95 < 200 ms, 60 fps en el portátil de referencia y sin fugas de memoria.
- **Dado** 12 conversaciones simultáneas de 4 personas con vídeo (clientes con medios falsos), **cuando** duran 10 min, **entonces** la CPU de la VM de medios se mantiene < 60 % y se anota el ancho de banda para confirmar el dimensionado.
- Informe breve en `docs/load-test.md`.

**Tareas técnicas**

- [ ] `tools/load/` con `socket.io-client` y usuarios creados con el login de prueba.

---

### E8-S4 · Tests E2E de los flujos principales — 5 pts

**Como** equipo **queremos** automatizar los flujos clave **para** evitar regresiones.

**Criterios de aceptación**

- Tests Playwright (2–3 contextos, medios falsos, login de prueba) para: unirse con enlace (flujo 2), conversación espontánea (flujo 3) y entrar en una sala (flujo 4, comprobando la tarjeta y el `meetUri`, sin abrir Meet real).
- Corren en CI en `main` en < 10 min, sin _flakes_ en 20 ejecuciones seguidas.

---

### E8-S5 · Despliegue de la beta — 3 pts

**Como** equipo **queremos** un entorno de beta estable y reproducible **para** invitar a los pilotos.

**Criterios de aceptación**

- **Dado** un _merge_ en `main`, **cuando** pasa el CI, **entonces** se despliega en _staging_; la beta se despliega con una etiqueta `v0.x` y aprobación manual.
- HTTPS, Postgres con copia diaria (restauración probada una vez), secretos de Google y de LiveKit de producción configurados; VM de medios de E5-S7 con claves distintas a las de _staging_.
- Proyecto de Google Cloud de producción con la pantalla de consentimiento lista (modo de pruebas con los usuarios piloto o app interna por Workspace).
- _Runbook_ en `docs/runbook.md`: desplegar, revertir, restaurar la BD, rotar claves, actualizar LiveKit, qué hacer si cae la VM de medios (contingencia: pasar a LiveKit Cloud cambiando variables) o Google.

---

### E8-S6 · Accesibilidad, i18n y GDPR — 3 pts

**Como** persona usuaria **quiero** una aplicación accesible y respetuosa con mis datos **para** usarla con confianza.

**Criterios de aceptación**

- Auditoría con axe sin errores críticos; toda la UI (fuera del canvas) se usa con teclado.
- **Dado** "Borrar mi cuenta", **cuando** confirmo, **entonces** se borran mis datos, sesiones y membresías; mis mensajes quedan como "Usuario eliminado".
- Página de privacidad: qué se guarda (perfil de Google básico, chat), qué no (audio, vídeo, posiciones, _tokens_ de Google) y que las salas usan Google Meet.
- No quedan textos sin traducir.

---

### E8-S7 · Onboarding de pilotos y medición — 3 pts

**Como** producto **quiero** incorporar a los equipos piloto y medir los objetivos del brief **para** decidir los siguientes pasos con datos.

**Criterios de aceptación**

- Panel con las métricas O1–O6 (conversaciones espontáneas por usuario y día, días de uso por semana, latencia A/V, sesiones sin errores, tiempo de entrada, % de entradas a sala que abren Meet).
- Formulario de _feedback_ dentro de la app y una entrevista por equipo en la semana 2.
- Guía de bienvenida de 1 página para los pilotos.

**Tareas técnicas**

- [ ] Eventos de producto sin datos personales (`space_joined`, `conversation_started`, `conversation_ended`, `room_entered`, `room_meet_opened`) agregados en Postgres.
