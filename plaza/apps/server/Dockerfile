# syntax=docker/dockerfile:1.7
#
# Plaza API + realtime server (E8-S5). Build from the plaza/ folder:
#   docker build -f apps/server/Dockerfile -t plaza-server .
#
# Behind a TLS-inspecting proxy, pass its CA as a build secret (never baked into a layer):
#   docker build --secret id=extra_ca,src=/path/to/ca.crt -f apps/server/Dockerfile .
#
# The image runs `node apps/server/dist/main.js` as PID 1 (exec form), so SIGTERM reaches the
# server: it closes realtime connections (clients reconnect by themselves) and exits 0.
# Migrations: `docker run --rm --env-file .env plaza-server migrate` (prisma migrate deploy).

ARG NODE_IMAGE=node:22.20-bookworm-slim

# ── Base: pnpm through corepack ─────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
# Prisma picks its query engine from the OpenSSL version it detects.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0 \
    CI=true
RUN corepack enable
WORKDIR /app

# Workspace manifests first: dependency layers are reused while only sources change.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
# The root `prepare` script (hooks for commits) exits at once with CI/HUSKY=0.
COPY scripts/install-git-hooks.mjs scripts/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/maps/package.json packages/maps/
COPY tools/load/package.json tools/load/
# `prisma generate` runs at install time (postinstall of @plaza/server).
COPY apps/server/prisma apps/server/prisma
COPY apps/server/prisma.config.ts apps/server/

# ── Build: every dependency, then compile shared, maps and server ───────────
FROM manifests AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --filter "@plaza/server..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/maps packages/maps
COPY apps/server apps/server
RUN pnpm --filter "@plaza/server..." build

# ── Production dependencies only ────────────────────────────────────────────
FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --prod --filter "@plaza/server..."

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node:node /app/packages/maps/dist packages/maps/dist
COPY --chown=node:node packages/maps/manifest.json packages/maps/
COPY --chown=node:node packages/maps/templates packages/maps/templates
COPY --chown=node:node packages/maps/avatars packages/maps/avatars
COPY --chown=node:node packages/maps/decor packages/maps/decor
COPY --chown=node:node packages/maps/tilesets packages/maps/tilesets
COPY --from=build --chown=node:node /app/apps/server/dist apps/server/dist
COPY --chown=node:node apps/server/docker-entrypoint.sh /usr/local/bin/plaza-server
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["plaza-server"]
CMD ["serve"]
