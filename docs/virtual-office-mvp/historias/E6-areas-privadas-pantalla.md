# E6 · Áreas privadas, compartir pantalla y *spotlight*

| Campo | Valor |
|---|---|
| Objetivo | Reuniones dentro del mapa: salas aisladas, presentaciones con pantalla compartida y anuncios a todo el espacio |
| Depende de | E5 |
| Cubre | RF-10, RF-11, RF-20 (Should), RN-03, RN-07, RN-11, RNF-06 |
| Puntos | 29 (24 Must + 5 Should) |
| Sprints | 4–6 |
| Resultado demostrable | Una reunión en la "Sala de reuniones" que no se oye desde fuera, con una presentación compartida; en la azotea, alguien sube a la tarima y le escucha todo el espacio |

---

### E6-S1 · Áreas en `world-core` y en el estado del jugador — 3 pts · Must

**Como** desarrollador **quiero** saber en qué área está cada jugador **para** aplicar las reglas de privacidad y *spotlight*.

**Criterios de aceptación**
- **Dado** un jugador que pisa una casilla de un área, **cuando** el servidor acepta el movimiento, **entonces** `PlayerState.areaId` (o `onSpotlight`) se actualiza y se incluye en `world:delta`.
- **Dado** áreas solapadas en el mapa, **cuando** se valida el mapa, **entonces** `validate:maps` falla (no se permiten solapes en el MVP).

**Tareas técnicas**
- [ ] Usar el `areaIndex` precalculado (E3-S1) para búsqueda O(1).
- [ ] Tests con polígonos no rectangulares.

---

### E6-S2 · Regla de áreas privadas en el motor — 3 pts · Must

**Como** persona en una reunión **quiero** que solo me oigan quienes están en la sala **para** hablar con confidencialidad.

**Criterios de aceptación**
- **Dado** A y B dentro del área "Sala 1" en extremos opuestos (a 10 casillas), **cuando** se calcula el grafo, **entonces** están conectados (RN-03).
- **Dado** A dentro de "Sala 1" y C justo fuera, pegado a la pared (a 1 casilla), **cuando** se calcula, **entonces** **no** están conectados.
- **Dado** B en estado `busy` dentro de "Sala 1", **cuando** entra A, **entonces** sí se conectan (RN-04).
- Test de propiedades: para cualquier configuración aleatoria, nadie fuera de un área está en `audience` de alguien de dentro.

**Tareas técnicas**
- [ ] Extender `computeMediaGraph` (paso 2 del algoritmo).

---

### E6-S3 · Señales visuales de área — 3 pts · Must

**Como** persona usuaria **quiero** saber cuándo entro o salgo de un espacio privado **para** no llevarme sorpresas.

**Criterios de aceptación**
- **Dado** que entro en un área, **cuando** piso la primera casilla, **entonces** veo el aviso "Has entrado en un espacio privado: Sala 1" y el resto del mapa se oscurece ligeramente.
- **Dado** que salgo, **cuando** piso fuera, **entonces** el aviso desaparece y el mapa vuelve a la normalidad.
- **Dado** el mapa, **cuando** hay personas en una sala, **entonces** desde fuera veo sus avatares pero con el globo 💬.

**Tareas técnicas**
- [ ] Capa de oscurecimiento en Phaser con una máscara del polígono del área.
- [ ] *Toast* accesible (`role="status"`).

---

### E6-S4 · Privacidad garantizada en el servidor — 5 pts · Must

**Como** responsable de privacidad **quiero** que el servidor detecte y corte cualquier suscripción no autorizada **para** que las áreas privadas no dependan de que el cliente se comporte bien (RNF-06).

**Criterios de aceptación**
- **Dado** un webhook `track_subscribed` de LiveKit para (suscriptor S, publicador P), **cuando** S ∉ `audience(P)` según el grafo actual, **entonces** el servidor revoca la suscripción con `updateSubscriptions` en < 500 ms y registra un evento de seguridad `UNAUTHORIZED_SUBSCRIPTION`.
- **Dado** un webhook con firma inválida, **cuando** llega, **entonces** se rechaza con `401`.
- **Dado** el test de privacidad del brief §11 (cliente modificado que intenta escuchar una sala), **cuando** se ejecuta, **entonces** no recibe ni un paquete de audio de la sala.

