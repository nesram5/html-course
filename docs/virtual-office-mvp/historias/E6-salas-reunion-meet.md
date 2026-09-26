# E6 · Salas de reunión con Google Meet

| Campo | Valor |
|---|---|
| Objetivo | Reuniones dentro de la oficina: entrar en una sala del mapa te aísla del pasillo y te lleva a su Google Meet |
| Depende de | E5 (y E2-S7 para los enlaces de Meet) |
| Cubre | RF-10, RN-03, RNF-06, métrica O6 |
| Puntos | 12 |
| Sprint | 4 |
| Resultado demostrable | Sam y Jeff entran en la "Sala de reuniones": el pasillo deja de oírles, pulsan "Unirse a la reunión" y siguen en Meet con pantalla compartida; desde fuera se ve que la sala está ocupada |

---

### E6-S1 · Sala actual en el estado del jugador — 2 pts

**Como** desarrollador **quiero** saber en qué sala está cada persona **para** aplicar RN-03 y mostrarlo en el mapa.

**Criterios de aceptación**
- **Dado** que una persona pisa una casilla de una sala, **cuando** el servidor acepta el paso, **entonces** `roomId` se actualiza y llega a todos en `world:delta`.
- **Dado** que sale, **cuando** pisa fuera, **entonces** `roomId` vuelve a `null`.

---

### E6-S2 · Entrar y salir de una sala — 5 pts

**Como** persona usuaria **quiero** que al entrar en una sala se corte el pasillo y tenga a mano la reunión **para** reunirme sin buscar enlaces.

**Criterios de aceptación**
- **Dado** que entro en "Sala 1", **cuando** piso la primera casilla, **entonces** veo la tarjeta "Estás en Sala 1 · 2 personas dentro · **Unirse a la reunión**" y se cortan mis conexiones de pasillo (`media:peers` vacío).
- **Dado** la tarjeta, **cuando** pulso "Unirse a la reunión", **entonces** el Meet de la sala se abre en una pestaña nueva (`noopener`) y mis micro y cámara de Plaza quedan apagados para no duplicar el audio.
- **Dado** que salgo de la sala, **cuando** piso el pasillo, **entonces** la tarjeta desaparece y mis medios de Plaza vuelven al estado que tenían antes de entrar.
- **Dado** que la sala no tiene enlace de Meet, **cuando** entro, **entonces** la tarjeta lo indica y, si soy *owner*, me ofrece añadirlo.
- Se registran los eventos `room_entered` y `room_meet_opened` para la métrica O6.

**Tareas técnicas**
- [ ] `features/rooms/RoomCard.tsx`; el `MediaController` guarda y restaura el estado de micro y cámara.

---

### E6-S3 · Garantía en el servidor al entrar en una sala — 3 pts

**Como** responsable de privacidad **quiero** que el servidor silencie las pistas de pasillo de quien entra en una sala **para** que nadie del pasillo le oiga aunque su cliente falle (RNF-06).

**Criterios de aceptación**
- **Dado** que una persona entra en una sala, **cuando** el servidor calcula `roomId`, **entonces** llama a `mutePublishedTrack` en LiveKit para su audio y su vídeo en < 500 ms.
- **Dado** un cliente modificado que no apaga sus medios al entrar, **cuando** se prueba, **entonces** nadie del pasillo recibe su audio (test de integración con un cliente LiveKit en Node).
- **Dado** que sale de la sala, **cuando** vuelve al pasillo, **entonces** es su cliente quien reactiva los medios (el servidor no reactiva a distancia).

---

### E6-S4 · Presencia de las salas en el mapa — 2 pts

**Como** persona usuaria **quiero** ver desde fuera quién está en cada sala **para** saber si puedo entrar o si hay una reunión.

**Criterios de aceptación**
- **Dado** una sala con personas dentro, **cuando** la miro desde el pasillo, **entonces** veo sus avatares con un icono de reunión y la sala con un tono distinto.
- **Dado** la lista de miembros (E7-S2), **cuando** la abro, **entonces** cada persona muestra "En Sala 1" si está en una sala.
