# Licenses of the map assets

Every image in this package is **generated procedurally** by the code in
[`scripts/generator/`](./scripts/generator) (`pnpm --filter @plaza/maps generate`). No third-party art
is included.

| Assets                                                                 | Author                                                | License                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| `tilesets/pixel-office.png`                                            | Plaza (procedural, `packages/maps/scripts/generator`) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `templates/*/map.tmj`, `templates/*/themes/*` (Pixel, Noche, Acuarela) | Plaza (procedural, `packages/maps/scripts/generator`) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `avatars/*.png`                                                        | Plaza (procedural, `packages/maps/scripts/generator`) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `decor/*.png`                                                          | Plaza (procedural, `packages/maps/scripts/generator`) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

When adding art made elsewhere, add a row with its author, source URL and license, set the same
license in `theme.json` / the manifest `credit`, and keep to the licenses accepted by
`pnpm validate:maps` (`ALLOWED_LICENSES` in `scripts/lib/validate.ts`).