**Tareas técnicas**
- [ ] `POST /api/livekit/webhook` con `WebhookReceiver`; `MediaGuardService`.
- [ ] Test de integración con un cliente LiveKit en Node (`@livekit/rtc-node`) que intenta suscribirse sin permiso.

---

### E6-S5 · Compartir pantalla — 5 pts · Must

**Como** persona en una reunión **quiero** compartir mi pantalla **para** presentar una idea (como Mary en el vídeo).

**Criterios de aceptación**
- **Dado** que estoy conectado con alguien, **cuando** pulso el botón de pantalla de la barra inferior, **entonces** elijo pantalla, ventana o pestaña (con audio si el navegador lo permite) y la ven las personas de mi `audience`.
- **Dado** que alguien sale de mi `audience`, **cuando** ocurre, **entonces** deja de ver mi pantalla (mismo mecanismo de permisos).
- **Dado** que dejo de compartir desde el navegador, **cuando** ocurre, **entonces** el botón vuelve a su estado normal.
- **Dado** que no estoy conectado con nadie, **cuando** pulso compartir, **entonces** se me avisa de que nadie la verá (y puedo compartir igualmente).

**Tareas técnicas**
- [ ] `setScreenShareEnabled` de LiveKit; pista publicada con `source: ScreenShare`.
- [ ] Los permisos de E5-S5 se aplican a **todas** las pistas del publicador.

---

### E6-S6 · Vista ampliada de la pantalla compartida — 3 pts · Must

**Como** espectador **quiero** ver la pantalla compartida en grande **para** leer la presentación.

**Criterios de aceptación**
- **Dado** que alguien comparte, **cuando** recibo la pista, **entonces** se muestra ampliada sobre el mapa con los vídeos en una tira encima.
- **Dado** la vista ampliada, **cuando** pulso "Minimizar" o `Esc`, **entonces** vuelvo al mapa y la pantalla queda como una miniatura más.
- **Dado** la vista ampliada, **cuando** pulso "Pantalla completa", **entonces** usa la API *Fullscreen*.

**Tareas técnicas**
- [ ] `ScreenShareStage` con suscripción a la capa alta; *layout* adaptable a 16:9 y a otras proporciones.

---

### E6-S7 · Límite de participantes por conexión — 2 pts · Must

**Como** plataforma **quiero** limitar a 12 las conexiones de A/V por persona **para** proteger la CPU y la red del navegador (RN-07).

**Criterios de aceptación**
- **Dado** 15 personas en una sala, **cuando** se calcula el grafo, **entonces** cada una se conecta con 12, priorizando por orden de entrada en la sala.
- **Dado** que se alcanza el límite, **cuando** ocurre, **entonces** la UI muestra "La sala está llena de vídeo: solo verás a 12 personas".

**Tareas técnicas**
- [ ] Guardar `enteredAreaAt` por jugador para el orden de prioridad.

---

### E6-S8 · *Spotlight*: hablar a todo el espacio — 5 pts · Should

**Como** organizadora de un evento **quiero** subirme a la tarima y que me oiga todo el espacio **para** dar anuncios, como Sam en la *game night* del vídeo.

**Criterios de aceptación**
- **Dado** que piso una casilla de un área `kind: "spotlight"`, **cuando** el servidor lo acepta, **entonces** todas las personas de su alcance (todo el espacio o el área indicada) me ven y me oyen, y mi vídeo muestra un icono de megáfono.
- **Dado** el público, **cuando** estoy en *spotlight*, **entonces** yo **no** recibo automáticamente el audio de todo el público (conexión dirigida, RN-11); sí sigo conectado con quien tengo cerca.
- **Dado** que ya hay 3 personas en *spotlight*, **cuando** entra una cuarta, **entonces** no se le difunde y ve el aviso "El escenario está completo".
- **Dado** una persona en un área privada, **cuando** alguien usa un *spotlight* de alcance "espacio", **entonces** la persona de la sala **sí** lo oye (anuncio general), pero nadie de fuera oye la sala.
- Los *spotlights* no cuentan para el límite de 12 (RN-07).

**Tareas técnicas**
- [ ] Paso 4 de `computeMediaGraph` (arquitectura §10.1) con tests de propiedades.
- [ ] Vista "cuadrícula de escenario" cuando hay un *spotlight* activo.
- [ ] Añadir una tarima con *spotlight* en la plantilla "Campus".
