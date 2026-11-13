# Audio licenses

The four looping beds are CC0 recordings, encoded as AAC in m4a at about 128 kbps. Together they are about 6.0 MB. Each license was checked on the asset page linked below. None of those pages list CC-BY, CC-BY-SA, NC, GPL, or OGA-BY.

| Role | File | Track | Author | Page | License |
| --- | --- | --- | --- | --- | --- |
| Home | `frontend/assets/audio/menu.m4a` | Mystical RPG Maker Town Theme | symphony | https://opengameart.org/content/mystical-rpg-maker-town-theme | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Battle | `frontend/assets/audio/battle.m4a` | Hope | MintoDog | https://opengameart.org/content/hopeorchestral-battle-music | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Battle 2 | `frontend/assets/audio/battle2.m4a` | Great Labyrinth | MintoDog | https://opengameart.org/content/great-labyrinthorchestral-dungeon-music | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Boss | `frontend/assets/audio/boss.m4a` | Determined Pursuit | Emma_MA | https://opengameart.org/content/determined-pursuit-epic-orchestra-loop | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

Still synthesized in `frontend/src/services/audioService.ts` (original, no third-party recording): the defeat sting, tower shots, impacts, enemy deaths, the wave horn, and the victory sting. The defeat bed is the only music that is still synth.

| Asset | Where | Source | License |
| --- | --- | --- | --- |
| `click.wav` | `frontend/assets/kenney/sfx/click.wav` | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tap.wav` | `frontend/assets/kenney/sfx/tap.wav` | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

Kenney files are used for UI confirm, combo, chest, record, build, and upgrade. Mute, the sliders, and the music crossfade are unchanged. Battle tracks still rotate by map and wave. The boss file plays only during a live boss wave.
