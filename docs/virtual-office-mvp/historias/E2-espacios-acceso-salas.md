# E2 · Espacios, acceso y salas de Meet

| Campo | Valor |
|---|---|
| Objetivo | Crear oficinas a partir de plantillas, dar acceso al equipo y crear las salas de Google Meet |
| Depende de | E1 (E3-S1 para leer las salas del mapa) |
| Cubre | RF-03, RF-04, RF-10 (creación de salas), RN-08 |
| Puntos | 24 |
| Sprints | 1–2 |
| Resultado demostrable | Ana crea "Oficina Acme", autoriza a Google y el espacio queda con 3 salas de Meet; Luis entra con el enlace en < 30 s |

## Contratos nuevos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/map-templates` | Plantillas (id, nombre, miniatura, número de salas) |
| `GET` / `POST` | `/api/spaces` | Mis espacios / `{ name, mapTemplateId }` → `201 { space }` |
| `GET` | `/api/spaces/:spaceId` | Detalle, incluidas las salas (solo miembros) |
| `POST` | `/api/spaces/:spaceId/invite-link` | Regenera el enlace (solo *owner*) → `{ url }` |
| `PATCH` | `/api/spaces/:spaceId` | `{ allowedDomain? }` (solo *owner*) |
| `GET` / `DELETE` | `/api/spaces/:spaceId/members[/:userId]` | Miembros / expulsar (solo *owner*) |
| `GET` / `POST` | `/api/join/:token` | Vista previa pública / unirse (requiere sesión) |
| `POST` | `/api/spaces/:spaceId/rooms/authorize` | Inicia la autorización de Google para crear las salas de Meet |
| `PUT` | `/api/spaces/:spaceId/rooms/:areaId` | `{ meetUri }` sustituir el enlace a mano (solo *owner*) |

---

### E2-S1 · Plantillas de mapa y validación — 5 pts

**Como** administradora **quiero** elegir entre plantillas de oficina **para** no tener que dibujar un mapa.

**Criterios de aceptación**
- **Dado** `packages/maps`, **cuando** reviso el `manifest.json`, **entonces** hay 2 plantillas: "Oficina pequeña" (≈ 40×30 casillas, 1 sala) y "Campus" (≈ 80×60, 3 salas), cada una con miniatura y al menos 2 `spawns`.
- **Dado** un mapa sin la capa `collision`, con una sala no rectangular o sin `areaId`, **cuando** corre `pnpm validate:maps` en CI, **entonces** falla indicando el problema.
- Cada plantilla genera su estilo `pixel` (`below.png` / `above.png`) en el *build* con `tmxrasterizer`; los demás estilos llegan en E9-S1.
  *Implementado así:* un generador propio en TypeScript (`pnpm --filter @plaza/maps generate`) rasteriza las capas de *tiles* y los PNG se versionan; un test falla si no coinciden con lo que genera. Si un mapa se edita a mano en Tiled, hay que volver a ejecutar el generador (ver `plaza/packages/maps/README.md`).

**Tareas técnicas**
- [ ] Mapas en Tiled con *tilesets* CC0 (licencias en `packages/maps/LICENSES.md`).
- [ ] `validate-maps.ts` (usa `parseMap` de E3-S1).

---

### E2-S2 · Crear espacio (API) — 3 pts

**Como** persona usuaria **quiero** crear un espacio **para** tener la oficina de mi equipo.

**Criterios de aceptación**
- **Dado** un nombre y una plantilla válidos, **cuando** creo el espacio, **entonces** se crea con `slug` único, un enlace de invitación y yo como `OWNER`.
- **Dado** una plantilla inexistente, **cuando** lo creo, **entonces** recibo `400 UNKNOWN_MAP_TEMPLATE`.
- **Dado** un no miembro, **cuando** pide `GET /api/spaces/:id`, **entonces** recibe `404`.

**Tareas técnicas**
- [ ] Modelos `Space`, `Membership`; creación en transacción; guardas `assertMember` y `assertOwner`.

---

### E2-S3 · "Mis espacios" y asistente de creación — 3 pts

