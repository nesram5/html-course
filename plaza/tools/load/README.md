# @plaza/load — load tests (E8-S3)

Two tools; results and method in [`docs/load-test.md`](../../docs/load-test.md).

## Realtime: `pnpm --filter @plaza/load load`

N bots with `socket.io-client`, signed in through the test login, in one new space: each joins with
`space:join` and walks randomly (respecting the collisions of the parsed map) at a fixed rate. The
script prints the movement latency (from a bot emitting `player:move` to another bot receiving the
`world:delta` with that position, tick wait included), rejected moves (`player:correct`), deltas per
bot and the server `/api/health` figures (connected per space, average tick).

```bash
# Server with the test login and a generous HTTP rate limit (2 requests per bot). The test login
# cannot run with NODE_ENV=production: use the production image with NODE_ENV=test (see
# docs/load-test.md).
AUTH_TEST_LOGIN=true RATE_LIMIT_PER_MINUTE=100000 HEALTH_TOKEN=<16+ chars> PORT=3201 … node apps/server/dist/main.js

PLAZA_HEALTH_TOKEN=<same> pnpm --filter @plaza/load load --url http://127.0.0.1:3201 --bots 50 --duration 300
```

Options: `--bots` (50), `--duration` seconds (60), `--steps-per-second` per bot (4; the server
accepts 10), `--template` (`office-small@1`), `--url` (`http://localhost:3000`),
`--sample-every` seconds (30: server memory, tick and the movement p95 of each interval, plus
the heap trend at the end), `--health-token` (default `$PLAZA_HEALTH_TOKEN`, needed for the
figures when the server has a `HEALTH_TOKEN`).

If a bot cannot connect or its `space:join` is refused (`SPACE_FULL` when `--bots` is above the
server's `MAX_PLAYERS_PER_SPACE`, `RATE_LIMITED`...), every bot is disconnected and the script exits
with code 1 and a message such as `Bot 51 could not join: SPACE_FULL (...)`.

## Media: `pnpm --filter @plaza/load media`

G conversations of N people (default 12 × 4) in one LiveKit room, like one Plaza space: each
person (an `@livekit/rtc-node` client) publishes a synthetic camera and microphone and subscribes
only to the others of its conversation, as `media:peers` would make the browser do. The people
are spread over `--processes` client processes. Every `--sample-every` seconds it reads the
LiveKit container CPU (`docker stats`) and, with `--metrics-url`, its traffic from the
Prometheus byte counters.

```bash
pnpm --filter @plaza/load media --livekit-url ws://127.0.0.1:7880 --api-key devkey --api-secret secret \
  --container livekit --metrics-url http://127.0.0.1:6789/metrics --duration 600
```

Run `--help` for every option (camera size, frame rate and bitrate cap, simulcast, vCPUs of the
media VM used to express the CPU share).

## Realtime local baseline

One process for the 50 bots and the compiled server on the same development VM (no network in
between), `office-small@1`, 4 steps/s per bot, 60 s:

| Figure                       | Result                                                                  |
| ---------------------------- | ----------------------------------------------------------------------- |
| Moves sent                   | 11 987 (200/s)                                                          |
| Rejected moves               | 0                                                                       |
| `world:delta` per bot        | 14.9/s (one per 15 Hz tick at most)                                     |
| Move → delta latency         | p50 35.9 ms · p95 65.8 ms · p99 68.5 ms · max 95.7 ms (587 118 samples) |
| Average tick (`/api/health`) | 0.98 ms                                                                 |
| Socket errors / disconnects  | 0 / 0                                                                   |

The latency is dominated by the wait for the next tick (up to 66 ms). E8-S3 still has to be run
against staging with real browsers (p95 < 200 ms target, 15 minutes).
