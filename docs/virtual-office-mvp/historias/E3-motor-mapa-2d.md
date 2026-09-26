# E3 · Motor del mapa 2D

| Campo | Valor |
|---|---|
| Objetivo | Renderizar el espacio y permitir caminar por él con colisiones (todavía en solitario) |
| Depende de | E0 (E2-S1 para las plantillas) |
| Cubre | RF-05, RF-06, RF-21 (Should) |
| Puntos | 26 (23 Must + 3 Should) |
| Sprints | 2–3 (E3-S7 en el sprint 6) |
| Resultado demostrable | En `/s/:slug` camino con WASD/flechas por la "Oficina pequeña", choco con paredes y escritorios y la cámara me sigue |

---

### E3-S1 · `parseMap` en `world-core` — 5 pts · Must

**Como** desarrollador **quiero** convertir un mapa de Tiled en un modelo de dominio **para** que cliente y servidor compartan exactamente las mismas colisiones, áreas y puntos de aparición.

**Criterios de aceptación**
- **Dado** un `.tmj` válido, **cuando** llamo a `parseMap`, **entonces** obtengo `{ width, height, collisionGrid, areas, spawns, desks }`.
- **Dado** una casilla con tile en la capa `collision`, **cuando** consulto `isWalkable(map, x, y)`, **entonces** devuelve `false`; fuera de los límites también `false`.
- **Dado** un área poligonal, **cuando** consulto `areaAt(map, x, y)` con el centro de una casilla dentro, **entonces** devuelve su `areaId` (se usa en E6).
- Cobertura ≥ 90 % con mapas de prueba pequeños (*fixtures*).

**Tareas técnicas**
- [ ] Esquema zod mínimo del formato Tiled JSON (solo lo que usamos).
- [ ] `collisionGrid` como `Uint8Array` (`width × height`).
- [ ] Precalcular `areaIndex: Uint16Array` por casilla (búsqueda O(1) en el *tick*).
- [ ] Reutilizar en `validate:maps` (sustituye la validación provisional de E2-S1).

---

### E3-S2 · Escena Phaser con capas del mapa — 5 pts · Must

**Como** persona usuaria **quiero** ver la oficina con su suelo, paredes y decoración **para** orientarme en el espacio.

**Criterios de aceptación**
- **Dado** que entro en `/s/:slug`, **cuando** carga, **entonces** veo el mapa de su plantilla con las capas en el orden correcto (`decor-above` por encima de los avatares).
- **Dado** que los recursos tardan, **cuando** cargan, **entonces** veo una barra de progreso, y si fallan, un mensaje con "Reintentar".
- El mapa se ve nítido (*pixel art* sin suavizado) en pantallas HiDPI.

**Tareas técnicas**
- [ ] `PreloadScene` y `WorldScene`; `pixelArt: true`, `roundPixels: true`.
- [ ] Carga del `.tmj` y *tilesets* desde `@plaza/maps` según `mapTemplateId`.
- [ ] La capa `collision` no se dibuja (salvo con `?debug=1`).

---

### E3-S3 · Avatar propio y movimiento por casillas — 5 pts · Must

**Como** persona usuaria **quiero** mover mi avatar con el teclado **para** desplazarme por la oficina.

**Criterios de aceptación**
- **Dado** que pulso una flecha o WASD, **cuando** la casilla destino es transitable, **entonces** el avatar se desplaza una casilla en ~120 ms con animación de caminar en esa dirección.
- **Dado** que mantengo la tecla, **cuando** sigo pulsando, **entonces** el avatar camina de forma continua.
- **Dado** que suelto la tecla, **cuando** termina el paso, **entonces** queda en la animación de reposo mirando a esa dirección.
- **Dado** que el foco está en un campo de texto (chat), **cuando** escribo, **entonces** el avatar **no** se mueve.
- Aparece en un `spawn` de la plantilla (o en su escritorio en E7-S6).

**Tareas técnicas**
- [ ] `AvatarSprite` reutilizable (se usará también para remotos en E4).
- [ ] `LocalPlayerController`: cola de un paso, emite un evento interno `local:step {x, y, dir}` (en E4 se envía al servidor).

