# E1 · Login con Google y perfil

| Campo                 | Valor                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| Objetivo              | Que cada persona entre con su cuenta de Google y elija cómo se ve en el mapa          |
| Depende de            | E0                                                                                    |
| Cubre                 | RF-01, RF-02, RNF-05                                                                  |
| Puntos                | 12                                                                                    |
| Sprint                | 1                                                                                     |
| Resultado demostrable | En _staging_: "Entrar con Google", ver mi nombre y foto, elegir avatar, cerrar sesión |

## Contratos nuevos

| Método          | Ruta                           | Descripción                                                              |
| --------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `GET`           | `/api/auth/google?next=<ruta>` | Inicia OAuth (PKCE + `state`) y redirige a Google                        |
| `GET`           | `/api/auth/google/callback`    | Verifica, crea o actualiza el usuario, crea la sesión, redirige a `next` |
| `POST`          | `/api/auth/logout`             | `204`, borra cookie y sesión                                             |
| `GET` / `PATCH` | `/api/me`                      | Mi usuario / `{ displayName?, avatarId? }`                               |
| `GET`           | `/api/avatars`                 | Catálogo de avatares                                                     |

---

### E1-S1 · Modelo de usuario y sesión — 2 pts

**Como** desarrollador **quiero** las tablas `User` (por `googleSub`) y `Session` **para** persistir identidades y sesiones.

**Criterios de aceptación**

- **Dado** dos logins de la misma cuenta de Google, **cuando** se procesan, **entonces** existe un solo `User` (clave `googleSub`) con el email actualizado.
- **Dado** un usuario borrado, **cuando** se elimina, **entonces** sus sesiones se borran en cascada.

---

### E1-S2 · Flujo OAuth con Google y sesión — 5 pts

**Como** persona usuaria **quiero** entrar con mi cuenta de Google **para** no crear ni recordar otra contraseña.

**Criterios de aceptación**

- **Dado** que pulso "Entrar con Google", **cuando** acepto en Google, **entonces** vuelvo a Bululu con la cookie `bululu_sid` (`HttpOnly`, `Secure`, `SameSite=Lax`) y en la ruta `next` original.
- **Dado** un `state` alterado o un `id_token` con audiencia, emisor o caducidad incorrectos, **cuando** llega el _callback_, **entonces** se rechaza con `401` y se registra.
- **Dado** que la primera vez entro, **cuando** se crea mi usuario, **entonces** mi nombre visible es mi nombre de Google.
- **Dado** que cierro sesión, **cuando** reutilizo la cookie, **entonces** recibo `401`.
- No se guarda ningún _token_ de Google; solo `sub`, email y nombre.
- **Dado** `AUTH_TEST_LOGIN=true` (solo CI y local), **cuando** llamo a `/api/auth/test-login`, **entonces** se crea una sesión de prueba; con `NODE_ENV=production` el servidor no arranca si la variable está activa.

**Tareas técnicas**

- [ ] `adapters/google-oidc.ts` (`@fastify/oauth2` + `google-auth-library`) detrás de la interfaz `IdentityProvider`.
- [ ] `requireUser` para rutas Fastify **y** para el _handshake_ de Socket.IO.
- [ ] Tests de integración con un `IdentityProvider` falso.

---

### E1-S3 · Pantalla de entrada y rutas protegidas — 2 pts

**Como** persona usuaria **quiero** una entrada de un solo botón **para** estar dentro en segundos.

**Criterios de aceptación**

- **Dado** que no tengo sesión, **cuando** visito una ruta protegida, **entonces** veo la página de entrada con "Entrar con Google" y, tras entrar, vuelvo a la ruta original.
- **Dado** que cancelo en Google, **cuando** vuelvo, **entonces** veo "No se completó el inicio de sesión" y puedo reintentar.

**Tareas técnicas**

- [ ] `features/auth`: `LoginPage`, `useSession` (TanStack Query sobre `/api/me`), `RequireAuth`.

---

### E1-S4 · Perfil: nombre visible y avatar — 3 pts

**Como** persona usuaria **quiero** elegir mi avatar y ajustar mi nombre **para** que me reconozcan en el mapa.

**Criterios de aceptación**

- **Dado** el selector, **cuando** lo abro, **entonces** veo al menos 8 avatares con su animación de caminar.
- **Dado** que elijo avatar y cambio mi nombre, **cuando** recargo, **entonces** se mantienen.
- **Dado** un `avatarId` inexistente, **cuando** llamo a `PATCH /api/me`, **entonces** recibo `400`.
- La primera vez que entro a un espacio sin avatar elegido, se me muestra el selector antes del mapa.

**Tareas técnicas**

- [ ] Catálogo de sprites CC0 (4 direcciones × 3 _frames_) en `packages/maps/avatars/` con `manifest.json`.
- [ ] `ProfilePage` + `AvatarPicker`.
