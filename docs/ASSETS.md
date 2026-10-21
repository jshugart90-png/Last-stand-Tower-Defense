# Asset licenses

Version 2.3.0 uses a small set of Kenney CC0 bitmaps and two UI clicks, plus the original generated music and combat sounds as the fallback.

| Asset | Where | Source | License |
| --- | --- | --- | --- |
| Terrain, tower bases, guns, enemies, projectiles, explosions | `frontend/assets/kenney/td/` (copied from `towerDefense_tile###.png`) | [Kenney Tower Defense (Top-down)](https://kenney.nl/assets/tower-defense-top-down), zip mirrored at [OpenGameArt](https://opengameart.org/content/tower-defense-top-down) (`Tower Defense (top-down).zip`) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Kenney’s pack license says commercial use is allowed. Credit is appreciated and not required. |
| Buttons, panel, app icon composite | `frontend/assets/kenney/ui/`, `frontend/assets/images/icon.png`, `adaptive-icon.png`, `favicon.png` | [Kenney UI Pack](https://kenney.nl/assets/ui-pack), zip at [OpenGameArt](https://opengameart.org/content/ui-pack) (`kenney_ui-pack.zip`). The app icon is grass and a turret from the tower-defense pack, composed in this repo. | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). |
| Kenney Future and Kenney Future Narrow | `frontend/assets/kenney/font/` | Same UI pack, `Font/` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). |
| UI clicks (`click.wav`, `tap.wav`) | `frontend/assets/kenney/sfx/` | Same UI pack, `Sounds/click-a.ogg` and `Sounds/tap-a.ogg`, converted to 22 kHz WAV so iOS can play them | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). |
| Music (menu, battle, boss, defeat) and combat SFX (shots, impact, death, wave, win, lose) | Synthesized in `frontend/src/services/audioService.ts` | Original. Used when a file clip is missing, and for every looping bed and weapon sound. | Original work. Commercial use allowed. |
| Build and upgrade clicks | Prefer the Kenney tap/click WAVs; the synthesizer runs if the file fails to load | See UI clicks and the audio service | CC0 file, original fallback. |
| Ionicons and related icon fonts still used on a few HUD controls | `@expo/vector-icons` | Already in the Expo app | Package licenses already accepted by the shipping app. No new icon font was added. |

The whole Kenney zips are not in the repo. About 40 tower-defense tiles and four UI slices were copied. That set is about 300 KB.

Nothing here is CC-BY, all-rights-reserved, or “personal use only.”
