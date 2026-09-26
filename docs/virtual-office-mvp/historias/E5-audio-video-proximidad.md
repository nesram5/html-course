# E5 · Audio y vídeo por proximidad

| Campo | Valor |
|---|---|
| Objetivo | La función estrella: acercar tu avatar a alguien conecta audio y vídeo automáticamente; alejarte lo corta |
| Depende de | E4 (y el *spike* E0-S8) |
| Cubre | RF-08, RF-09, RN-01, RN-02, RNF-02, RNF-04 |
| Puntos | 31 |
| Sprint | 4 |
| Resultado demostrable | **Hito M3**: dos personas se cruzan en el pasillo, se ven y se oyen en < 1,5 s; al separarse, los vídeos se desvanecen y se cortan. El equipo empieza a trabajar dentro de Plaza |

## Contratos nuevos

- `POST /api/spaces/:spaceId/media-token` → `{ url, token }` (solo miembros conectados al espacio).
- `media:peers { listenTo, audience, areaId }` (S→C); `world:delta.changed[].inConversation`.
- `POST /api/livekit/webhook` (firmado por LiveKit; se usa en E6-S4).

---

### E5-S1 · Motor de proximidad en `world-core` — 5 pts · Must

**Como** desarrollador **quiero** una función pura que decida quién oye a quién **para** tener una única fuente de verdad, fácil de probar.

**Criterios de aceptación**
- **Dado** A y B a 3 casillas (R = 3), **cuando** calculo el grafo, **entonces** A ∈ `listenTo(B)` y B ∈ `listenTo(A)`.
- **Dado** A y B conectados que pasan a 4 casillas, **cuando** calculo con el grafo anterior, **entonces** siguen conectados (histéresis); a 5, se desconectan (RN-02).
- **Dado** A, B y C en fila a 3 casillas entre sí (A–C a 6), **cuando** calculo, **entonces** A–B y B–C están conectados, pero A–C no (RN-01, no transitivo).
- **Dado** B en estado `busy`, **cuando** A se acerca, **entonces** no se conectan (RN-04).
- **Dado** 15 personas agrupadas, **cuando** calculo, **entonces** nadie tiene más de 12 *peers* y se priorizan los más cercanos (RN-07).
- Test de propiedades: sin *spotlight*, el grafo es siempre simétrico. Cobertura ≥ 90 %.
- *Benchmark*: 50 jugadores en < 1 ms.

**Tareas técnicas**
- [ ] `computeMediaGraph` con rejilla espacial (ver arquitectura §10.1); áreas y *spotlight* quedan como puntos de extensión para E6.
- [ ] *Fixtures* de escenarios con nombres legibles (`corridorEncounter`, `triangle`, `crowd15`).

---

### E5-S2 · Emisión de `media:peers` desde el *tick* — 3 pts · Must

**Como** plataforma **quiero** avisar a cada cliente solo cuando cambia con quién debe conectarse **para** minimizar tráfico y latencia.

**Criterios de aceptación**
- **Dado** un *tick* con movimientos, **cuando** cambia el grafo, **entonces** solo reciben `media:peers` los jugadores cuyo `listenTo` o `audience` cambió.
- **Dado** que A entra en conversación, **cuando** se aplica el *delta*, **entonces** los demás reciben `inConversation: true` para A y dibujan el globo 💬.
- **Dado** que alguien se desconecta, **cuando** sale, **entonces** desaparece de todos los grafos en el siguiente *tick*.

**Tareas técnicas**
- [ ] `MediaGraphService` en el módulo `world` que guarda el grafo anterior por espacio y calcula diferencias.
- [ ] Métrica: número de `media:peers` emitidos por *tick*.

---

### E5-S3 · Token de LiveKit — 2 pts · Must

**Como** cliente **quiero** obtener credenciales de medios para mi espacio **para** conectarme al SFU.

**Criterios de aceptación**
- **Dado** que soy miembro, **cuando** pido el token, **entonces** recibo un JWT de LiveKit para la sala `space_<spaceId>` con identidad = mi `userId`, válido 1 h.
- **Dado** que no soy miembro, **cuando** lo pido, **entonces** recibo `404`.
- El token **no** permite `roomAdmin` ni cambiar metadatos de otros.

**Tareas técnicas**
- [ ] `MediaService.issueToken` con `livekit-server-sdk` (`AccessToken`, `VideoGrant`).
- [ ] Renovación automática en el cliente antes de caducar.

---

### E5-S4 · Pantalla previa (pre-join) — 5 pts · Must

**Como** persona usuaria **quiero** probar cámara y micrófono antes de entrar **para** no aparecer sin sonido o con el dispositivo equivocado.

