# E7 · Presencia, *ring*, chat y reacciones

| Campo | Valor |
|---|---|
| Objetivo | La "etiqueta social" de la oficina: saber quién está disponible, llamar a quien no está atento, escribir, reaccionar, seguir a alguien y tener tu escritorio |
| Depende de | E5 (usa el `MediaController` para el auto-silencio y el grafo de medios para el chat cercano) |
| Cubre | RF-12, RF-13, RF-14, RF-15, RF-18 · Should: RF-16, RF-17 · RN-04, RN-05, RN-12 |
| Puntos | 34 (24 Must + 10 Should) |
| Sprints | 5–6 |
| Resultado demostrable | Mary cambia de ventana: su tarjeta muestra "Fuera de la pestaña", su micro se silencia, Sam pulsa "Llamar", Mary vuelve y habla. Durante la charla, todos reaccionan con ❤️ y 👍 |

## Contratos nuevos

`player:status`, `player:activity`, `ring:send` / `ring:received`, `chat:send` / `chat:message`, `reaction`
(ver arquitectura §9.2) · `GET /api/spaces/:spaceId/messages?before=<cursor>` ·
`PUT /api/spaces/:spaceId/members/:userId/desk`.

---

### E7-S1 · Estados y "fuera de la pestaña" con auto-silencio — 5 pts · Must

**Como** persona usuaria **quiero** que mi estado refleje si estoy disponible y que mis medios se silencien al cambiar de ventana **para** no emitir sin querer y para que los demás sepan si pueden hablarme.

**Criterios de aceptación**
- **Dado** el menú de estado de la barra inferior, **cuando** elijo *Disponible* u *Ocupado*, **entonces** el punto de color de mi avatar cambia para todos (verde / rojo) y *Ocupado* aplica RN-04.
- **Dado** que cambio a otra pestaña o ventana, **cuando** ocurre `visibilitychange`, **entonces** mi micro y mi cámara se silencian, mi estado se ve como "Fuera de la pestaña" (tarjeta gris en los vídeos de los demás) y, al volver, se restaura exactamente lo que tenía activado.
- **Dado** 10 min sin actividad de teclado o ratón, **cuando** pasan, **entonces** paso a *Ausente* (amarillo); cualquier interacción me devuelve a mi estado elegido.
- **Dado** que recargo la página, **cuando** vuelvo, **entonces** se mantiene mi estado elegido (*Ocupado* sigue siendo *Ocupado*).

**Tareas técnicas**
- [ ] `usePresenceActivity` (visibilidad + inactividad) que emite `player:activity` y ordena al `MediaController` silenciar o restaurar.
- [ ] Estado elegido guardado en `Membership.status` (ver arquitectura §7).
- [ ] Tarjeta "Fuera de la pestaña" en `VideoTile`.

---

### E7-S2 · Lista de miembros y localizar — 5 pts · Must

**Como** persona usuaria **quiero** ver quién está en la oficina y encontrarle en el mapa **para** ir a hablar con él.

**Criterios de aceptación**
- **Dado** el botón de "mapa/personas" de la barra inferior, **cuando** lo abro, **entonces** veo a los miembros en línea (con estado y área actual, p. ej. "Sala 1") y, debajo, a los desconectados.
- **Dado** un miembro en línea, **cuando** pulso "Localizar", **entonces** la cámara se desplaza hasta él durante 3 s con una flecha indicadora y vuelve a mí.
- **Dado** el buscador, **cuando** escribo, **entonces** se filtra por nombre.

**Tareas técnicas**
- [ ] `MemberPanel` alimentado por `worldStore` (en línea) y TanStack Query (todos los miembros).
- [ ] Orden `world:locate` por el `EventBus` hacia `WorldScene`.

---

### E7-S3 · Chat del espacio — 5 pts · Must

**Como** miembro **quiero** escribir mensajes a todo el espacio **para** comunicar cosas sin tener que ir a buscar a nadie.

**Criterios de aceptación**
- **Dado** el panel de chat, pestaña "Todos", **cuando** envío un mensaje, **entonces** todos los conectados lo reciben en < 300 ms y se guarda.
- **Dado** que entro al espacio, **cuando** abro el chat, **entonces** veo los últimos 50 mensajes y puedo cargar más hasta 200 (RN-09).
- **Dado** un mensaje de más de 1000 caracteres o más de 5 mensajes por segundo, **cuando** lo envío, **entonces** se rechaza con un error claro.
- **Dado** que tengo el chat cerrado, **cuando** llega un mensaje, **entonces** veo un contador de no leídos.
- El texto se muestra escapado (sin HTML) y los enlaces son clicables con `rel="noopener noreferrer"`.

