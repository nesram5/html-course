#!/bin/sh
# Firewall of the media VM (E5-S7, architecture §11.5), with ufw: only the media ports are open.
#   TCP 443          Caddy: LiveKit signalling (livekit.<domain>) and TURN/TLS (turn.<domain>)
#   TCP 7881         ICE over TCP
#   UDP 443          TURN/UDP
#   UDP 50000-60000  media (WebRTC)
# SSH is only allowed from ADMIN_CIDR (the team's VPN or office IP). Everything else is closed,
# including 7880 (LiveKit HTTP, only through Caddy) and 6789 (Prometheus, local agent only).
# The provider's cloud firewall should mirror these rules.
set -eu

ADMIN_CIDR="${ADMIN_CIDR:?set ADMIN_CIDR, e.g. ADMIN_CIDR=203.0.113.10/32 ./firewall.sh}"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$ADMIN_CIDR" to any port 22 proto tcp
ufw allow 443/tcp
ufw allow 7881/tcp
ufw allow 443/udp
ufw allow 50000:60000/udp
ufw --force enable
ufw status verbose
