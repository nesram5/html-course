#!/bin/sh
# Entry point of the bululu-server image (E8-S5).
#   serve    (default) start the API + realtime server
#   migrate  apply pending Prisma migrations (`prisma migrate deploy`), then exit
# `exec` replaces this shell, so the server gets SIGTERM directly and shuts down gracefully.
set -eu

cd /app/apps/server

case "${1:-serve}" in
  serve)
    exec node dist/main.js
    ;;
  migrate)
    exec node node_modules/prisma/build/index.js migrate deploy
    ;;
  *)
    exec "$@"
    ;;
esac
