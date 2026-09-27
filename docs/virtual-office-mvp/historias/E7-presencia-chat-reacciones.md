# E7 · Presencia, _ring_, chat y reacciones

| Campo                 | Valor                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Objetivo              | La "etiqueta social" de la oficina: saber quién está disponible, llamar a quien no está atento, escribir y reaccionar                     |
| Depende de            | E5 (usa el `MediaController` para el auto-silencio)                                                                                       |
| Cubre                 | RF-11, RF-12, RF-13, RF-14, RF-15, RN-04, RN-05, RN-11                                                                                    |
| Puntos                | 16                                                                                                                                        |
| Sprints               | 4–5                                                                                                                                       |
| Resultado demostrable | Mary cambia de ventana: aparece "Ausente", su micro se silencia; Sam pulsa "Llamar", Mary vuelve y habla. El equipo reacciona con ❤️ y 👍 |

## Contratos nuevos

`player:status`, `player:away`, `ring:send` / `ring:received`, `chat:send` / `chat:message`, `reaction` (arquitectura §9.2) ·
`GET /api/spaces/:spaceId/messages` (últimos 100).

---

### E7-S1 · Estados y ausencia automática con auto-silencio — 5 pts

**Como** persona usuaria **quiero** que mi estado refleje si estoy disponible y que mis medios se silencien al cambiar de ventana **para** no emitir sin querer y que los demás sepan si pueden hablarme.

**Criterios de aceptación**

- **Dado** el menú de estado de la barra inferior, **cuando** elijo _Disponible_ u _Ocupado_, **entonces** el punto de mi avatar cambia para todos (verde / rojo) y _Ocupado_ aplica RN-04.
- **Dado** que cambio de pestaña, **cuando** ocurre `visibilitychange`, **entonces** paso a _Ausente_ (gris), se silencian micro y cámara, y al volver se restaura exactamente lo que tenía.
- **Dado** 10 min sin actividad, **cuando** pasan, **entonces** paso a _Ausente_; cualquier interacción me devuelve a mi estado elegido.
- **Dado** que recargo, **cuando** vuelvo, **entonces** se mantiene mi estado elegido (`Membership.status`).
- **Dado** alguien _Ausente_ conectado conmigo, **cuando** lo veo, **entonces** su vídeo muestra la tarjeta "Ausente · Llamar".

**Tareas técnicas**

- [ ] `usePresenceActivity` (visibilidad + inactividad) → `player:away` + orden al `MediaController`.

---

### E7-S2 · Lista de miembros y localizar — 3 pts

**Como** persona usuaria **quiero** ver quién está en la oficina y encontrarle en el mapa **para** ir a hablar con él.

**Criterios de aceptación**

- **Dado** el botón "Personas", **cuando** lo abro, **entonces** veo a los conectados (estado y "En Sala X" si aplica) y, debajo, a los desconectados, con buscador por nombre.
- **Dado** un miembro conectado, **cuando** pulso "Localizar", **entonces** la cámara se desplaza hasta él durante 3 s y vuelve a mí.

---

### E7-S3 · Chat del espacio — 3 pts

**Como** miembro **quiero** escribir mensajes a todo el espacio **para** comunicar cosas sin ir a buscar a nadie.

**Criterios de aceptación**

- **Dado** el panel de chat, **cuando** envío un mensaje, **entonces** todos los conectados lo reciben en < 300 ms y se guarda.
- **Dado** que entro al espacio, **cuando** abro el chat, **entonces** veo los últimos 100 mensajes (sin paginación).
- **Dado** un mensaje de más de 1000 caracteres o más de 5 por segundo, **cuando** lo envío, **entonces** se rechaza con un error claro.
- **Dado** el chat cerrado, **cuando** llega un mensaje, **entonces** veo un contador de no leídos.
- El texto se muestra escapado y los enlaces son clicables con `rel="noopener noreferrer"`.

---

### E7-S4 · Reacciones con emojis — 2 pts

**Como** persona usuaria **quiero** reaccionar con emojis **para** expresarme sin interrumpir.

**Criterios de aceptación**

- **Dado** el botón de emoji (o las teclas `1`–`5`), **cuando** elijo ❤️ 👍 🎉 😂 👋, **entonces** aparece sobre mi avatar 3 s para todo el espacio.
- Máx. 3 reacciones por segundo por persona.

---

### E7-S5 · Llamar (_ring_) — 3 pts

**Como** persona usuaria **quiero** llamar a alguien _Ausente_ o lejano **para** avisarle de que quiero hablar (como Sam con Mary en el vídeo).

**Criterios de aceptación**

- **Dado** la tarjeta "Ausente" de alguien o su fila en la lista de miembros, **cuando** pulso "Llamar", **entonces** le suena un aviso y recibe una notificación del navegador "Sam te está llamando" (si concedió el permiso).
- **Dado** la notificación, **cuando** hace clic, **entonces** vuelve a la pestaña de Bululu y se restauran sus medios.
- **Dado** que llamo dos veces en 30 s a la misma persona, **cuando** lo intento, **entonces** el botón está deshabilitado con cuenta atrás (RN-11).
- **Dado** que la persona está _Ocupada_, **cuando** la llamo, **entonces** recibe la notificación sin sonido.
- El permiso de notificaciones se pide en el primer uso, no al entrar.
