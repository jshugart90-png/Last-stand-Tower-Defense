# Asset licenses

Version 2.3.0 uses original hand-painted fantasy art generated for this game (see `docs/ART_MANIFEST.md`), the Kenney CC0 fonts and two UI clicks, plus the original generated music and combat sounds as the fallback.

| Asset | Where | Source | License |
| --- | --- | --- | --- |
| Towers (9 types × 3 tiers), build pads, enemies, projectiles, explosion frames, terrain tiles and decor | `frontend/assets/art/` | Original art generated for Last Stand Tower Defense (hand-painted fantasy style) | Original work owned by the app's publisher. Commercial use allowed. No third-party license. |
| Fixed-path map paintings | `frontend/assets/art/maps/<mapId>.jpg` | Original full-board paintings, one per arena, aligned to that map's grid. Free Play has no file and keeps the tiled meadow. | Original work. Commercial use allowed. |
| Path edge fade and board vignette | `frontend/assets/art/terrain/edge_fade.png`, `vignette.png` | Made in-repo from the grass tile and a warm radial darkening, used only when a map has no painting | Original work. Commercial use allowed. |
| Buttons, panel, app icon, adaptive icon, favicon | `frontend/assets/art/ui/`, `frontend/assets/images/icon.png`, `adaptive-icon.png`, `favicon.png` | Original art generated for Last Stand Tower Defense | Original work. Commercial use allowed. |
| Kenney Future and Kenney Future Narrow | `frontend/assets/kenney/font/` | Same UI pack, `Font/` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). |
| UI clicks (`click.wav`, `tap.wav`) | `frontend/assets/kenney/sfx/` | Same UI pack, `Sounds/click-a.ogg` and `Sounds/tap-a.ogg`, converted to 22 kHz WAV so iOS can play them | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). |
| Music (menu, battle, boss, defeat) and combat SFX (shots, impact, death, wave, win, lose) | Synthesized in `frontend/src/services/audioService.ts` | Original. Used when a file clip is missing, and for every looping bed and weapon sound. | Original work. Commercial use allowed. |
| Build and upgrade clicks | Prefer the Kenney tap/click WAVs; the synthesizer runs if the file fails to load | See UI clicks and the audio service | CC0 file, original fallback. |
| Ionicons and related icon fonts still used on a few HUD controls | `@expo/vector-icons` | Already in the Expo app | Package licenses already accepted by the shipping app. No new icon font was added. |

The Kenney tower-defense tiles and UI slices that 2.3.0 first shipped with were removed when the painted set replaced them. Only the Kenney fonts and the two UI click sounds remain from Kenney.

Nothing here is CC-BY, all-rights-reserved, or “personal use only.”
