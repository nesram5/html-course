# `features/world` — the 2D map (E3)

The only feature that imports Phaser. React owns the page and the DOM; Phaser owns one `<canvas>`.
They talk through two objects only (architecture §6):

| Bridge       | File                   | Direction                  | Used for                                                          |
| ------------ | ---------------------- | -------------------------- | ----------------------------------------------------------------- |
| `worldStore` | `store/world-store.ts` | both (state)               | loading progress/errors, zoom, local player tile and room         |
| `EventBus`   | `bridge/event-bus.ts`  | commands and one-off facts | `camera:center` (React → scene), `local:step` (scene → E4 client) |

```text
SpacePage (/s/:slug) ── TanStack Query: enter space, /api/me, map.tmj → parseMap, theme.json
  └─ WorldCanvas ── lazy import('game/create-game') → Phaser.Game
       ├─ PreloadScene   below.png / above.png / avatar sheet → worldStore.load (progress, error)
       └─ WorldScene     below → room borders → AvatarSprite (+ name) → above; camera follow
            ├─ LocalPlayerController   pure: tile steps every STEP_MS, isWalkable collisions
            └─ KeyboardInput           window listeners: arrows/WASD, +/-, ignores text fields
  └─ WorldToolbar ── "Centrar en mí" (EventBus) and zoom 1× / 1,5× / 2× (worldStore)
```

## Rules of the pattern

- **React never touches Phaser objects** and scenes never import React. React sends commands with
  `worldEvents.emit(...)` or store actions; scenes read the store with `store.subscribe`.
- **Everything a scene registers is released on `SHUTDOWN`/`DESTROY`** (`WorldScene.cleanups`):
  store subscriptions, `EventBus` listeners and `KeyboardInput`. `WorldCanvas` destroys the game in
  its effect cleanup, so leaving the page frees the canvas, textures and listeners. The E2E test
  checks it through `window.__plazaWorld` (development builds only, `debug.ts`).
- **Game logic stays out of Phaser**: movement is `LocalPlayerController` (unit tested, uses
  `isWalkable` from `@plaza/shared`, the same function as the server); map parsing is `parseMap`.
- **Keyboard**: handled on `window` (Phaser's keyboard plugin is disabled) so keys typed in inputs
  never move the avatar and `Tab` always moves the focus on. The canvas container is focusable
  (`role="application"`).
- **Office styles** (§8.1): the scene draws `below.png` → avatars (depth `100 + row`) → `above.png`
  (depth 100 000). Color variants (`theme.json` with `baseThemeId` + `colorMatrix`) reuse the base
  images, recolored once on the CPU (`game/color-matrix.ts`).
- **E4 hooks**: listen to `local:step` (`{ x, y, dir }`, same tile = turn) to send `player:move`;
  call `LocalPlayerController.teleport` on `player:correct`; reuse `AvatarSprite` for remote players.

## Tests

- Unit (Vitest, jsdom): controller, keyboard, bus/store, asset loading, `WorldCanvas` lifecycle with a
  fake game factory, `SpacePage` with mocked `fetch`.
- E2E (`e2e/tests/world.spec.ts`): real Phaser in Chromium, walking, collisions, zoom, Tab and
  teardown.
