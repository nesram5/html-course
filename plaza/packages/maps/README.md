# @plaza/maps

Map templates, avatar sprites and the desk decoration catalog of Plaza. Everything is listed in
[`manifest.json`](./manifest.json), whose zod schema lives in [`src/manifest.ts`](./src/manifest.ts)
(`MapsManifestSchema`). `pnpm validate:maps` (run in CI) checks the manifest and the files it references.

The server serves this folder at `/assets/maps/` (e.g. `/assets/maps/templates/office-small/map.tmj`).
All art must be CC0 or similarly licensed and credited in `LICENSES.md` (E2-S1).

## Layout

```text
packages/maps/
├── manifest.json            # catalog: templates, avatars, decor
├── templates/<dir>/         # one folder per template (id "<dir>@<version>")
│   ├── map.tmj              # Tiled JSON: the ONLY source of geometry
│   └── themes/<themeId>/    # one folder per office style ("skin")
│       ├── below.png        # drawn below the avatars (floor, furniture)
│       ├── above.png        # drawn above the avatars (tree tops, door frames)
│       ├── thumbnail.png
│       └── theme.json       # { name, author, license, baseThemeId?, colorMatrix? }
├── avatars/<file>.png       # sprite sheets
└── decor/<file>.png         # desk decoration objects
```

## Map templates (`map.tmj`, architecture §8)

Designed in [Tiled](https://www.mapeditor.org/) with 32×32 px tiles and exported as JSON (`.tmj`).
Templates are versioned (`office-small@1`, ADR-006): changing the geometry means a new version.
Required layers (validated by `pnpm validate:maps`, TODO E2-S1):

| Layer                         | Type                          | Use                                                                                                                     |
| ----------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `floor`                       | tiles                         | Floor                                                                                                                   |
| `decor-below` / `decor-above` | tiles                         | Decoration below / above the avatars                                                                                    |
| `collision`                   | tiles                         | Any tile ≠ 0 blocks movement                                                                                            |
| `rooms`                       | objects (**rectangles only**) | Meeting rooms. Properties: `areaId`, `name`                                                                             |
| `spawns`                      | objects (points)              | Spawn points (at least 2)                                                                                               |
| `desks`                       | objects (rectangles)          | Assignable desks over furniture that already blocks movement. Property: `deskId`; 3 decoration slots at fixed positions |

`@plaza/shared` turns a `.tmj` into a `WorldMap` with `parseMap` and answers `isWalkable` / `roomAt`,
identically on client and server.

## Office styles (themes, architecture §8.1 and E9)

A style is a **skin over the same geometry**: it changes the art, never collisions, rooms, desks or spawns.

- `below.png` and `above.png` measure exactly `width × 32` by `height × 32` px (max 4096 px per side).
  The client draws `below` → avatars → `above`.
- The default `pixel` style is rendered from the tile layers with `tmxrasterizer` at build time;
  other styles are painted over that same base.
- **Color variant (plan B):** a `theme.json` with `baseThemeId` and a 4×5 `colorMatrix` (20 numbers)
  reuses another theme's images through a Phaser color filter; no `below.png`/`above.png` needed.
- `theme.json` must declare `name`, `author` and `license`.

## Avatars (E1-S4)

Sprite sheets with 4 rows (down, left, right, up) × 3 walking frames, `frameWidth × frameHeight` each.
At least 8 avatars. Manifest entry: `{ id, name, file, frameWidth, frameHeight, credit }`.

## Desk decoration (E9-S3)

At least 12 neutral objects (plant, lamp, mug, picture, trophy, cat…) that fit every style.
Manifest entry: `{ id, name, file, credit }`. A desk holds up to 3 items (`{ slots: [id|null ×3] }`, RN-15).

Catalog names are Spanish display names; the web app may override them with i18n keys
`catalog:<templates|themes|avatars|decor>.<id>`.
