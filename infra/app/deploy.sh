#!/bin/sh
# Deploys (or rolls back to) a pair of images on the app VM (E8-S5). Run from the VM, in the
# folder with docker-compose.yml, backup.sh and .env (/opt/plaza by default):
#
#   ./deploy.sh ghcr.io/<owner>/plaza-server:v0.3.0 ghcr.io/<owner>/plaza-web:v0.3.0
#
# The deploy workflow (.github/workflows/plaza-deploy.yml) calls it over SSH. It pulls the
# images, runs the migrations (`migrate` service) ON THEIR OWN, and only if they succeed
# replaces server and web, waits for the health checks, then records the versions in .env (so a
# plain `docker compose up -d` keeps them) and in deployed-versions.log (for rollbacks).
#
# Why a separate step: `docker compose up` recreates (stops and removes) every changed container
# BEFORE it runs the one-shot `migrate`; if the migration then failed, server and web were left
# "Created" and the whole app was down. `docker compose run` touches nothing else.
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <server-image> <web-image>" >&2
  exit 2
fi
cd "$(dirname "$0")"

export PLAZA_SERVER_IMAGE="$1"
export PLAZA_WEB_IMAGE="$2"

docker compose pull migrate server web
# 1. Migrations with the new image. On failure `set -e` stops here: the running server and web
#    (the previous version) keep serving, and .env still names the previous images.
docker compose run --rm -T migrate
# 2. Only now replace server and web (`migrate` runs again as their dependency: a no-op).
docker compose up -d --wait --remove-orphans

set_env() {
  if grep -q "^$1=" .env; then
    sed -i "s#^$1=.*#$1=$2#" .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}
set_env PLAZA_SERVER_IMAGE "$PLAZA_SERVER_IMAGE"
set_env PLAZA_WEB_IMAGE "$PLAZA_WEB_IMAGE"
printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PLAZA_SERVER_IMAGE" "$PLAZA_WEB_IMAGE" >> deployed-versions.log

docker compose ps
echo "deployed $PLAZA_SERVER_IMAGE and $PLAZA_WEB_IMAGE"
