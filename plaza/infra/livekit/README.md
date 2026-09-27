# `infra/livekit` — self-hosted media server (E5-S7, E5-S8)

LiveKit with its embedded TURN, behind Caddy (layer4) for the certificates, on a dedicated VM
(architecture §11.5). No secrets or domains are versioned: they come from `.env`.

```bash
cp .env.example .env          # API key/secret (docker run --rm livekit/livekit-server:v1.9.12 generate-keys) and domains
./render-config.sh            # caddy.yaml from caddy.yaml.tmpl
ADMIN_CIDR=203.0.113.10/32 sudo ./firewall.sh
docker compose up -d
```

- `livekit.<domain>:443` (TCP) → Caddy → LiveKit signalling on `:7880`.
- `turn.<domain>:443` (TCP) → Caddy (TLS) → LiveKit TURN on `:5349`; TURN/UDP on UDP 443.
- Media: UDP 50000–60000 and ICE/TCP 7881.

Operations (sizing, monitoring, upgrades, fallback to LiveKit Cloud) are in
[`docs/runbook.md`](../../docs/runbook.md); the one-page guide for pilots' IT is
[`docs/network-requirements.md`](../../docs/network-requirements.md).

`turn-test/run-turn-test.sh` checks TURN/TLS locally: a throwaway LiveKit with TURN/TLS on local
port 443 and no ICE/TCP, and two Chromium pages with UDP disabled and relay-only ICE; it passes
when the video arrives through a `relay` candidate over `tls`.
