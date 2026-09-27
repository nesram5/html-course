#!/bin/sh
# Renders caddy.yaml and livekit.yaml from their .tmpl with the domains, the app origin and the
# API key of .env (E5-S7, E6-S3). They hold no secrets, but they are generated per environment,
# so they are not versioned either.
set -eu
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env: cp .env.example .env and fill it in." >&2
  exit 1
fi
set -a
. ./.env
set +a

: "${LIVEKIT_API_KEY:?LIVEKIT_API_KEY is empty in .env}"
: "${LIVEKIT_API_SECRET:?LIVEKIT_API_SECRET is empty in .env}"
: "${LIVEKIT_DOMAIN:?LIVEKIT_DOMAIN is empty in .env}"
: "${TURN_DOMAIN:?TURN_DOMAIN is empty in .env}"
: "${APP_URL:?APP_URL is empty in .env}"
if [ "${#LIVEKIT_API_SECRET}" -lt 32 ]; then
  echo "LIVEKIT_API_SECRET must have at least 32 characters." >&2
  exit 1
fi
case "$APP_URL" in
  https://*) ;;
  *)
    echo "APP_URL must be the https:// origin of the app (LiveKit sends its webhooks there)." >&2
    exit 1
    ;;
esac
APP_URL="${APP_URL%/}"

sed -e "s/\${LIVEKIT_DOMAIN}/${LIVEKIT_DOMAIN}/g" -e "s/\${TURN_DOMAIN}/${TURN_DOMAIN}/g" \
  caddy.yaml.tmpl > caddy.yaml
sed -e "s|\${LIVEKIT_API_KEY}|${LIVEKIT_API_KEY}|g" -e "s|\${APP_URL}|${APP_URL}|g" \
  livekit.yaml.tmpl > livekit.yaml
echo "caddy.yaml ready for ${LIVEKIT_DOMAIN} and ${TURN_DOMAIN}."
echo "livekit.yaml ready (webhooks to ${APP_URL})."
