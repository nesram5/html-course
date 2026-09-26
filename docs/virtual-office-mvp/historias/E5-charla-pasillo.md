# E5 · Charla de pasillo (audio y vídeo por proximidad)

| Campo | Valor |
|---|---|
| Objetivo | La función estrella: acercar tu avatar a alguien conecta audio y vídeo sobre el mapa; alejarte lo corta |
| Depende de | E4 (y el *spike* E0-S7) |
| Cubre | RF-08, RF-09, RN-01, RN-02, RN-04, RN-07, RN-12, RNF-02 |
| Puntos | 21 |
| Sprints | 3–4 |
| Resultado demostrable | Dos personas se cruzan en el pasillo y se ven y oyen en < 1,5 s; al separarse, los vídeos se desvanecen y se cortan |

## Contratos nuevos

`POST /api/spaces/:spaceId/media-token` → `{ url, token }` · `media:peers { peers }` · `world:delta.changed[].inConversation`.

---

### E5-S1 · Motor de proximidad — 3 pts

**Como** desarrollador **quiero** una función pura que decida quién habla con quién en el pasillo **para** tener una única fuente de verdad, fácil de probar.

**Criterios de aceptación**
- **Dado** A y B a 3 casillas, **cuando** calculo, **entonces** son *peers* mutuos; a 4 siguen conectados si ya lo estaban (histéresis); a 5 se desconectan.
- **Dado** A, B y C en fila a 3 casillas (A–C a 6), **cuando** calculo, **entonces** A–B y B–C están conectados, A–C no.
- **Dado** B *Ocupado* o dentro de una sala, **cuando** A se acerca, **entonces** no se conectan (RN-03, RN-04).
- **Dado** 12 personas juntas, **cuando** calculo, **entonces** nadie tiene más de 8 *peers*, priorizando las más cercanas.
- Test de propiedades: la relación es siempre simétrica y nadie en una sala tiene *peers*.

**Tareas técnicas**
- [ ] `computePeers` en `shared/world` (todos contra todos, arquitectura §10.1).

---

### E5-S2 · Emisión de `media:peers` — 3 pts

**Como** plataforma **quiero** avisar a cada cliente solo cuando cambian sus *peers* **para** minimizar tráfico y latencia.

**Criterios de aceptación**
- **Dado** un *tick* con cambios, **cuando** cambia el resultado, **entonces** solo reciben `media:peers` las personas afectadas.
- **Dado** que A empieza a conversar, **cuando** se aplica el *delta*, **entonces** los demás ven un globo 💬 sobre A (`inConversation`).

---

### E5-S3 · Token de LiveKit Cloud — 2 pts

**Como** cliente **quiero** credenciales de medios para mi espacio **para** conectarme a LiveKit Cloud.

**Criterios de aceptación**
- **Dado** que soy miembro, **cuando** pido el token, **entonces** recibo uno para la sala `space_<spaceId>` con identidad = mi `userId`, válido 1 h y sin permisos de administración.
- **Dado** que no soy miembro, **cuando** lo pido, **entonces** recibo `404`.

**Tareas técnicas**
- [ ] `adapters/livekit.ts` detrás de `MediaProvider` (token y `mutePublishedTrack` para E6).

---

### E5-S4 · Pantalla previa (pre-join) — 3 pts

**Como** persona usuaria **quiero** probar cámara y micrófono antes de entrar **para** no aparecer sin sonido.

**Criterios de aceptación**
- **Dado** que entro al espacio, **cuando** carga, **entonces** veo mi vista previa, un medidor del micrófono y selectores de dispositivos.
- **Dado** que deniego los permisos, **cuando** pasa, **entonces** puedo entrar sin medios y veo cómo activarlos.
- **Dado** que elijo dispositivos, **cuando** vuelvo otro día, **entonces** se recuerdan.

**Tareas técnicas**
- [ ] Componente `PreJoin` de `@livekit/components-react`, personalizado con Tailwind y textos i18n.

---

### E5-S5 · `MediaController`: publicar y suscribirse según los *peers* — 5 pts

**Como** persona usuaria **quiero** que el audio y el vídeo se conecten y desconecten solos según me muevo **para** hablar como en una oficina real.

**Criterios de aceptación**
- **Dado** que entro con medios, **cuando** conecto a LiveKit, **entonces** publico micro y cámara (simulcast) sin suscribirme a nadie (`autoSubscribe: false`).
- **Dado** `media:peers` con B, **cuando** llega, **entonces** me suscribo a B; si B sale de la lista, me desuscribo en < 300 ms.
- **Dado** un corte < 30 s, **cuando** vuelve la red, **entonces** LiveKit reconecta y se reaplica la última lista de *peers*.
- Métrica en Sentry (transacción): tiempo desde `media:peers` hasta el primer *frame* (p95 < 1,5 s).
- Test E2E con medios falsos: acercar y alejar dos avatares y comprobar que aparece y desaparece el vídeo.

---

### E5-S6 · Vídeos sobre el mapa y controles — 5 pts

**Como** persona usuaria **quiero** ver los vídeos de quien tengo cerca y controlar mis medios **para** conversar con comodidad.

**Criterios de aceptación**
- **Dado** que estoy conectado, **cuando** hablan, **entonces** veo sus vídeos en una tira sobre el mapa con nombre e indicador de micrófono; quien habla tiene un borde resaltado.
- **Dado** que alguien se aleja, **cuando** se acerca al límite, **entonces** su vídeo se vuelve translúcido antes de desaparecer.
- **Dado** la barra inferior (avatar · nombre · estado · micro · cámara · personas · emoji · chat), **cuando** pulso micro o cámara, **entonces** se silencia o apaga y los demás lo ven.
- **Dado** el primer uso, **cuando** entro al espacio, **entonces** veo un aviso breve: "Las charlas de pasillo no son privadas; para hablar en privado, entra en una sala" (RN-12).
- Todos los botones tienen `aria-label` y son accesibles por teclado.

**Tareas técnicas**
- [ ] `VideoStrip`, `BottomBar` con componentes de `@livekit/components-react` (`VideoTrack`, `useIsSpeaking`); `ConversationBubble` en Phaser.
