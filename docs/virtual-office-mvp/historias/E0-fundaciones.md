# E0 · Fundaciones

| Campo | Valor |
|---|---|
| Objetivo | Dejar lista la base técnica (monorepo, tooling, CI, entorno local) y validar el mayor riesgo técnico |
| Depende de | — |
| Cubre | Base de RNF-08, RNF-09, RNF-10; riesgo de RF-08 |
| Puntos | 22 |
| Sprint | 1 |
| Resultado demostrable | Un clon nuevo del repo se levanta con `pnpm i && pnpm dev`; CI en verde; vídeo del *spike* con dos navegadores conectándose por proximidad |

---

### E0-S1 · Monorepo con pnpm y Turborepo — 3 pts · Must

**Como** desarrollador **quiero** un monorepo con `apps/*` y `packages/*` **para** compartir código y tipos sin publicar paquetes.

**Criterios de aceptación**
- **Dado** un clon nuevo, **cuando** ejecuto `pnpm install && pnpm build`, **entonces** compilan `web`, `server`, `shared`, `world-core` y `maps` sin errores.
- **Dado** un cambio solo en `apps/web`, **cuando** ejecuto `pnpm turbo test`, **entonces** Turborepo reutiliza la caché de los paquetes no afectados.

**Tareas técnicas**
- [ ] `pnpm-workspace.yaml`, `turbo.json` (tareas `build`, `dev`, `lint`, `typecheck`, `test`).
- [ ] `packages/config` con `tsconfig.base.json` (ver estándares §2) y *presets* para Node y React.
- [ ] `.nvmrc` (Node 22), `packageManager` fijado, `.editorconfig`.
- [ ] Alias de paquetes: `@plaza/shared`, `@plaza/world-core`, `@plaza/maps`.

---

### E0-S2 · Lint, formato y *hooks* — 2 pts · Must

**Como** equipo **queremos** reglas automáticas de estilo y calidad **para** no discutirlas en los PR.

**Criterios de aceptación**
- **Dado** un archivo con `any` o sin formatear, **cuando** hago commit, **entonces** el *hook* lo rechaza o lo corrige.
- **Dado** un mensaje de commit que no sigue Conventional Commits, **cuando** hago commit, **entonces** commitlint lo rechaza.

**Tareas técnicas**
- [ ] ESLint 9 *flat config* compartida (`typescript-eslint` `strictTypeChecked`, `import`, `jsx-a11y`, `react-hooks`).
- [ ] Prettier + `lint-staged` + Husky (`pre-commit`, `commit-msg`).
- [ ] Scripts raíz: `lint`, `format`, `typecheck`.

---

### E0-S3 · Esqueleto del servidor — 3 pts · Must

**Como** desarrollador **quiero** un servidor Fastify con configuración, logs y manejo de errores **para** construir los módulos sobre una base común.

**Criterios de aceptación**
- **Dado** que falta una variable de entorno obligatoria, **cuando** arranco el servidor, **entonces** no arranca y el log indica cuál falta.
- **Dado** el servidor arrancado, **cuando** llamo a `GET /api/health`, **entonces** responde `200 { status: "ok", version }`.
- **Dado** un error no controlado en una ruta, **cuando** ocurre, **entonces** la respuesta es `500 { error: { code: "INTERNAL" } }` y el log incluye `requestId` y la traza.

**Tareas técnicas**
- [ ] `platform/config.ts` (zod sobre `process.env`), `platform/logger.ts` (pino), `platform/errors.ts` (`AppError` + *handler*).
- [ ] `container.ts` para inyección manual de dependencias.
- [ ] `@fastify/helmet`, `@fastify/cookie`, `@fastify/rate-limit` registrados (configuración mínima).
- [ ] Socket.IO montado en `/realtime` (sin eventos aún).

---

### E0-S4 · Esqueleto del frontend — 3 pts · Must

**Como** desarrollador **quiero** una app React base con router, estilos e i18n **para** empezar a construir pantallas.

**Criterios de aceptación**
- **Dado** `pnpm dev`, **cuando** abro `http://localhost:5173`, **entonces** veo la página de inicio traducida desde `es.json`.
- **Dado** una ruta inexistente, **cuando** navego a ella, **entonces** veo una página 404.
- **Dado** que el frontend llama a `/api/*`, **cuando** estoy en local, **entonces** Vite hace *proxy* al servidor.

