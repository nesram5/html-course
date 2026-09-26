# E4 · Multijugador en tiempo real

| Campo | Valor |
|---|---|
| Objetivo | Que todas las personas conectadas a un espacio se vean moverse con fluidez, con el servidor como autoridad |
| Depende de | E2, E3 |
| Cubre | RF-07, RF-06 (validación), RN-06, RN-10, RNF-01, RNF-04 |
| Puntos | 29 |
| Sprint | 3 |
| Resultado demostrable | **Hito M2**: 3 personas en 3 equipos caminan por la misma oficina y se ven en tiempo real; al cortar el wifi 10 s, la sesión se recupera sola |

## Contratos nuevos (`@plaza/shared/realtime/*`)

`space:join`, `space:snapshot`, `player:move`, `player:correct`, `world:delta`, `space:kicked`, `error`
(ver arquitectura §9.2).

---

### E4-S1 · Conexión autenticada y entrada al espacio — 5 pts · Must

**Como** miembro **quiero** conectarme al espacio en tiempo real **para** aparecer ante los demás.

**Criterios de aceptación**
- **Dado** una cookie de sesión válida, **cuando** el cliente conecta a `/realtime`, **entonces** el *handshake* se acepta; sin cookie o con una inválida, se rechaza con `UNAUTHORIZED`.
- **Dado** que emito `space:join` de un espacio del que soy miembro, **cuando** el servidor responde, **entonces** recibo `space:snapshot` con mi estado y el de todos los conectados.
- **Dado** un espacio del que no soy miembro, **cuando** emito `space:join`, **entonces** recibo `error { code: "NOT_A_MEMBER" }`.
- **Dado** un espacio con 50 conectados (RN-06), **cuando** intento entrar, **entonces** recibo `error { code: "SPACE_FULL" }`.
- **Dado** un `v` de protocolo distinto, **cuando** conecto, **entonces** recibo `PROTOCOL_MISMATCH`.

**Tareas técnicas**
- [ ] *Middleware* de autenticación de Socket.IO reutilizando `requireUser` (E1-S3).
- [ ] `RealtimeClient` en el frontend con eventos tipados y validación zod de entrada.
- [ ] `safeHandler` para todos los *handlers*.

---

### E4-S2 · Estado vivo del espacio (`SpaceRuntime`) — 5 pts · Must

**Como** desarrollador **quiero** un estado en memoria por espacio detrás de una interfaz **para** operar rápido hoy y poder moverlo a Redis mañana (RNF-09).

**Criterios de aceptación**
- **Dado** que entra la primera persona, **cuando** se crea el runtime, **entonces** carga el mapa con `parseMap` una sola vez.
- **Dado** que sale la última persona, **cuando** pasan 60 s, **entonces** el runtime se libera.
- **Dado** que una persona abre una segunda pestaña, **cuando** se une, **entonces** la sesión anterior recibe `error { code: "SESSION_REPLACED" }` y se desconecta (un avatar por persona).

**Tareas técnicas**
- [ ] `SpaceStateStore` (interfaz) + `InMemorySpaceStateStore`.
- [ ] Consumir `MemberRemoved` (E2-S6) → emitir `space:kicked` y desconectar.

---

### E4-S3 · Validación de movimiento en el servidor — 5 pts · Must

**Como** plataforma **quiero** validar cada paso en el servidor **para** impedir teletransportes y atravesar paredes.

**Criterios de aceptación**
- **Dado** un `player:move` a una casilla adyacente y transitable, **cuando** llega, **entonces** se acepta y se actualiza `lastSeq`.
- **Dado** un movimiento a una casilla no adyacente, no transitable o con `seq` antiguo, **cuando** llega, **entonces** se rechaza con `player:correct { seq, x, y }`.
- **Dado** más de 10 movimientos por segundo, **cuando** llegan, **entonces** los que exceden se descartan y se registra una métrica.
- Dos avatares pueden compartir casilla (RN-10).

**Tareas técnicas**
- [ ] `validateStep(map, from, to)` en `world-core` (pura, con tests).
- [ ] *Token bucket* por socket.

---

### E4-S4 · *Tick* y difusión de cambios — 3 pts · Must

**Como** miembro **quiero** recibir los movimientos de los demás de forma eficiente **para** verlos fluidos sin saturar la red.

**Criterios de aceptación**
- **Dado** movimientos en un espacio, **cuando** pasa un *tick* (66 ms, 15 Hz), **entonces** los demás reciben un único `world:delta` con los cambios acumulados; si no hubo cambios, no se envía nada.
- **Dado** que alguien entra o sale, **cuando** pasa el *tick*, **entonces** aparece en `joined` / `left`.
- Duración del *tick* medida como métrica (p95 < 5 ms con 50 jugadores).

**Tareas técnicas**
- [ ] `SpaceTicker` que recorre solo espacios con cambios pendientes.
- [ ] En E5 el mismo *tick* ejecutará el motor de proximidad.

---

### E4-S5 · Render de otros jugadores con interpolación y reconciliación — 5 pts · Must

**Como** persona usuaria **quiero** ver a los demás caminar con suavidad y que mi avatar responda al instante **para** que la experiencia sea natural.

**Criterios de aceptación**
- **Dado** un `world:delta` con un jugador movido, **cuando** se aplica, **entonces** su sprite se interpola hasta la nueva casilla con animación de caminar (sin saltos).
- **Dado** que muevo mi avatar, **cuando** pulso, **entonces** se mueve inmediatamente (predicción) y, si llega `player:correct`, se reubica sin romper la animación.
- **Dado** `joined`/`left`, **cuando** se aplican, **entonces** los avatares aparecen/desaparecen con un breve *fade*.
- 60 fps con 50 avatares en un portátil de referencia.

**Tareas técnicas**
- [ ] `RemotePlayersSystem` en `WorldScene` alimentado por `worldStore`.
- [ ] Reconciliación por `seq` en `LocalPlayerController`.
- [ ] Orden de profundidad por `y` (quien está más abajo se dibuja delante).

---

### E4-S6 · Reconexión — 3 pts · Must

**Como** persona usuaria **quiero** que un corte breve de red no me saque del espacio **para** no perder el hilo (RNF-04).

**Criterios de aceptación**
- **Dado** un corte < 30 s, **cuando** vuelve la red, **entonces** el cliente reconecta, vuelve a unirse y recibe un `space:snapshot` nuevo; mi avatar sigue donde estaba.
- **Dado** el corte, **cuando** está desconectado, **entonces** veo un aviso "Reconectando…" y mi avatar aparece semitransparente para los demás durante 30 s antes de salir.

**Tareas técnicas**
- [ ] Periodo de gracia de 30 s en el servidor antes de emitir `left`.
- [ ] Indicador de conexión en la UI (`connectionStore`).

---

### E4-S7 · Bot de carga — 3 pts · Must

**Como** equipo **queremos** simular 50 usuarios en un espacio **para** verificar RNF-01 y RN-06 desde temprano.

**Criterios de aceptación**
- **Dado** `pnpm load --space <id> --bots 50`, **cuando** se ejecuta, **entonces** 50 bots se unen y caminan aleatoriamente respetando colisiones.
- El informe final muestra latencia de `world:delta` (p50/p95), CPU del servidor y eventos rechazados.

**Tareas técnicas**
- [ ] `tools/load/` con `socket.io-client` y usuarios de prueba creados por *seed*.
