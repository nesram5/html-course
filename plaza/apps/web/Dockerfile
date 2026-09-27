# syntax=docker/dockerfile:1.7
#
# Plaza web app served by Caddy (E8-S5): the Vite build as static files with SPA fallback, and
# /api, /realtime (WebSocket) and /assets/maps proxied to the server. Build from plaza/:
#   docker build -f apps/web/Dockerfile -t plaza-web \
#     --build-arg VITE_APP_VERSION=0.1.0 --build-arg VITE_SENTRY_DSN=https://… .
#
# VITE_* values are public (they end up in the JavaScript bundle): never pass secrets here.
# Behind a TLS-inspecting proxy, add `--secret id=extra_ca,src=/path/to/ca.crt`.
# Runtime configuration (domain, upstream, CSP origins): see infra/app/Caddyfile.

ARG NODE_IMAGE=node:22.20-bookworm-slim
ARG CADDY_IMAGE=caddy:2.10-alpine

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0 \
    CI=true
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
# The root `prepare` script (hooks for commits) exits at once with CI/HUSKY=0.
COPY scripts/install-git-hooks.mjs scripts/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/maps/package.json packages/maps/
COPY tools/load/package.json tools/load/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --filter "@plaza/web..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG VITE_APP_VERSION=0.0.0
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=
# staging or beta (set by the deploy workflow): browser errors and timings of both apart.
ARG VITE_SENTRY_ENVIRONMENT=
ENV VITE_APP_VERSION=${VITE_APP_VERSION} \
    VITE_SENTRY_DSN=${VITE_SENTRY_DSN} \
    VITE_SENTRY_TRACES_SAMPLE_RATE=${VITE_SENTRY_TRACES_SAMPLE_RATE} \
    VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}
RUN pnpm --filter @plaza/web build

FROM ${CADDY_IMAGE} AS runtime
COPY infra/app/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
# Defaults for a local run (plain HTTP on :80, server reachable as "server:3000").
ENV SITE_ADDRESS=:80 \
    SERVER_UPSTREAM=server:3000 \
    CSP_CONNECT_SRC=
EXPOSE 80 443 443/udp
