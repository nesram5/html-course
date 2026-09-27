# `features/world` — the 2D map (E3) and real time (E4)

The only feature that imports Phaser, and home of the `RealtimeClient` (the only Socket.IO
client). React owns the page and the DOM; Phaser owns one `<canvas>`. They talk through two
objects only (architecture §6):

| Bridge        | File                    | Direction                        | Used for                                                                                                                                                                                         |
| ------------- | ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `worldStore`  | `store/world-store.ts`  | both (state)                     | loading progress/errors, zoom, local player tile and room, the other people                                                                                                                      |
| `EventBus`    | `bridge/event-bus.ts`   | commands and one-off facts       | `camera:center`, `camera:locate`, `camera:desk`, `world:snapshot`, `world:delta`, `player:correct`, `avatar:reaction` (→ scene), `local:step` (scene →), `presence:self-away` (presence → media) |
| `officeStore` | `store/office-store.ts` | server → React and scene (state) | office style, held desks with name and decoration, decoration preview (E9)                                                                                                                       |

```text
SpacePage (/s/:slug) ── useEnterSpace (spaces), useSession/useAvatars (auth), map.tmj → parseMap, theme.json
  ├─ useSpaceSession ── SpaceSession (realtime/space-session.ts) ── RealtimeClient ── Socket.IO /realtime
  │     connect → wait for "map drawn" → space:join → world:snapshot (EventBus)
  │     local:step → player:move · world:delta / player:correct → EventBus · space:kicked → sessionStore
  ├─ WorldCanvas ── lazy import('game/create-game') → Phaser.Game
  │    ├─ PreloadScene   below.png / above.png / local avatar sheet → worldStore.load (progress, error)
  │    └─ WorldScene     below → room borders → avatars (100 + row) → above → names (above + 1 + row)
  │         ├─ LocalPlayerController   pure: tile steps every STEP_MS, isWalkable; teleport() for
  │         │                          server-decided positions (spawn, reconnection, player:correct)
  │         ├─ RemotePlayersSystem     AvatarSprites of the others; logic in the pure RemotePlayersModel
  │         ├─ AvatarTextures          remote sprite sheets loaded on demand, once per avatar
  │         └─ KeyboardInput           window listeners: arrows/WASD, +/-, ignores text fields
  │    └─ attachOffice (game/office/, E9)
  │         ├─ ThemeLoader         pure: live style change, latest request wins; PhaserThemeBackend
  │         │                      loads the new images (recolors color variants), cross-fades
  │         │                      them in 600 ms and removes the old textures
  │         └─ DeskLayer           names over held desks and decoration objects (deskDrawings, pure)
  ├─ ConnectionBanner ── "Conectando…" / "Reconectando…" (connectionStore, sessionStore)
  ├─ SessionNotice ── "Abriste Plaza en otra pestaña" + "Usar Plaza aquí"; refused joins
  ├─ WorldToolbar ── "Centrar en mí" (EventBus) and zoom 1× / 1,5× / 2× (worldStore)
  ├─ SpaceBottomBar ── "Tus controles": avatar · name · the `BarItems` of every extension
  └─ extensions (SpaceExtension, listed in `app/space-extensions.ts`: media, presence, chat,
     personalization)
       Gate     before joining (media pre-join); the map loads behind it
       Overlay  over the map (video strip, first-use notice, X desk menu and "Decorar")
       BarItems in the bottom bar (mic/camera · status/"Personas" · reactions/chat ·
                "Mi escritorio"); they also start the presence and chat sessions
       Panel    side panels after the map controls ("Personas", chat); one open at a time
                through `sidePanelStore`
       This feature never imports the features that extend it (no import cycles).
```

## Presence, chat and reactions (E7)

- Status dot left of every name (green available, red busy, grey away): `AvatarSprite.setPresence`,
  from the snapshot and `world:delta.changed` (the local person gets their own changes too).
- `avatar:reaction { userId, emoji }` floats the emoji over that avatar for `REACTION_DURATION_MS`.
- `camera:locate { userId }` makes the camera follow that person for `LOCATE_MS` (3 s), then the
  local avatar again ("Centrar en mí" cancels it). The probe tells who is followed: `cameraTarget()`.
- `presence:self-away { away }` is emitted by `presence` when the tab is hidden / idle 10 min / back;
  the media feature mutes microphone and camera and restores exactly what was on.

## Real time (E4)

- **`RealtimeClient`** (`realtime/realtime-client.ts`, exported as `realtimeClient`): one socket
  (`/realtime`, WebSocket only, session cookie), typed with the shared `ClientToServerEvents` /
  `ServerToClientEvents`. Every incoming event and ack is validated with the shared zod schemas;
  invalid ones are dropped and reported. Typed methods (`join`, `move`, `setStatus`, `setAway`,
  `sendChat`, `react`, `ring`, `gotoDesk`) stamp `v: PROTOCOL_VERSION`. Fire-and-forget events are
  dropped while disconnected (never replayed after a reconnection). Status in `connectionStore`:
  `connecting` / `connected` / `reconnecting` / `disconnected` (+ the handshake error code).