---

### E3-S4 · Colisiones en el cliente — 2 pts · Must

**Como** persona usuaria **quiero** no atravesar paredes ni muebles **para** que el espacio se sienta real.

**Criterios de aceptación**
- **Dado** una pared a la derecha, **cuando** pulso derecha, **entonces** el avatar gira pero no avanza.
- **Dado** el mismo mapa, **cuando** comparo con el servidor (E4), **entonces** ambos usan `isWalkable` de `world-core` (sin lógica duplicada).

**Tareas técnicas**
- [ ] `LocalPlayerController` consulta `isWalkable` antes de mover.
- [ ] Test unitario del controlador con un mapa *fixture*.

---

### E3-S5 · Cámara, zoom y etiquetas de nombre — 3 pts · Must

**Como** persona usuaria **quiero** que la cámara me siga y ver nombres sobre los avatares **para** saber dónde estoy y quién es quién.

**Criterios de aceptación**
- **Dado** que me muevo, **cuando** me acerco al borde, **entonces** la cámara me sigue con suavizado y no muestra zonas fuera del mapa.
- **Dado** los controles `+`/`-` (o Ctrl + rueda), **cuando** hago zoom, **entonces** cambia entre 1×, 1,5× y 2× manteniendo nitidez.
- **Dado** mi avatar, **cuando** se dibuja, **entonces** veo mi nombre encima con un fondo semitransparente legible.

**Tareas técnicas**
- [ ] `camera.startFollow` con `setBounds`; zoom en pasos enteros o medios.
- [ ] `NameLabel` como `Text` de Phaser con resolución adecuada (o DOM *overlay* si la nitidez no es buena).

---

### E3-S6 · Integración React ⇄ Phaser — 3 pts · Must

**Como** desarrollador **quiero** un puente limpio entre React y Phaser **para** que la UI y el mundo se comuniquen sin acoplarse.

**Criterios de aceptación**
- **Dado** la página del espacio, **cuando** navego fuera, **entonces** el juego Phaser se destruye y no quedan *listeners* ni bucles (verificado sin fugas en DevTools).
- **Dado** un botón de React "Centrar en mí", **cuando** lo pulso, **entonces** la cámara se centra usando el `EventBus`.
- **Dado** que el canvas tiene el foco, **cuando** pulso `Tab`, **entonces** el foco pasa a la UI (no queda atrapado).

**Tareas técnicas**
- [ ] `<WorldCanvas />` que crea/destruye `Phaser.Game` en `useEffect`.
- [ ] `EventBus` tipado (`mitt` o implementación propia) y `worldStore` (Zustand).
- [ ] Documentar el patrón en `apps/web/src/features/world/README.md`.

---

### E3-S7 · Objetos interactivos — 3 pts · Should

**Como** miembro **quiero** acercarme a un objeto del mapa y abrir su contenido (web, vídeo, nota) **para** compartir cosas con quien pase por allí, como en el vídeo de referencia ("*Press X to interact*").

**Criterios de aceptación**
- **Dado** que mi avatar está a ≤ 1 casilla de un objeto de la capa `interactives`, **cuando** me acerco, **entonces** el objeto se resalta y aparece el aviso "Pulsa X para interactuar".
- **Dado** el aviso, **cuando** pulso `X`, **entonces** se abre un panel con el contenido: `embed` en un `iframe` con `sandbox`, `note` como texto; `Esc` lo cierra.
- **Dado** un objeto con una URL fuera de la lista blanca de dominios, **cuando** se valida el mapa en CI, **entonces** falla.
- **Dado** que me alejo con el panel abierto, **cuando** salgo del rango, **entonces** el panel sigue abierto hasta que lo cierro (no se pierde un vídeo a medias).

**Tareas técnicas**
- [ ] `interactives` en `parseMap` y en `validate:maps` (lista blanca en `packages/maps/allowed-embeds.json`).
- [ ] `InteractiveHighlightSystem` en Phaser + `InteractivePanel` en React vía `EventBus`.
- [ ] Añadir 1 objeto de cada tipo en cada plantilla (p. ej. "Música de la oficina", "Tablón de anuncios").