**Como** persona usuaria **quiero** ver mis espacios y crear uno en dos pasos **para** empezar rápido.

**Criterios de aceptación**
- **Dado** `/spaces`, **cuando** entro, **entonces** veo mis espacios con miniatura y "Entrar", o un estado vacío que invita a crear uno.
- **Dado** el asistente, **cuando** elijo nombre y plantilla, **entonces** se crea el espacio y paso al paso "Crear salas de reunión" (E2-S7).

---

### E2-S4 · Enlace de invitación y dominio permitido — 3 pts

**Como** administradora **quiero** un enlace para invitar y, opcionalmente, dejar entrar a todo mi dominio **para** que el equipo entre sin fricción.

**Criterios de aceptación**
- **Dado** que soy *owner*, **cuando** pulso "Copiar enlace", **entonces** copio `/join/<token>`.
- **Dado** que pulso "Regenerar enlace", **cuando** confirmo, **entonces** el enlace anterior deja de funcionar ("Esta invitación ya no es válida").
- **Dado** que configuro `allowedDomain = "acme.com"`, **cuando** alguien con email verificado `@acme.com` abre la URL del espacio, **entonces** entra como miembro sin enlace de invitación.
- **Dado** que soy *member*, **cuando** intento regenerar o cambiar el dominio, **entonces** recibo `403`.
- En BD solo se guarda el hash del token.

---

### E2-S5 · Unirse a un espacio — 3 pts

**Como** persona invitada **quiero** abrir el enlace y entrar **para** unirme a mi equipo en menos de 30 s (O5).

**Criterios de aceptación**
- **Dado** que no tengo sesión, **cuando** abro `/join/<token>`, **entonces** veo el nombre del espacio y "Entrar con Google", y tras entrar se me une automáticamente.
- **Dado** que ya soy miembro, **cuando** abro el enlace, **entonces** simplemente entro (idempotente).
- Test E2E: enlace → login de prueba → dentro del espacio.

---

### E2-S6 · Gestión de miembros — 2 pts

**Como** administradora **quiero** ver y expulsar miembros **para** mantener el espacio seguro.

**Criterios de aceptación**
- **Dado** que soy *owner*, **cuando** abro "Miembros", **entonces** veo nombre, avatar, email y rol.
- **Dado** que expulso a alguien, **cuando** confirmo, **entonces** pierde el acceso al instante (en E4 también se le desconecta con `space:kicked`).
- **Dado** que soy el único *owner*, **cuando** intento expulsarme, **entonces** no se permite.

---

### E2-S7 · Crear las salas de Google Meet — 5 pts

**Como** administradora **quiero** que cada sala del mapa tenga su propio Google Meet permanente **para** que mi equipo tenga salas de reunión listas sin crear enlaces a mano.

**Criterios de aceptación**
- **Dado** un espacio recién creado, **cuando** pulso "Crear salas de reunión", **entonces** Google me pide permiso para crear reuniones (*scope* `meetings.space.created`) y, al aceptar, se crea un Meet por cada sala del mapa con acceso `TRUSTED`.
- **Dado** que se crearon, **cuando** abro los ajustes del espacio, **entonces** veo cada sala con su enlace de Meet y un botón "Probar".
- **Dado** que rechazo el permiso o Google falla, **cuando** vuelvo, **entonces** puedo reintentar o **pegar un enlace de Meet a mano** para cada sala (`source: "manual"`); el espacio funciona igualmente.
- **Dado** un enlace pegado a mano, **cuando** lo guardo, **entonces** se valida que empiece por `https://meet.google.com/`.
- Plaza **no guarda** el *token* de Google: se usa en la petición y se descarta (verificado en la revisión de código).

**Tareas técnicas**
- [ ] `adapters/google-meet.ts` (`POST https://meet.googleapis.com/v2/spaces`) detrás de `MeetingProvider`; autorización incremental reutilizando el flujo OAuth de E1-S2.
- [ ] Modelo `MeetingRoom`; `RoomService.createAll(spaceId)` idempotente (no duplica salas si se reintenta).
- [ ] Tests con un `MeetingProvider` falso.