**Tareas técnicas**
- [ ] Vite + React 19 + React Router + TanStack Query + Zustand + Tailwind + i18next.
- [ ] Estructura `app/`, `features/`, `shared/` (ver arquitectura §4).
- [ ] Cliente `fetch` tipado base (`shared/api/http.ts`) con manejo de `{ error: { code } }`.
- [ ] *Error boundary* global y componente de *toast*.

---

### E0-S5 · Entorno local con Docker Compose y Prisma — 3 pts · Must

**Como** desarrollador **quiero** levantar Postgres y LiveKit con un comando **para** no instalar servicios a mano.

**Criterios de aceptación**
- **Dado** Docker instalado, **cuando** ejecuto `pnpm infra:up`, **entonces** Postgres 16 y LiveKit (modo dev) quedan disponibles.
- **Dado** la BD vacía, **cuando** ejecuto `pnpm db:migrate`, **entonces** se aplican las migraciones de Prisma.

**Tareas técnicas**
- [ ] `infra/docker-compose.yml`, `infra/livekit.yaml` (claves de desarrollo), `.env.example`.
- [ ] Prisma inicializado en `apps/server/prisma`, primera migración vacía, *seed* de desarrollo.
- [ ] Documentar el arranque en el README raíz.

---

### E0-S6 · Pipeline de CI — 3 pts · Must

**Como** equipo **queremos** que cada PR se valide automáticamente **para** mantener `main` siempre desplegable.

**Criterios de aceptación**
- **Dado** un PR, **cuando** se abre o actualiza, **entonces** se ejecutan `lint`, `typecheck`, `test` y `build`, y el PR no se puede fusionar si fallan.
- **Dado** que no cambió nada en un paquete, **cuando** corre el CI, **entonces** su tarea sale de caché.

**Tareas técnicas**
- [ ] `.github/workflows/ci.yml` con caché de pnpm y Turborepo; servicio Postgres para tests de integración.
- [ ] Protección de rama `main` (CI obligatorio + 1 revisión).
- [ ] Dependabot/Renovate semanal.

---

### E0-S7 · Paquetes `shared` y `world-core` iniciales — 2 pts · Must

**Como** desarrollador **quiero** los paquetes de contratos y de lógica pura creados con su primer test **para** que todo el código compartido tenga un lugar desde el día uno.

**Criterios de aceptación**
- **Dado** `@plaza/shared`, **cuando** lo importo en `web` y `server`, **entonces** tengo `PROTOCOL_VERSION` y las constantes de juego (`TILE_SIZE`, `PROXIMITY_RADIUS`, …).
- **Dado** `@plaza/world-core`, **cuando** ejecuto sus tests, **entonces** pasan y la cobertura se reporta.

**Tareas técnicas**
- [ ] `shared/src/{constants,http,realtime,errors}/index.ts`.
- [ ] `world-core/src/geometry.ts` con `distance()` + test.
- [ ] Regla ESLint que prohíba importar `react`, `phaser`, `node:*` en `shared` y `world-core`.

---

### E0-S8 · *Spike*: A/V por proximidad con LiveKit — 3 pts · Must (limitado a 3 días)

**Como** equipo **queremos** validar con un prototipo desechable que LiveKit con suscripciones selectivas funciona **para** confirmar el [ADR-003](../02-arquitectura.md#adr-003--medios-sfu-livekit-con-suscripción-controlada-por-el-servidor) antes de construir encima.

**Criterios de aceptación**
- **Dado** dos pestañas con dos cuadrados movibles en un canvas, **cuando** se acercan a < 3 casillas, **entonces** cada una ve y oye a la otra en < 1,5 s; **cuando** se alejan, se corta.
- **Dado** una tercera pestaña que intenta suscribirse a una pista no permitida, **cuando** lo intenta, **entonces** LiveKit lo rechaza gracias a `setTrackSubscriptionPermissions`.
- Resultado documentado en `docs/spikes/E0-S8-livekit.md` (latencias medidas, problemas, recomendación).

**Tareas técnicas**
- [ ] Prototipo en `spikes/` (fuera de `apps/`), sin tests ni estándares completos.
- [ ] Endpoint mínimo para emitir tokens con `livekit-server-sdk`.
- [ ] Medir tiempo "entrar en rango → primer *frame*".
