# Audio licenses

Added music and sound effects are original synthesis generated at runtime in `frontend/src/services/audioService.ts`. They are not downloaded recordings. Disk size added for those tracks is 0 bytes (under the 8 MB budget).

| Asset | Where | Source | License |
| --- | --- | --- | --- |
| Menu, battle, battle 2, boss, and defeat music | Generated in `buildMusic` | Original work for this game | Original. No attribution required. |
| Tower shots, impacts, enemy deaths, wave horn, victory sting, defeat sting | Generated in `audioService.ts` | Original work for this game | Original. No attribution required. |
| `click.wav` | `frontend/assets/kenney/sfx/click.wav` | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tap.wav` | `frontend/assets/kenney/sfx/tap.wav` | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

Kenney files are used for UI confirm, combo, chest, record, build, and upgrade. Everything else the game plays is the original synthesis above.

No NC, ND, or paid audio is included. The in-game mute switch and music/SFX sliders still gate playback, and music crossfades between tracks.
