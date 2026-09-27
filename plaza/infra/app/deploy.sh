#!/bin/sh
# Deploys (or rolls back to) a pair of images on the app VM (E8-S5). Run from the VM, in the
# folder with docker-compose.yml, backup.sh and .env (/opt/plaza by default):
#
#   ./deploy.sh ghcr.io/<owner>/plaza-server:v0.3.0 ghcr.io/<owner>/plaza-web:v0.3.0
#
# The deploy workflow (.github/workflows/plaza-deploy.yml) calls it over SSH. It pulls the
# images, runs the migrations (`migrate` service) and restarts server and web only if they
# succeed, waits for the health checks, then records the versions in .env (so a plain
# `docker compose up -d` keeps them) and in deployed-versions.log (for rollbacks).
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <server-image> <web-image>" >&2
  exit 2
fi
cd "$(dirname "$0")"

export PLAZA_SERVER_IMAGE="$1"
export PLAZA_WEB_IMAGE="$2"

docker compose pull migrate server web
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