**Criterios de aceptación**
- **Dado** que entro al espacio, **cuando** carga, **entonces** veo mi vista previa de vídeo, un medidor de volumen del micrófono y selectores de cámara, micrófono y altavoz.
- **Dado** que deniego los permisos, **cuando** pasa, **entonces** puedo entrar igualmente sin medios y veo cómo activarlos en el navegador.
- **Dado** que elijo dispositivos, **cuando** vuelvo otro día, **entonces** se recuerdan (`localStorage`, con respaldo si falla).
- **Dado** que conecto unos auriculares con el espacio abierto, **cuando** ocurre `devicechange`, **entonces** la lista se actualiza.
- Funciona en Chrome, Edge, Firefox y Safari (RNF-03).

**Tareas técnicas**
- [ ] `features/media/PreJoin.tsx`, `useMediaDevices`, `useAudioLevel` (Web Audio `AnalyserNode`).
- [ ] Liberar las pistas de la vista previa al entrar (se crean nuevas en LiveKit).

---

### E5-S5 · `MediaController`: conectar, publicar y suscribir según el grafo — 8 pts · Must

**Como** persona usuaria **quiero** que el audio y el vídeo se conecten y desconecten solos según me muevo **para** hablar como en una oficina real.

**Criterios de aceptación**
- **Dado** que entro al espacio con medios, **cuando** conecto a LiveKit, **entonces** publico micro y cámara (simulcast) pero **nadie** puede suscribirse hasta que el servidor lo indique.
- **Dado** un `media:peers` con B en `listenTo`, **cuando** llega, **entonces** me suscribo a las pistas de B; si B sale de la lista, me desuscribo en < 300 ms.
- **Dado** un `media:peers` con `audience`, **cuando** llega, **entonces** llamo a `setTrackSubscriptionPermissions` con exactamente esa lista.
- **Dado** una prueba con 3 navegadores (A cerca de B, C lejos), **cuando** C intenta suscribirse a A a mano, **entonces** el SFU lo rechaza.
- **Dado** un corte de red < 30 s, **cuando** vuelve, **entonces** LiveKit reconecta y se reaplican el último `listenTo` y `audience` (RNF-04).
- Métrica cliente: tiempo desde `media:peers` hasta el primer *frame* (objetivo p95 < 1,5 s, RNF-02).

**Tareas técnicas**
- [ ] `features/media/MediaController.ts` (clase sin React) + `mediaStore` (Zustand) con las pistas remotas visibles.
- [ ] `autoSubscribe: false`; *dynacast* y *adaptive stream* activados.
- [ ] Test E2E con Playwright (medios falsos): acercar y alejar dos avatares y comprobar que aparece y desaparece el `<video>`.

---

### E5-S6 · Tira de vídeos, controles y señales visuales — 5 pts · Must

**Como** persona usuaria **quiero** ver los vídeos de quien tengo cerca y controlar mis medios **para** conversar con comodidad.

**Criterios de aceptación**
- **Dado** que estoy conectado con otras personas, **cuando** hablan, **entonces** veo sus vídeos en una tira sobre el mapa con nombre, avatar pequeño e indicador de micrófono; quien habla tiene un borde resaltado.
- **Dado** que alguien se aleja, **cuando** se acerca al límite de distancia, **entonces** su vídeo se vuelve translúcido progresivamente antes de desaparecer.
- **Dado** que dos personas conversan lejos de mí, **cuando** las veo en el mapa, **entonces** muestran un globo 💬 sobre sus avatares.
- **Dado** la barra inferior (avatar, nombre, estado, botones), **cuando** pulso micro o cámara (o `Ctrl+Shift+A` / `Ctrl+Shift+V`), **entonces** se silencia o apaga y los demás lo ven.
- **Dado** que hago clic en un vídeo, **cuando** lo pulso, **entonces** se amplía (y se suscribe a la capa alta del simulcast).
- Todos los botones tienen `aria-label` y son accesibles por teclado.

**Tareas técnicas**
- [ ] `VideoStrip`, `VideoTile`, `BottomBar` (con el mismo esquema que el producto de referencia: avatar · nombre · estado · mapa · pantalla · emoji).
- [ ] Opacidad según `distance / (radius + hysteresis)` calculada con las posiciones del `worldStore`.
- [ ] `ConversationBubble` en Phaser.

---

### E5-S7 · TURN y redes restrictivas — 3 pts · Must

**Como** persona en una red corporativa **quiero** que el audio y el vídeo funcionen aunque se bloquee UDP **para** poder usar Plaza desde la oficina.

**Criterios de aceptación**
- **Dado** una red que solo permite TCP 443, **cuando** me conecto, **entonces** los medios fluyen a través de TURN/TLS.
- La prueba está documentada con una configuración reproducible (contenedor con `iptables` que bloquea UDP).

**Tareas técnicas**
- [ ] Activar el TURN embebido de LiveKit con certificado TLS en *staging*.
- [ ] Documentar puertos y requisitos de red para los equipos piloto.
