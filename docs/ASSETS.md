# Asset licenses

Version 2.3.0 does not add third-party art or audio files. Everything new is original and generated in the app.

| Asset | Where | Source | License |
| --- | --- | --- | --- |
| Sound effects (build, upgrade, shoot, hit, death, wave, win, lose, UI stingers) | Synthesized at runtime in `frontend/src/services/audioService.ts` | Original waveforms written for this game. No sampled recordings. | Original work. The project may use it commercially. No attribution required. |
| Music loops (menu, battle, boss) | Same file, procedural loops | Original compositions (bass drone, pentatonic figures, noise hats). No downloaded stems. | Original work. Commercial use allowed. No attribution required. |
| Defeat bed | Same file, one-shot phrase | Original. | Original work. Commercial use allowed. |
| Tower and enemy art | React Native views plus `@expo/vector-icons` (Ionicons, MaterialCommunityIcons, FontAwesome5) | Icon fonts already depended on by the Expo app | Those icon fonts ship under the licenses bundled with `@expo/vector-icons` (MIT for the package; the underlying icon sets use their own open licenses, already accepted by the shipping app). No new icon font was added. |
| App icon, splash, adaptive icon | `frontend/assets/images/` | Already in the repository before this revamp. Not replaced. | Treated as project-owned art shipped with 2.2.0. No new bitmap was downloaded. |

Nothing in this change is CC-BY, all-rights-reserved, or “free for personal use only.” No asset was taken from a marketplace, Kenney, OpenGameArt, or a music library. Procedural audio is not a copy of a CC0 recording; it is generated from code so the license is simply “we made it.”
