# Plaza

A 2D virtual office (Gather-style) MVP: walk around a shared map, talk to whoever is close by
(audio/video with LiveKit) and join meeting rooms backed by Google Meet.
Product and technical plan: [`docs/virtual-office-mvp/`](docs/virtual-office-mvp/README.md).

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
cp .env.example .env          # read the comments: Google, LiveKit and Sentry are explained there
pnpm install                  # also installs the git hooks (Husky)
pnpm infra:up:livekit        # PostgreSQL 16 + LiveKit dev server (pnpm infra:up: Postgres only)
pnpm db:migrate               # apply Prisma migrations to plaza_dev
pnpm db:seed                  # optional: demo user dev@plaza.local and space "oficina-demo"
pnpm dev                      # server on :3000, web on http://localhost:5173
```

The web dev server proxies `/api`, `/realtime` (WebSocket) and `/assets/maps` to the server, so the
browser only talks to `http://localhost:5173` (cookies stay first-party).

Without Google credentials, sign in with the test login (`AUTH_TEST_LOGIN=true`, never in production;
the server refuses to start with it when `NODE_ENV=production`). Google, Google Meet and LiveKit are
behind adapters (`apps/server/src/adapters`) with fake implementations for tests and local development.

If ports 5432/7880 are taken, use `PLAZA_PG_PORT=55432 pnpm infra:up` and adjust `DATABASE_URL`,
`TEST_DATABASE_URL` and `E2E_DATABASE_URL` in `.env` to that port.

The dev stack's Docker project is `plaza-dev` (it used to be `plaza`, the name of the production
stack of `infra/app`): after updating, `pnpm infra:up` starts with an empty database; run
`pnpm db:migrate` (and `pnpm db:seed`) again.

**Tests need the services running:** `pnpm test` runs the integration tests against PostgreSQL
(`TEST_DATABASE_URL`) **and the LiveKit dev server** on `ws://localhost:7880` (media, world and
meeting-room tests), so start them with `pnpm infra:up:livekit`. `pnpm test:e2e` needs both too.
Both read `TEST_DATABASE_URL` / `E2E_DATABASE_URL` from the environment or, failing that, from
`.env`.

## Scripts

| Command                                                  | What it does                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm dev`                                               | Server (tsx watch) and web (Vite) in parallel                                               |
| `pnpm build`                                             | Builds every package (`shared` and `maps` to `dist/`, server with `tsc`, web with Vite)     |
| `pnpm lint` / `pnpm lint:fix`                            | ESLint 9 (typescript-eslint strict type-checked, react-hooks, jsx-a11y, architecture rules) |
| `pnpm typecheck`                                         | `tsc --noEmit` in every package and `e2e/`                                                  |
| `pnpm test`                                              | Unit + integration tests of every package (needs Postgres + LiveKit), lint-rule checks      |
| `pnpm test:coverage`                                     | `@plaza/shared` coverage (fails below 90 % lines)                                           |
| `pnpm test:e2e`                                          | Playwright (Chromium, fake media devices); starts its own server (:3100) and web (:5174)    |
| `pnpm format` / `pnpm format:check`                      | Prettier                                                                                    |
| `pnpm check:links`                                       | Checks every relative link (and heading anchor) of the tracked Markdown files               |
| `pnpm db:migrate` / `db:deploy` / `db:reset` / `db:seed` | Prisma (dev migrations / apply / reset dev DB / seed)                                       |
| `pnpm infra:up` / `infra:up:livekit` / `infra:down`      | Docker Compose services in `infra/`                                                         |
| `pnpm validate:maps`                                     | Validates `packages/maps`: manifest, map geometry (`parseMap`), theme sizes, licenses       |
| `pnpm --filter @plaza/maps generate`                     | Regenerates every map asset (templates, themes, avatars, decor) byte for byte               |

### Databases

- `plaza_dev`: development (`DATABASE_URL`).
- `plaza_test`: integration tests (`TEST_DATABASE_URL`, default `postgresql://postgres:postgres@localhost:5432/plaza_test`).
  Created and migrated with `prisma migrate deploy` before each run; tests empty the tables with
  `resetDatabase()`. If you edit a migration locally, drop `plaza_test` by hand.
- `plaza_e2e`: Playwright (`E2E_DATABASE_URL`, default `postgresql://postgres:postgres@localhost:5432/plaza_e2e`; ports `E2E_API_PORT`, default 3100, and `E2E_WEB_PORT`, default 5174, so a running `pnpm dev` on 5173 is never reused; one worker unless `E2E_WORKERS` says otherwise, because the media and timing specs are CPU-sensitive).

## Conventions for contributors

Read [`docs/virtual-office-mvp/03-estandares-codigo.md`](docs/virtual-office-mvp/03-estandares-codigo.md).
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
  Features add UI to the office page (`/s/:slug`) through `SpaceExtension`s listed in
  `app/space-extensions.ts` (a gate before entering, overlays over the map, bottom-bar controls),
  so `world` never imports them.
- **Database**: the Prisma schema already contains the whole MVP data model (architecture §7 + E9 +
  product events + in-app feedback of E8-S7). Prefer not to add migrations; if one is unavoidable, create it with `pnpm db:migrate`.
- **Commits**: Conventional Commits (`feat(world): ...`), checked by commitlint. The pre-commit hook runs
  ESLint and Prettier on the staged files (lint-staged).

## Status

Every MVP stage is implemented (planning and traceability:
[`docs/virtual-office-mvp/04-plan-desarrollo.md`](docs/virtual-office-mvp/04-plan-desarrollo.md)).
Implementation status for the product owner (per stage and requirement, measured results, what
still needs real Google/VM/network checks and how to deploy the beta, in Spanish):
[`docs/virtual-office-mvp/estado-implementacion.md`](docs/virtual-office-mvp/estado-implementacion.md).

| Stage                                            | Status |
| ------------------------------------------------ | ------ |
| E0 Foundations                                   | Done   |
| E1 Google sign-in and profile                    | Done   |
| E2 Spaces, access and meeting rooms              | Done   |
| E3 2D map engine                                 | Done   |
| E4 Realtime multiplayer                          | Done   |
| E5 Hallway audio/video (LiveKit)                 | Done   |
| E6 Meeting rooms with Google Meet                | Done   |
| E7 Presence, chat and reactions                  | Done   |
| E8 Beta launch (security, load, ops, metrics)    | Done   |
| E9 Office personalization (styles, desks, decor) | Done   |

E0-S7 (throwaway LiveKit proximity spike) was not built as a separate spike; its questions
(latency, selective subscription, `mutePublishedTrack`, bandwidth) are answered by the E5-S1..S5
and E6-S3 integration tests against the local LiveKit dev server and by
[`docs/load-test.md`](docs/load-test.md).

## Deploy and operations

- App VM (Caddy + web, server, PostgreSQL + daily backup): [`infra/app/`](infra/app/), deployed by
  [`.github/workflows/plaza-deploy.yml`](.github/workflows/plaza-deploy.yml) (staging on every
  green `main`, beta on `v0.x.y` tags with manual approval).
- Media VM (LiveKit + TURN): [`infra/livekit/`](infra/livekit/README.md).
- Runbook (deploy, rollback, backups and restore, key rotation, outages):
  [`docs/runbook.md`](docs/runbook.md). Security review: [`docs/security-review.md`](docs/security-review.md).
  Network guide for pilots' IT: [`docs/network-requirements.md`](docs/network-requirements.md).
