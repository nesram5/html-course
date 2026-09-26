# E1 · Autenticación y perfiles

| Campo | Valor |
|---|---|
| Objetivo | Que cada persona tenga una identidad segura, un nombre visible y un avatar |
| Depende de | E0 |
| Cubre | RF-01, RF-02, RNF-05 |
| Puntos | 18 |
| Sprint | 1 |
| Resultado demostrable | En *staging*: registrarse, iniciar/cerrar sesión, elegir avatar y ver el perfil tras recargar |

## Contratos nuevos (`@plaza/shared/http/auth.ts`, `users.ts`)

| Método | Ruta | Cuerpo / respuesta |
|---|---|---|
| `POST` | `/api/auth/register` | `{ email, password, displayName }` → `201 { user }` + cookie |
| `POST` | `/api/auth/login` | `{ email, password }` → `200 { user }` + cookie |
| `POST` | `/api/auth/logout` | → `204`, borra cookie y sesión |
| `GET` | `/api/me` | → `200 { user }` o `401` |
| `PATCH` | `/api/me` | `{ displayName?, avatarId? }` → `200 { user }` |
| `GET` | `/api/avatars` | → `200 { avatars: [{ id, name, spriteUrl }] }` |

---

### E1-S1 · Modelo de usuario y sesión — 2 pts · Must

**Como** desarrollador **quiero** las tablas `User` y `Session` **para** persistir identidades y sesiones.

**Criterios de aceptación**
- **Dado** la migración aplicada, **cuando** intento crear dos usuarios con el mismo email (sin distinguir mayúsculas), **entonces** la BD lo impide.
- **Dado** un usuario borrado, **cuando** se elimina, **entonces** sus sesiones se borran en cascada.

**Tareas técnicas**
- [ ] Modelos Prisma (ver arquitectura §7); email normalizado a minúsculas en el servicio.
- [ ] `UserRepository` y `SessionRepository` con interfaces.

---

### E1-S2 · Registro — 3 pts · Must

**Como** persona nueva **quiero** registrarme con email, contraseña y nombre **para** tener cuenta en Plaza.

**Criterios de aceptación**
- **Dado** datos válidos, **cuando** me registro, **entonces** se crea la cuenta, se inicia sesión (cookie) y recibo `201`.
- **Dado** un email ya registrado, **cuando** me registro, **entonces** recibo `409 EMAIL_TAKEN`.
- **Dado** una contraseña de menos de 10 caracteres o un nombre vacío, **cuando** me registro, **entonces** recibo `400 VALIDATION_ERROR` con el campo.
- La contraseña se guarda con Argon2id; nunca aparece en logs.

**Tareas técnicas**
- [ ] `AuthService.register`, *hash* con `@node-rs/argon2`.
- [ ] Tests de integración (éxito, duplicado, validaciones).

---

### E1-S3 · Inicio y cierre de sesión con cookie — 5 pts · Must

**Como** persona registrada **quiero** iniciar y cerrar sesión **para** acceder a mis espacios de forma segura.

**Criterios de aceptación**
- **Dado** credenciales correctas, **cuando** inicio sesión, **entonces** recibo la cookie `plaza_sid` (`HttpOnly`, `Secure`, `SameSite=Lax`) y `GET /api/me` devuelve mi usuario.
- **Dado** credenciales incorrectas, **cuando** inicio sesión, **entonces** recibo `401 INVALID_CREDENTIALS` sin revelar si el email existe.
- **Dado** que cierro sesión, **cuando** reutilizo la cookie antigua, **entonces** recibo `401`.
- **Dado** una sesión activa, **cuando** hago peticiones durante 30 días, **entonces** la expiración se renueva (sesión deslizante).

**Tareas técnicas**
- [ ] Token aleatorio de 32 bytes; en BD se guarda `sha256(token)`.
- [ ] `requireUser` como `preHandler` de Fastify **y** como *middleware* del *handshake* de Socket.IO (reutilizable en E4).
- [ ] Cabecera obligatoria `X-Plaza-Client` en métodos que modifican (CSRF).

---

### E1-S4 · Pantallas de registro e inicio de sesión — 3 pts · Must

**Como** persona usuaria **quiero** formularios claros de registro y login **para** entrar sin fricción.

**Criterios de aceptación**
- **Dado** que no he iniciado sesión, **cuando** visito una ruta protegida, **entonces** voy a `/login?next=<ruta>` y, tras entrar, vuelvo a la ruta original.
- **Dado** un error del servidor, **cuando** envío el formulario, **entonces** veo el mensaje traducido junto al campo o arriba del formulario.
- Formularios navegables con teclado, con `label` asociados y botón deshabilitado mientras se envía.

**Tareas técnicas**
- [ ] `features/auth`: `LoginPage`, `RegisterPage`, `useSession` (TanStack Query sobre `/api/me`), `RequireAuth`.
- [ ] Validación en cliente con los mismos esquemas zod de `shared`.
- [ ] Tests de componentes.

---

### E1-S5 · Perfil: nombre visible y avatar — 3 pts · Must

**Como** persona usuaria **quiero** elegir mi nombre y mi avatar **para** que mis compañeros me reconozcan en el mapa.

**Criterios de aceptación**
- **Dado** la pantalla de perfil, **cuando** abro el selector, **entonces** veo al menos 8 avatares con su animación de caminar en vista previa.
- **Dado** que elijo un avatar y guardo, **cuando** recargo, **entonces** se mantiene.
- **Dado** un `avatarId` que no existe en el catálogo, **cuando** llamo a `PATCH /api/me`, **entonces** recibo `400`.

**Tareas técnicas**
- [ ] Catálogo de avatares (sprites CC0, 4 direcciones × 3 *frames*) en `packages/maps/avatars/` con `manifest.json`.
- [ ] `ProfilePage` + `AvatarPicker` (vista previa con canvas o CSS `steps()`).
- [ ] Endpoint `GET /api/avatars`.

---

### E1-S6 · Protección de la autenticación — 2 pts · Must

**Como** responsable de seguridad **quiero** limitar los intentos de login **para** mitigar ataques de fuerza bruta.

**Criterios de aceptación**
- **Dado** 10 intentos fallidos desde la misma IP en 10 minutos, **cuando** hago el siguiente, **entonces** recibo `429 RATE_LIMITED`.
- **Dado** 5 intentos fallidos contra el mismo email en 10 minutos, **cuando** hago otro, **entonces** recibo `429`.

**Tareas técnicas**
- [ ] `@fastify/rate-limit` con claves por IP y por email en `/api/auth/*`.
- [ ] Tiempo de respuesta constante en login (verificar un *hash* ficticio si el email no existe).