- **`SpaceSession`**: joins when the socket is connected **and** the map is drawn; re-joins after
  every reconnection or redraw, and the new snapshot moves the local avatar where the server says
  (no client-side spawn). `player:correct` just relocates the avatar (architecture §9.3). Kicks:
  `SESSION_REPLACED` shows a page with "Usar Plaza aquí" (reconnect + join, which replaces the other
  tab); `REMOVED` / `ACCOUNT_DELETED` go back to "Mis espacios" with a toast. Refused joins show the
  translated error (`NOT_A_MEMBER`, `BANNED_FROM_SPACE`: no retry).
- **Remote avatars** (`game/remote/`): `RemotePlayersModel` applies snapshots and deltas and, every
  frame, interpolates each step over one tick (`TICK_MS`) with the walk animation, fades in/out on
  joined/left (250 ms) and draws people in the reconnection grace at 50 % opacity. It allocates
  nothing per frame (dense array, objects mutated in place; `remote-players.perf.test.ts` checks
  the heap). `AvatarSprite` setters are no-ops when nothing changes, and depth changes by whole rows,
  so walking does not re-sort the scene every frame.

## Office personalization (E9)

- **Styles** (ADR-011): the page draws the office with the style it was opened with and never
  reloads it; `space:snapshot.themeId` and `space:theme` go to `officeStore.themeId`, and the scene's
  `ThemeLoader` swaps the two images with a fade, without touching avatars or geometry. Old style
  textures are freed (`window.__plazaWorld.office().styleTextures`).
- **Desks**: `SpaceSession` keeps `officeStore.desks` in step (`space:snapshot.desks`,
  `desk:updated`, through `realtime/office-sync.ts`); `DeskLayer` draws the owner's name (over the
  `above` art, under avatar names) and the objects in the 3 slots of `DeskArea.decorSlots`, from the
  catalog sprites (neutral, same in every style). While "Decorar" is open, `officeStore.preview`
  replaces the saved decoration of that desk. `camera:desk` pans to a desk ("Ir a su escritorio",
  `/s/:slug?desk=<deskId>`).

## Rules of the pattern

- **React never touches Phaser objects** and scenes never import React. React sends commands with
  `worldEvents.emit(...)` or store actions; scenes read the store with `store.subscribe`.
- **Everything a scene registers is released on `SHUTDOWN`/`DESTROY`** (`WorldScene.cleanups`):
  store subscriptions, `EventBus` listeners, `KeyboardInput`, remote sprites. `WorldCanvas` destroys
  the game in its effect cleanup and `useSpaceSession` stops the session (listeners + socket), so
  leaving the page frees everything. The E2E test checks it through `window.__plazaWorld`.
- **Game logic stays out of Phaser**: movement is `LocalPlayerController` (uses `isWalkable` from
  `@plaza/shared`, the same function as the server); remote players are `RemotePlayersModel`; map
  parsing is `parseMap`; draw order is `game/sprites/depth.ts`.
- **Keyboard**: handled on `window` (Phaser's keyboard plugin is disabled) so keys typed in inputs
  never move the avatar and `Tab` always moves the focus on. The canvas container is focusable
  (`role="application"`).
- **Office styles** (§8.1): `below.png` (0; a style fading in: 1) → room borders (10) → desk objects
  (20) → avatars (`100 + row`) → `above.png` (100 000; fading in: 100 000.25) → desk owner names
  (100 000.5) → per avatar, at `100 001 + row`: name label, status dot (left), 💬 (right) and
  reaction (over them). Nothing drawn over the art is ever hidden by trees or roofs, in any style.
  Color variants (`theme.json` with `baseThemeId` + `colorMatrix`) reuse the base images, recolored
  once on the CPU.

## Development probes

`window.__plazaWorld` (development builds only, `debug.ts`): `liveGames()`, `listenerCount()`,
`localPlayer()`, `avatars()` (tile, drawn position, opacity, label depth), `fps()`, `realtime()`,
`stress(n)` (n fake people walking through the real remote system; `0` stops) and
`dropConnection()` (closes the transport like a network cut).

## Tests

- Unit (Vitest, jsdom): controller, keyboard, bus/store, assets, `WorldCanvas` lifecycle with a fake
  game factory, `SpacePage` with mocked `fetch` and a `FakeSocket`, `RealtimeClient` (validation,
  typing, acks, status), `SpaceSession` (join, reconnection, kicks), `RemotePlayersModel` (+ heap
  check with 50 avatars), `StressDriver`.
- E2E: `world.spec.ts` (walking, collisions, zoom, teardown), `realtime.spec.ts` (two people see
  each other walk, reconnection, second tab, removal), `world-performance.spec.ts` (50 avatars).