**Tareas técnicas**
- [ ] Modelo `ChatMessage`, `ChatService` con recorte a 200 mensajes por espacio (tarea programada o en la inserción).
- [ ] Paginación por cursor.
- [ ] `ChatPanel` con foco que bloquea el movimiento del avatar (E3-S3).

---

### E7-S4 · Chat cercano — 3 pts · Must

**Como** persona en una conversación **quiero** enviar texto solo a quienes están conectados conmigo **para** compartir un enlace sin molestar al resto.

**Criterios de aceptación**
- **Dado** la pestaña "Cerca", **cuando** envío, **entonces** lo reciben solo las personas de mi `listenTo` en ese momento (calculado en el servidor).
- **Dado** que no estoy conectado con nadie, **cuando** abro la pestaña, **entonces** está deshabilitada con "No hay nadie cerca".
- Los mensajes cercanos **no** se guardan.

**Tareas técnicas**
- [ ] `ChatService.sendNearby` consulta el grafo de `MediaGraphService`.

---

### E7-S5 · Reacciones con emojis — 3 pts · Must

**Como** persona usuaria **quiero** reaccionar con emojis **para** expresarme sin interrumpir, como el público de la *game night* del vídeo.

**Criterios de aceptación**
- **Dado** el botón de emoji de la barra inferior (o las teclas `1`–`6`), **cuando** elijo ❤️ 👍 🎉 😂 👋 ✋, **entonces** aparece sobre mi avatar durante 3 s para todo el espacio.
- **Dado** ✋ (levantar la mano), **cuando** la elijo, **entonces** se queda fija hasta que la bajo.
- Máx. 3 reacciones por segundo por persona.

**Tareas técnicas**
- [ ] Evento `reaction` sin persistencia; animación en Phaser (subir y desvanecer).

---

### E7-S6 · Escritorios asignados — 5 pts · Should

**Como** administradora **quiero** asignar un escritorio a cada persona **para** que el espacio se sienta propio y sea fácil encontrar a cada uno (como el escritorio de Jeff en el vídeo).

**Criterios de aceptación**
- **Dado** que soy *owner*, **cuando** asigno el escritorio `desk-07` a Luis, **entonces** su nombre aparece sobre ese escritorio para todos.
- **Dado** que Luis entra al espacio, **cuando** aparece, **entonces** lo hace en su escritorio en vez de en un `spawn`.
- **Dado** un escritorio ya asignado, **cuando** intento asignarlo a otra persona, **entonces** se me pide confirmar la reasignación.

**Tareas técnicas**
- [ ] `PUT .../desk`, restricción única `(spaceId, deskId)`.
- [ ] Etiquetas de escritorio en Phaser.

---

### E7-S7 · Llamar (*ring*) — 3 pts · Must

**Como** persona usuaria **quiero** llamar a alguien que está fuera de la pestaña o lejos **para** avisarle de que quiero hablar (como Sam con Mary en el vídeo).

**Criterios de aceptación**
- **Dado** la tarjeta "Fuera de la pestaña" de alguien, o su fila en la lista de miembros, **cuando** pulso "Llamar", **entonces** a esa persona le suena un aviso y recibe una notificación del navegador "Sam te está llamando" (si concedió el permiso).
- **Dado** la notificación, **cuando** hace clic en ella, **entonces** vuelve a la pestaña de Plaza y se restauran sus medios.
- **Dado** que llamo dos veces en 30 s, **cuando** lo intento, **entonces** el botón está deshabilitado con una cuenta atrás (RN-12).
- **Dado** que la persona está *Ocupada*, **cuando** la llamo, **entonces** recibe la notificación sin sonido.

**Tareas técnicas**
- [ ] `ring:send` / `ring:received` con *rate limit* por par.
- [ ] Solicitud del permiso de notificaciones en el primer uso (no al entrar).

---

### E7-S8 · Seguir a una persona — 5 pts · Should

**Como** persona usuaria **quiero** seguir a alguien por el mapa **para** seguir hablando mientras me lleva a algún sitio.

**Criterios de aceptación**
- **Dado** el menú de un avatar o la lista de miembros, **cuando** pulso "Seguir", **entonces** mi avatar camina detrás de esa persona y veo el aviso "Siguiendo a Jeff · Dejar de seguir".
- **Dado** que la persona entra en un área privada y yo puedo pasar, **cuando** la sigo, **entonces** entro detrás de ella.
- **Dado** que pulso una tecla de movimiento o "Dejar de seguir", **cuando** ocurre, **entonces** dejo de seguirla.
- **Dado** que no hay camino posible, **cuando** ocurre, **entonces** me detengo y se muestra "No se puede llegar hasta Jeff".

**Tareas técnicas**
- [ ] `findPath` (A\*) en `world-core` con tests; recalcular la ruta cuando el objetivo se mueve más de 2 casillas.
- [ ] El seguimiento emite `player:move` normales (sin eventos nuevos).
