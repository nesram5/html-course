#!/bin/sh
# Renders caddy.yaml from caddy.yaml.tmpl with the domains of .env (E5-S7). caddy.yaml holds no
# secrets, but it is generated per environment, so it is not versioned either.
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
if [ "${#LIVEKIT_API_SECRET}" -lt 32 ]; then
  echo "LIVEKIT_API_SECRET must have at least 32 characters." >&2
  exit 1
fi

sed -e "s/\${LIVEKIT_DOMAIN}/${LIVEKIT_DOMAIN}/g" -e "s/\${TURN_DOMAIN}/${TURN_DOMAIN}/g" \
  caddy.yaml.tmpl > caddy.yaml
echo "caddy.yaml ready for ${LIVEKIT_DOMAIN} and ${TURN_DOMAIN}."
