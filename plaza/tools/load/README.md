# @plaza/load — realtime load test (E8-S3)

N bots with `socket.io-client`, signed in through the test login, in one new space: each joins with
`space:join` and walks randomly (respecting the collisions of the parsed map) at a fixed rate. The
script prints the movement latency (from a bot emitting `player:move` to another bot receiving the
`world:delta` with that position, tick wait included), rejected moves (`player:correct`), deltas per
bot and the server `/api/health` figures (connected per space, average tick).

```bash
# Server with the test login and a generous HTTP rate limit (2 requests per bot):
AUTH_TEST_LOGIN=true RATE_LIMIT_PER_MINUTE=100000 PORT=3201 … node apps/server/dist/main.js

pnpm --filter @plaza/load load --url http://127.0.0.1:3201 --bots 50 --duration 60
```

Options: `--bots` (50), `--duration` seconds (60), `--steps-per-second` per bot (4; the server
accepts 10), `--template` (`office-small@1`), `--url` (`http://localhost:3000`).

## Local baseline

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
