# E4 · Multijugador en tiempo real

| Campo                 | Valor                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Objetivo              | Que todas las personas del espacio se vean moverse con fluidez, con el servidor validando                             |
| Depende de            | E2, E3                                                                                                                |
| Cubre                 | RF-07, RF-06 (validación), RN-06, RN-10, RNF-01, RNF-04                                                               |
| Puntos                | 20                                                                                                                    |
| Sprint                | 3                                                                                                                     |
| Resultado demostrable | **Hito M2**: 3 personas en 3 equipos caminan por la misma oficina; al cortar el wifi 10 s, la sesión se recupera sola |

## Contratos nuevos

`space:join`, `space:snapshot`, `player:move`, `player:correct`, `world:delta`, `space:kicked`, `error` (arquitectura §9.2).

---

### E4-S1 · Conexión autenticada y entrada al espacio — 5 pts

**Como** miembro **quiero** conectarme al espacio en tiempo real **para** aparecer ante los demás.

**Criterios de aceptación**

- **Dado** una cookie válida, **cuando** conecto a `/realtime`, **entonces** se acepta; sin cookie o inválida, se rechaza con `UNAUTHORIZED`.
- **Dado** `space:join` de un espacio del que soy miembro, **cuando** responde, **entonces** recibo `space:snapshot` con todos los conectados y las salas.
- **Dado** un espacio ajeno o lleno (50, RN-06), **cuando** emito `space:join`, **entonces** recibo `NOT_A_MEMBER` o `SPACE_FULL`.
- **Dado** que abro una segunda pestaña, **cuando** entra, **entonces** la anterior recibe `space:kicked { reason: "SESSION_REPLACED" }`.

**Tareas técnicas**

- [ ] _Middleware_ de Socket.IO que reutiliza `requireUser`; `RealtimeClient` tipado con validación zod; `safeHandler`.

---

### E4-S2 · Estado vivo del espacio — 3 pts

**Como** desarrollador **quiero** el estado de cada espacio en memoria detrás de una interfaz **para** operar rápido y poder cambiarlo más adelante.

**Criterios de aceptación**

- **Dado** que entra la primera persona, **cuando** se crea el `SpaceRuntime`, **entonces** carga el mapa una sola vez.
- **Dado** que sale la última, **cuando** pasan 60 s, **entonces** se libera.
- **Dado** una expulsión (E2-S6), **cuando** ocurre, **entonces** la persona recibe `space:kicked` y se la desconecta.

---

### E4-S3 · Validación de movimiento — 3 pts

**Como** plataforma **quiero** validar cada paso en el servidor **para** impedir teletransportes y atravesar paredes.

**Criterios de aceptación**

- **Dado** un paso a una casilla adyacente y transitable, **cuando** llega, **entonces** se acepta y se recalcula `roomId`.
- **Dado** un paso no adyacente o a una casilla bloqueada, **cuando** llega, **entonces** se responde `player:correct { x, y }` y el cliente recoloca el avatar.
- **Dado** más de 10 pasos por segundo, **cuando** llegan, **entonces** se descartan los que sobran.
- Dos avatares pueden compartir casilla (RN-10).

---

### E4-S4 · _Tick_ y difusión de cambios — 3 pts

**Como** miembro **quiero** recibir los movimientos de los demás de forma eficiente **para** verlos fluidos sin saturar la red.

**Criterios de aceptación**

- **Dado** movimientos, **cuando** pasa un _tick_ (66 ms), **entonces** los demás reciben un único `world:delta`; si no hubo cambios, no se envía nada.
- **Dado** que alguien entra o sale, **cuando** pasa el _tick_, **entonces** aparece en `joined` / `left`.

---

### E4-S5 · Render de otras personas — 3 pts

**Como** persona usuaria **quiero** ver a los demás caminar con suavidad **para** que la experiencia sea natural.

**Criterios de aceptación**

- **Dado** un `world:delta`, **cuando** se aplica, **entonces** cada avatar remoto se anima hasta su nueva casilla (sin saltos) y se ordena en profundidad por `y`.
- **Dado** `joined` / `left`, **cuando** se aplican, **entonces** los avatares aparecen o desaparecen con un breve _fade_.
- 60 fps con 50 avatares en un portátil de referencia.

---

### E4-S6 · Reconexión — 3 pts

**Como** persona usuaria **quiero** que un corte breve de red no me saque del espacio **para** no perder el hilo (RNF-04).

**Criterios de aceptación**

- **Dado** un corte < 30 s, **cuando** vuelve la red, **entonces** el cliente reconecta, recibe un `space:snapshot` nuevo y mi avatar sigue donde estaba.
- **Dado** el corte, **cuando** estoy desconectado, **entonces** veo "Reconectando…" y los demás ven mi avatar semitransparente durante 30 s antes de que salga.
