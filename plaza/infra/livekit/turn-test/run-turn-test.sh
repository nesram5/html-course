#!/bin/sh
# Local TURN/TLS check (E5-S8): starts a throwaway LiveKit (livekit-turn-test.yaml, host
# network, ports 7980, TCP 443 (TURN/TLS), UDP 3479 and 41000-41100, 52000-52100) with a self-signed
# certificate for localhost, runs turn-test.mjs and removes everything. Needs Docker, openssl
# and the Playwright Chromium of the repo. Run from anywhere: infra/livekit/turn-test/run-turn-test.sh
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
image="${LIVEKIT_IMAGE:-livekit/livekit-server:v1.9}"
name="plaza-turn-test-$$"
certs="$(mktemp -d)"

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$certs"
}
trap cleanup EXIT INT TERM

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=turn.localhost \
  -addext subjectAltName=DNS:turn.localhost \
  -keyout "$certs/key.pem" -out "$certs/cert.pem" 2>/dev/null
chmod 644 "$certs/key.pem" "$certs/cert.pem"

docker run -d --name "$name" --network host \
  -v "$here/livekit-turn-test.yaml:/etc/livekit.yaml:ro" -v "$certs:/certs:ro" \
  "$image" --config /etc/livekit.yaml --node-ip 127.0.0.1 >/dev/null

i=0
until wget -q -O /dev/null http://localhost:7980/ 2>/dev/null || curl -fsS http://localhost:7980/ >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 50 ]; then
    docker logs "$name" >&2
    echo "LiveKit did not start" >&2
    exit 1
  fi
  sleep 0.2
done

cd "$root"
node "$here/turn-test.mjs"
