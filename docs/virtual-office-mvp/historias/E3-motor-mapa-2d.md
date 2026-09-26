# E3 · Motor del mapa 2D

| Campo | Valor |
|---|---|
| Objetivo | Renderizar el espacio y permitir caminar por él con colisiones (todavía en solitario) |
| Depende de | E0 |
| Cubre | RF-05, RF-06 |
| Puntos | 21 |
| Sprints | 1–3 |
| Resultado demostrable | En `/s/:slug` camino con WASD/flechas por la "Oficina pequeña", choco con paredes y muebles, y la cámara me sigue |

---

### E3-S1 · `parseMap` en `shared/world` — 3 pts

**Como** desarrollador **quiero** convertir un mapa de Tiled en un modelo de dominio **para** que cliente y servidor usen las mismas colisiones y salas.

**Criterios de aceptación**
- **Dado** un `.tmj` válido, **cuando** llamo a `parseMap`, **entonces** obtengo `{ width, height, collisionGrid, rooms, spawns }`.
- **Dado** una casilla con tile en `collision` o fuera de límites, **cuando** consulto `isWalkable`, **entonces** devuelve `false`.
- **Dado** una casilla dentro del rectángulo de una sala, **cuando** consulto `roomAt(map, x, y)`, **entonces** devuelve su `areaId`; fuera, `null`.
- Cobertura ≥ 90 % con mapas de prueba pequeños.

**Tareas técnicas**
- [ ] Esquema zod mínimo del formato Tiled; `collisionGrid` como `Uint8Array`.

---

### E3-S2 · Escena Phaser con las capas del mapa — 5 pts

**Como** persona usuaria **quiero** ver la oficina con su suelo, paredes y decoración **para** orientarme.

**Criterios de aceptación**
- **Dado** `/s/:slug`, **cuando** carga, **entonces** veo el mapa de su plantilla con `decor-above` por encima de los avatares.
- **Dado** que los recursos tardan o fallan, **cuando** ocurre, **entonces** veo progreso o un "Reintentar".
- El *pixel art* se ve nítido (sin suavizado) en pantallas HiDPI.
- Las salas se dibujan con un borde suave y su nombre en el suelo.

**Tareas técnicas**
- [ ] `PreloadScene`, `WorldScene`; `pixelArt: true`, `roundPixels: true`.

---

### E3-S3 · Avatar propio y movimiento por casillas — 5 pts

**Como** persona usuaria **quiero** mover mi avatar con el teclado **para** desplazarme por la oficina.

**Criterios de aceptación**
- **Dado** una flecha o WASD, **cuando** la casilla destino es transitable, **entonces** el avatar se mueve una casilla en ~120 ms con animación en esa dirección; si mantengo la tecla, camina de forma continua.
- **Dado** que suelto la tecla, **cuando** termina el paso, **entonces** queda en reposo mirando a esa dirección.
- **Dado** que el foco está en un campo de texto, **cuando** escribo, **entonces** el avatar no se mueve.
- Aparezco en un `spawn` de la plantilla.

**Tareas técnicas**
- [ ] `AvatarSprite` reutilizable (también para remotos en E4); `LocalPlayerController` que emite `local:step`.

---

### E3-S4 · Colisiones — 2 pts

**Como** persona usuaria **quiero** no atravesar paredes ni muebles **para** que el espacio se sienta real.

**Criterios de aceptación**
- **Dado** una pared, **cuando** intento avanzar hacia ella, **entonces** el avatar gira pero no avanza.
- El controlador usa `isWalkable` de `shared/world` (la misma función que el servidor en E4).

---

### E3-S5 · Cámara, zoom y nombres — 3 pts

**Como** persona usuaria **quiero** que la cámara me siga y ver nombres sobre los avatares **para** saber dónde estoy y quién es quién.

**Criterios de aceptación**
- **Dado** que me muevo, **cuando** me acerco al borde, **entonces** la cámara me sigue con suavizado sin mostrar zonas fuera del mapa.
- **Dado** `+` / `-`, **cuando** hago zoom, **entonces** cambia entre 1×, 1,5× y 2× manteniendo la nitidez.
- **Dado** mi avatar, **cuando** se dibuja, **entonces** veo mi nombre encima con fondo legible.

---

### E3-S6 · Puente React ⇄ Phaser — 3 pts

**Como** desarrollador **quiero** un puente limpio entre React y Phaser **para** que la UI y el mundo no se acoplen.

**Criterios de aceptación**
- **Dado** la página del espacio, **cuando** salgo de ella, **entonces** el juego se destruye sin fugas de memoria ni *listeners*.
- **Dado** un botón React "Centrar en mí", **cuando** lo pulso, **entonces** la cámara se centra vía `EventBus`.
- **Dado** que el canvas tiene el foco, **cuando** pulso `Tab`, **entonces** el foco pasa a la UI.

**Tareas técnicas**
- [ ] `<WorldCanvas />`, `EventBus` tipado, `worldStore` (Zustand); patrón documentado en `features/world/README.md`.
