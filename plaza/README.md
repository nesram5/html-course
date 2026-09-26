# Plaza

A 2D virtual office (Gather-style) MVP: walk around a shared map, talk to whoever is close by
(audio/video with LiveKit) and join meeting rooms backed by Google Meet.
Product and technical plan: [`docs/virtual-office-mvp/`](../docs/virtual-office-mvp/README.md).

| Package         | Path              | What it is                                                                     |
| --------------- | ----------------- | ------------------------------------------------------------------------------ |
| `@plaza/web`    | `apps/web`        | Vite + React 19 UI and Phaser 3 world                                          |
| `@plaza/server` | `apps/server`     | Fastify 5 API, Socket.IO realtime at `/realtime`, Prisma + PostgreSQL          |
| `@plaza/shared` | `packages/shared` | zod contracts (REST + realtime), error codes, game constants, pure world logic |
| `@plaza/maps`   | `packages/maps`   | Map templates, themes, avatars and decor catalog (+ `manifest.json` schema)    |

## Requirements

- Node.js 22 (`.nvmrc`) and pnpm 10 (`corepack enable`).
- Docker (for PostgreSQL and, optionally, a local LiveKit server).

## Run locally

```bash
cd plaza
cp .env.example .env          # read the comments: Google, LiveKit and Sentry are explained there
pnpm install                  # also installs the git hooks (Husky, from the repository root)
pnpm infra:up                 # PostgreSQL 16 (add LiveKit dev server: pnpm infra:up:livekit)
pnpm db:migrate               # apply Prisma migrations to plaza_dev
pnpm db:seed                  # optional: demo user dev@plaza.local and space "oficina-demo"
pnpm dev                      # server on :3000, web on http://localhost:5173
```

The web dev server proxies `/api`, `/realtime` (WebSocket) and `/assets/maps` to the server, so the
browser only talks to `http://localhost:5173` (cookies stay first-party).

Without Google credentials, sign in with the test login (`AUTH_TEST_LOGIN=true`, never in production;
the server refuses to start with it when `NODE_ENV=production`). Google, Google Meet and LiveKit are
behind adapters (`apps/server/src/adapters`) with fake implementations for tests and local development.

If ports 5432/7880 are taken, use `PLAZA_PG_PORT=55432 pnpm infra:up` and adjust `DATABASE_URL`.

## Scripts

| Command                                                  | What it does                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm dev`                                               | Server (tsx watch) and web (Vite) in parallel                                               |
| `pnpm build`                                             | Builds every package (`shared` and `maps` to `dist/`, server with `tsc`, web with Vite)     |
| `pnpm lint` / `pnpm lint:fix`                            | ESLint 9 (typescript-eslint strict type-checked, react-hooks, jsx-a11y, architecture rules) |
| `pnpm typecheck`                                         | `tsc --noEmit` in every package and `e2e/`                                                  |
| `pnpm test`                                              | Unit + integration tests of every package, plus lint-rule verification                      |
| `pnpm test:coverage`                                     | `@plaza/shared` coverage (fails below 90 % lines)                                           |
| `pnpm test:e2e`                                          | Playwright (Chromium, fake media devices); starts its own server and web                    |
| `pnpm format` / `pnpm format:check`                      | Prettier                                                                                    |
| `pnpm db:migrate` / `db:deploy` / `db:reset` / `db:seed` | Prisma (dev migrations / apply / reset dev DB / seed)                                       |
| `pnpm infra:up` / `infra:up:livekit` / `infra:down`      | Docker Compose services in `infra/`                                                         |
| `pnpm validate:maps`                                     | Validates `packages/maps` (manifest, files; map geometry from E2-S1)                        |

### Databases

- `plaza_dev`: development (`DATABASE_URL`).
- `plaza_test`: integration tests (`TEST_DATABASE_URL`, default `postgresql://postgres@localhost:5432/plaza_test`).
  Created and migrated with `prisma migrate deploy` before each run; tests empty the tables with
  `resetDatabase()`. If you edit a migration locally, drop `plaza_test` by hand.
- `plaza_e2e`: Playwright (`E2E_DATABASE_URL`).

## Conventions for contributors

Read [`docs/virtual-office-mvp/03-estandares-codigo.md`](../docs/virtual-office-mvp/03-estandares-codigo.md).
Code, identifiers, comments and commits in English; UI texts in Spanish through i18n.

- **Contracts first.** Every REST endpoint and realtime event has its zod schema in
  `packages/shared/src/contracts/{http,realtime}` (all MVP contracts already exist). REST paths live in
  `API_PATHS`; build URLs with `apiPath()`. Incompatible realtime change ⇒ bump `PROTOCOL_VERSION`.
- **Workspace packages** are consumed from their TypeScript sources through the `@plaza/source`
  export condition (TypeScript `customConditions`, Vite/Vitest `resolve.conditions`, `tsx --conditions`).
  Production builds use the compiled `dist/`.
- **Server modules**: `apps/server/src/modules/<name>/index.ts` exports a `PlazaModule`; register it with
  one line in `modules/index.ts`. See [`apps/server/src/modules/README.md`](apps/server/src/modules/README.md).
  Socket handlers always go through `safeHandler` (validation, `PROTOCOL_MISMATCH`, error reporting).
- **Web features**: `apps/web/src/features/<name>/` with a public `index.ts` exporting
  `<name>Routes` (mounted by `app/routes.tsx`) and `<name>Messages` (i18n namespace `<name>`,
  texts in `features/<name>/i18n/es.json`). Import other features only through their `index.ts`.
  Only `features/world` imports Phaser and only `features/media` imports `livekit-client`.
- **Database**: the Prisma schema already contains the whole MVP data model (architecture §7 + E9 +
  product events). Prefer not to add migrations; if one is unavoidable, create it with `pnpm db:migrate`.
- **Commits**: Conventional Commits (`feat(world): ...`), checked by commitlint. The pre-commit hook runs
  ESLint and Prettier on staged files under `plaza/`. Both hooks only act on commits that touch `plaza/`.

## Status

| Stage                  | Status                     |
| ---------------------- | -------------------------- |
| E0 Foundations (S1–S6) | Done                       |
| E0-S7 LiveKit spike    | Deferred to E5 (see below) |

E0-S7 (throwaway LiveKit proximity spike) was not built; its questions (latency, selective
subscription, `mutePublishedTrack`) are answered by E5-S1..S5 and E6-S3 tests against the local
LiveKit dev server.
