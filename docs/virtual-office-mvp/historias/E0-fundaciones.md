# E0 · Fundaciones

| Campo | Valor |
|---|---|
| Objetivo | Base técnica mínima (monorepo, tooling, CI, entorno local) y validar el riesgo técnico principal |
| Depende de | — |
| Cubre | Base de RNF-08, RNF-09, RNF-10; riesgo de RF-08 |
| Puntos | 18 |
| Sprint | 1 |
| Resultado demostrable | Un clon nuevo se levanta con `pnpm i && pnpm dev`; CI en verde; vídeo del *spike* con dos navegadores conectándose por proximidad vía LiveKit Cloud |

---

### E0-S1 · Monorepo con pnpm workspaces — 2 pts

**Como** desarrollador **quiero** un monorepo con `apps/web`, `apps/server`, `packages/shared` y `packages/maps` **para** compartir código y tipos sin publicar paquetes.

**Criterios de aceptación**
- **Dado** un clon nuevo, **cuando** ejecuto `pnpm install && pnpm -r build`, **entonces** todo compila sin errores.
- **Dado** `@plaza/shared`, **cuando** lo importo desde `web` y `server`, **entonces** los tipos se resuelven sin pasos de publicación.

**Tareas técnicas**
- [ ] `pnpm-workspace.yaml`, `tsconfig.base.json` (estándares §2), `.nvmrc`, `.editorconfig`.
- [ ] Scripts raíz: `dev`, `build`, `lint`, `typecheck`, `test`.

---

### E0-S2 · Lint, formato y *hooks* — 2 pts

**Como** equipo **queremos** reglas automáticas de estilo **para** no discutirlas en los PR.

**Criterios de aceptación**
- **Dado** un archivo con `any` o sin formato, **cuando** hago commit, **entonces** el *hook* lo rechaza o lo corrige.
- **Dado** un mensaje que no sigue Conventional Commits, **cuando** hago commit, **entonces** se rechaza.
- **Dado** un import de `react`, `phaser` o `node:*` en `packages/shared`, **cuando** corre el lint, **entonces** falla.

**Tareas técnicas**
- [ ] ESLint 9 *flat config* (`typescript-eslint` estricto, `jsx-a11y`, `react-hooks`), Prettier, Husky + lint-staged, commitlint.

---

### E0-S3 · Esqueleto del servidor — 3 pts

**Como** desarrollador **quiero** Fastify con configuración, logs y errores **para** construir los módulos sobre una base común.

**Criterios de aceptación**
- **Dado** que falta una variable de entorno, **cuando** arranco, **entonces** el proceso no arranca y el log dice cuál.
- **Dado** el servidor, **cuando** llamo a `GET /api/health`, **entonces** responde `200 { status: "ok", version }`.
- **Dado** un error no controlado, **cuando** ocurre, **entonces** se responde `500 { error: { code: "INTERNAL" } }` y el error llega a Sentry.

**Tareas técnicas**
- [ ] `platform/{config,logger,errors}.ts`, `container.ts`, carpeta `adapters/` con las interfaces (`IdentityProvider`, `MeetingProvider`, `MediaProvider`).
- [ ] `@fastify/helmet`, `@fastify/cookie`; Socket.IO montado en `/realtime`; Sentry.

---

### E0-S4 · Esqueleto del frontend — 3 pts

**Como** desarrollador **quiero** una app React base **para** empezar a construir pantallas.

**Criterios de aceptación**
- **Dado** `pnpm dev`, **cuando** abro la app, **entonces** veo la página de inicio con textos desde `es.json`.
- **Dado** una ruta inexistente, **cuando** navego a ella, **entonces** veo un 404.
- **Dado** una llamada a `/api/*`, **cuando** estoy en local, **entonces** Vite hace *proxy* al servidor.

**Tareas técnicas**
- [ ] Vite + React 19 + React Router + TanStack Query + Zustand + Tailwind + i18next + Sentry.
- [ ] Estructura `app/`, `features/`, `shared/`; cliente `fetch` tipado; *error boundary* y *toasts*.

---

### E0-S5 · Entorno local y servicios externos — 2 pts

**Como** desarrollador **quiero** Postgres con un comando y las credenciales de desarrollo documentadas **para** no configurar nada a mano.

**Criterios de aceptación**
- **Dado** Docker, **cuando** ejecuto `pnpm infra:up && pnpm db:migrate`, **entonces** Postgres está listo con las migraciones aplicadas.
- **Dado** `.env.example`, **cuando** lo leo, **entonces** explica cómo obtener el cliente OAuth de Google (desarrollo), el proyecto de LiveKit Cloud (desarrollo) y el DSN de Sentry.

**Tareas técnicas**
- [ ] `infra/docker-compose.yml` (solo Postgres), Prisma inicializado, *seed*.
- [ ] Proyecto de Google Cloud "plaza-dev" con la API de Meet habilitada y la pantalla de consentimiento en modo de pruebas.

---

### E0-S6 · Pipeline de CI — 3 pts

**Como** equipo **queremos** validar cada PR automáticamente **para** mantener `main` desplegable.

**Criterios de aceptación**
- **Dado** un PR, **cuando** se abre o actualiza, **entonces** corren `lint`, `typecheck`, `test` y `build`, y no se puede fusionar si fallan.

**Tareas técnicas**
- [ ] `.github/workflows/ci.yml` con caché de pnpm y servicio Postgres; protección de `main`; Renovate o Dependabot.

---

### E0-S7 · *Spike*: proximidad con LiveKit Cloud — 3 pts (limitado a 3 días)

**Como** equipo **queremos** un prototipo desechable de suscripción selectiva con LiveKit Cloud **para** confirmar el [ADR-003](../02-arquitectura.md#adr-003--charla-de-pasillo-con-livekit-cloud) antes de construir encima.

**Criterios de aceptación**
- **Dado** dos pestañas con dos cuadrados movibles en un canvas, **cuando** se acercan a < 3 casillas, **entonces** se ven y oyen en < 1,5 s; al alejarse, se corta.
- **Dado** que uno "entra en una sala", **cuando** el servidor llama a `mutePublishedTrack`, **entonces** el otro deja de oírle aunque siga suscrito.
- Resultado en `docs/spikes/E0-S7-livekit.md` (latencias, coste estimado por minuto, recomendación).
