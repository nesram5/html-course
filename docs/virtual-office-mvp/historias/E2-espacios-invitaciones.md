# E2 · Espacios e invitaciones

| Campo | Valor |
|---|---|
| Objetivo | Crear oficinas virtuales a partir de plantillas y dar acceso a otras personas |
| Depende de | E1 |
| Cubre | RF-03, RF-04, RN-08 |
| Puntos | 22 |
| Sprint | 2 |
| Resultado demostrable | Ana crea "Oficina Acme" con la plantilla "Oficina pequeña", comparte el enlace y Luis entra como miembro |

## Contratos nuevos (`@plaza/shared/http/spaces.ts`, `invitations.ts`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/map-templates` | Lista de plantillas (id, nombre, miniatura, tamaño) |
| `GET` | `/api/spaces` | Mis espacios (con mi rol) |
| `POST` | `/api/spaces` | `{ name, mapTemplateId }` → `201 { space }` |
| `GET` | `/api/spaces/:spaceId` | Detalle (solo miembros) |
| `GET` | `/api/spaces/:spaceId/members` | Miembros y roles |
| `DELETE` | `/api/spaces/:spaceId/members/:userId` | Expulsar (solo *owner*) |
| `POST` | `/api/spaces/:spaceId/invitations` | Crear enlace (solo *owner*) → `{ url, expiresAt }` |
| `DELETE` | `/api/spaces/:spaceId/invitations/:id` | Revocar (solo *owner*) |
| `GET` | `/api/invitations/:token` | Vista previa pública: nombre del espacio y del *owner* |
| `POST` | `/api/invitations/:token/accept` | Unirse (requiere sesión) |

---

### E2-S1 · Plantillas de mapa y validación — 5 pts · Must

**Como** administradora **quiero** elegir entre plantillas de oficina bien diseñadas **para** no tener que dibujar un mapa.

**Criterios de aceptación**
- **Dado** `packages/maps`, **cuando** reviso el `manifest.json`, **entonces** hay al menos 2 plantillas: "Oficina pequeña" (≈ 40×30 casillas, 10 escritorios, 1 sala de reuniones) y "Campus" (≈ 80×60, jardín, 3 salas).
- **Dado** un mapa sin la capa `collision` o con un área sin `areaId`, **cuando** corre `pnpm validate:maps` en CI, **entonces** falla indicando el problema.
- Cada plantilla tiene miniatura PNG y al menos 2 `spawns`.

**Tareas técnicas**
- [ ] Diseñar los mapas en Tiled con *tilesets* CC0 (registrar licencias en `packages/maps/LICENSES.md`).
- [ ] Script `validate-maps.ts` (usa `parseMap` cuando exista; en este sprint, validación de estructura con zod).
- [ ] Servir los recursos estáticos del paquete desde el frontend (copiado en *build*).

---

### E2-S2 · Crear espacio (API) — 3 pts · Must

**Como** persona usuaria **quiero** crear un espacio **para** tener la oficina virtual de mi equipo.

**Criterios de aceptación**
- **Dado** un nombre válido y una plantilla existente, **cuando** creo el espacio, **entonces** se crea con un `slug` único y yo quedo como `OWNER`.
- **Dado** una plantilla inexistente, **cuando** creo el espacio, **entonces** recibo `400 UNKNOWN_MAP_TEMPLATE`.
- **Dado** un usuario no miembro, **cuando** pide `GET /api/spaces/:id`, **entonces** recibe `404` (no se revela que existe).

**Tareas técnicas**
- [ ] Modelos `Space`, `Membership`; `SpaceService.create` en transacción (espacio + membresía *owner*).
- [ ] Guardas `assertMember`, `assertOwner` reutilizables.
- [ ] `mapTemplateId` guardado como `id@version`.

---

### E2-S3 · "Mis espacios" y asistente de creación (UI) — 3 pts · Must

**Como** persona usuaria **quiero** ver mis espacios y crear uno nuevo en dos pasos **para** empezar rápido.

**Criterios de aceptación**
- **Dado** que inicio sesión, **cuando** llego a `/spaces`, **entonces** veo mis espacios con su miniatura y un botón "Entrar".
- **Dado** el asistente, **cuando** elijo nombre y plantilla (con miniatura), **entonces** se crea y me lleva a la pantalla del espacio.
- **Dado** que no tengo espacios, **cuando** llego a `/spaces`, **entonces** veo un estado vacío que invita a crear uno.

**Tareas técnicas**
- [ ] `features/spaces`: `SpacesPage`, `CreateSpaceDialog`, `TemplatePicker`.
- [ ] Ruta `/s/:slug` (de momento, un marcador de posición que se completa en E3).

---

### E2-S4 · Crear y revocar invitaciones — 3 pts · Must

**Como** administradora **quiero** generar un enlace de invitación y poder revocarlo **para** controlar quién entra.

**Criterios de aceptación**
- **Dado** que soy *owner*, **cuando** creo una invitación, **entonces** obtengo una URL `/join/<token>` que caduca en 7 días.
- **Dado** que soy *member*, **cuando** intento crear una invitación, **entonces** recibo `403`.
- **Dado** una invitación revocada o caducada, **cuando** alguien la usa, **entonces** ve "Esta invitación ya no es válida".
- En BD solo se guarda el *hash* del token.

**Tareas técnicas**
- [ ] Modelo `Invitation`; `InvitationService.create/revoke`.
- [ ] Panel "Invitar" con botón "Copiar enlace" y lista de enlaces activos.

---

### E2-S5 · Aceptar invitación — 5 pts · Must

**Como** persona invitada **quiero** abrir el enlace y entrar al espacio **para** unirme a mi equipo en menos de un minuto (O5).

**Criterios de aceptación**
- **Dado** que no tengo sesión, **cuando** abro `/join/<token>`, **entonces** veo el nombre del espacio y opciones "Registrarme" / "Iniciar sesión", y tras hacerlo vuelvo automáticamente a aceptar.
- **Dado** que tengo sesión, **cuando** acepto, **entonces** quedo como `MEMBER` y voy a `/s/:slug`.
- **Dado** que ya soy miembro, **cuando** acepto de nuevo, **entonces** simplemente entro (idempotente) y no se duplica la membresía.

**Tareas técnicas**
- [ ] `JoinPage` con flujo `next=`; `InvitationService.accept` idempotente, incrementa `uses`.
- [ ] Test E2E: invitación → registro → entrada al espacio.

---

### E2-S6 · Gestión de miembros — 3 pts · Must

**Como** administradora **quiero** ver y expulsar miembros **para** mantener el espacio seguro.

**Criterios de aceptación**
- **Dado** que soy *owner*, **cuando** abro "Miembros", **entonces** veo nombre, avatar, rol y fecha de alta.
- **Dado** que expulso a alguien, **cuando** confirmo, **entonces** pierde el acceso inmediatamente (en E4 también se le desconecta del socket con el evento `space:kicked`).
- **Dado** que soy el único *owner*, **cuando** intento expulsarme, **entonces** no se permite.

**Tareas técnicas**
- [ ] Endpoints de miembros; diálogo de confirmación.
- [ ] Publicar un evento de dominio `MemberRemoved` (lo consumirá el módulo `world` en E4).
