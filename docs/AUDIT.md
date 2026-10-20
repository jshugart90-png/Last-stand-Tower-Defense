# Last Stand Tower Defense — quality audit

Audited against the source that shipped as the 2.3.0 codebase on `main` (App Store live build is 2.2.0, app id 6765792833). This document is the pre-revamp findings, ranked by what a player actually feels. It does not describe the fixes.

## Stack and build pipeline

| Layer | What it is |
| --- | --- |
| Client | Expo SDK 54, React Native 0.81, React 19, expo-router, TypeScript, Zustand persist (AsyncStorage) |
| Simulation | One `requestAnimationFrame` loop in `frontend/app/game.tsx` stepping `gameTick` at 30 Hz (up to 14 substeps) |
| Audio | `expo-av` plus procedural WAVs written into the cache by `frontend/src/services/audioService.ts` |
| Purchases | `expo-iap`. Product ids live in `playerStore` and `iapService` (`com.laststanddefense.*`) |
| Backend | FastAPI (`backend/server.py`) on Render (`https://last-stand-td-api.onrender.com`), Mongo or Supabase via `DB_PROVIDER`. Routes under `/api/players`, `/api/games/end`, `/api/purchases` |
| Config | `frontend/app.json` (bundle `com.horseshoeroundme.laststandtowerdefense`, EAS project `7b990481-5fbc-492f-905e-6e0c24a31bf7`), `frontend/eas.json` production profile auto-submits to ASC app `6765792833` |
| Checks in repo | Root `npm run lint` (Expo ESLint), `npm run qc:release` (preflight + Python HTTP tests). No frontend unit tests. GitHub Actions (`.github/workflows/backend-tests.yml`) runs the Python suites on `main` only |
| TestFlight | `frontend/package.json` has `eas:ios:testflight`, but there is no CI workflow that builds or submits. A TestFlight build needs EAS credentials that are not in this environment |

Ads are still compiled in: `react-native-google-mobile-ads` and `expo-tracking-transparency` are dependencies, the AdMob config plugin is in `app.json` (real iOS app id `ca-app-pub-9533265028371895~9506046815`), and `_layout.tsx` calls `initializeAds()` on launch.

## How sound and music actually behave

Music is not implemented. `musicEnabled` and `musicVolume` are persisted and shown in Settings. The player-store comment says they are “for background music when implemented.” Nothing loads a track, loops one, or crossfades.

Sound effects are off for almost everyone:

- The factory value of `soundEnabled` is `false`.
- The persist `merge` writes `false` again whenever the saved value is missing.
- The first launch persists that mute, so existing players who never found the switch stay silent. There is no way to tell a deliberate mute from the default, because both are stored as `false`.

When sound is turned on, combat audio is one sample. Laser, machine gun, impacts, deaths, and base hits all replay a single shared “combat pool” wav. Sniper and freeze have their own blips. Splash and missile never play a shot, only the shared impact. There is no build, upgrade, win, or lose stinger.

Other audio failures:

- **One native error kills combat audio for the rest of the run.** `replayAsync` failures set `gameplayNativeHardOff`. Every later shot, hit, death, and wave horn is dropped until `stopAllSounds()`. Interrupted playback on iOS is common.
- **Wave end calls `stopAllSounds()`**, which also disarms gameplay SFX. Building and upgrading between waves is silent until the next wave re-arms audio.
- **Loading.** Each effect is synthesized at 44.1 kHz and written through `expo-file-system` into `cacheDirectory`. If that directory is null (web, or a storage failure), init fails quietly and `audioReady` stays false. There is no data-URI fallback.
- **Session.** `playsInSilentModeIOS: true` and `InterruptionModeIOS.DuckOthers` are set, so a working game would ignore the hardware silent switch. That is normal for games, but it is never explained. Combined with the default mute, the silent switch is not why players hear nothing — the mute flag is.
- **Background.** `staysActiveInBackground` is false, and returning to the foreground only re-applies the audio mode. There is no music to pause, and in-flight SFX are not explicitly stopped. A failure during that interruption can trip the hard-off switch above.
- **Volumes.** SFX volume is read from the store at play time and does persist. Music volume persists and does nothing.

## Ranked issues

### P0 — players feel this every session

1. **No music, and SFX default to muted.** The game is silent. Settings imply music exists.
2. **Combat audio collapses to one beep, then can disable itself.** Even with sound on, guns do not sound different, and a single `expo-av` rejection mutes the rest of the run.
3. **It still plays like a basic tower defense.** Six towers, one linear “+15% stats” upgrade, no specialization. Enemies are colored squares. Fast, tank, boss, shielded, healer, and splitter exist, but there is no flying unit and no flat armor that changes which tower you bring. Waves after wave 10 repeat the same ratios.
4. **Visuals are flat.** Tactical-red UI, icon towers, square enemies, a health bar, gold projectiles. No hit flash, damage numbers, death bursts, or screen shake. `vfxQuality` only drops laser and projectile counts. The board does not read as a finished mobile game.
5. **Ads are still live in the client** (banners on Home and Shop, game-over interstitial, rewarded revive, rewarded gems, ATT prompt whose purpose string is about ads). The AdMob account was rejected. The ads module comment says a mismatched app id can crash the native SDK on launch. Revive and a gem source are tied to ads, so turning ads off without a replacement removes the only continue.

### P1 — bugs, crash risks, and review risk

6. **Login cannot ride out a Render cold start.** Axios timeout is 30 seconds. `playerApi.create` retries twice with a 1.5 second gap, so a 40–60 second wake fails both attempts. `getById` and `getByDevice` do not retry. The splash only says “Loading…”. The nickname submit’s outer `catch` shows `Alert.alert('Error', 'Something went wrong. Please try again.')`. That class of server error is what Apple cited under guideline 2.1(a). The inner create failure does fall back to a local profile, but only after the timeout, and only if it stays inside the inner `catch`.
7. **Laser ramp never ramps.** While the laser is on cooldown (~100 ms, and the sim ticks at ~33 ms), the tick sets `currentTargetId` to null and `damageAccumulator` to 0. The advertised “damage builds on the same target” behavior resets every tick the gun is not firing.
8. **Returning players are blocked on the network** before Home appears, even though a full local save already exists. A down server means a long spinner instead of a game.
9. **`syncFromServer` replaces `unlockedTowers` with the server list.** A tower unlocked with gems on device can disappear the next time `/api/players/:id` returns an older list.
10. **New tower keys would crash or NaN prices** if added naively. `towerPurchaseCount[type] + 1` and `getTowerCost` do not treat a missing key as zero (`undefined + 1` is `NaN`). Shop upgrade price maps are a closed `Record<TowerType, number>`.
11. **Premium bundle is only “remove ads.”** Product id `com.laststanddefense.premium_bundle` must stay. If ads are removed for everyone, the store screen cannot keep selling ad removal.

### P2 — performance and game feel

12. **The sim commits a new enemies/towers/projectiles array every 33 ms substep**, and combat views re-render from that. Mid-range phones can hold it at modest counts, but healer auras are O(n²), laser beams allocate views every tick, and there is no budget left for uncapped particles. VFX has to be capped or the 60 fps goal slips.
13. **Simulation is 30 Hz**, with render lead on projectiles only. That is acceptable if the frame stays light. Screen shake must run on the UI thread (Reanimated), not as more React state per frame.
14. **Path rebuild on every placement** runs A* for every ground enemy. Fine at current counts. Flying units must not be shoved onto the ground path or they stop being flying.
15. **`Math.random().toString(36).substr` ids** can collide and `substr` is legacy. Not player-facing until a collision merges two entities.

### P3 — depth, onboarding, balance, UX rough edges

16. **Tutorial is three generic cards** (“place towers”, “defend”, “upgrade”) and it blocks Play until dismissed. It never points at the path, a tower button, or Start Wave. `tutorialCompleted` is persisted, so a better lesson must not trap veterans who already finished the cards.
17. **No difficulty mode.** Map “difficulty” is a label plus hidden health/speed multipliers and a gem gate. Players cannot choose an easier or harder ruleset.
18. **Meta progression is thin:** gem unlocks, a shop stat level per tower, starting coins, coin income, speed unlocks, skins, logos, daily/weekly missions, and a short achievement list. No base-fortify or global damage calibration. Achievements do not mention bosses or special units.
19. **Maps stop at Dusk Causeway** (11 total, including Free Play). Routes are real and validated, which is good, but the late game is the same four or five enemy mixes on a longer path.
20. **Economy notes already in code:** gem payouts were raised in 2.3 because runs paid about one gem; map gem costs were halved because the old total was absurd. Those knobs should not be casually retuned again.
21. **Age rating / tracking copy.** `NSUserTrackingUsageDescription` and the tracking plugin tell Apple the app tracks users to show more relevant ads. That has to go if ads go, or the privacy nutrition label stays wrong.
22. **Home, shop, and results are dense** but usable: nickname, missions, and IAP restore exist. Rough edges are the silent audio sliders, ad buttons that depend on a rejected network, and a game-over “Watch & Revive” that is the only continue.

## What must not break

- IAP product ids, receipt fields, and `POST /api/purchases`.
- Player create/get/patch shape (`nickname`, `device_id`, `_id`, gems, xp, premium, arena expansions).
- AsyncStorage key `last-stand-player`. New fields need defaults. Existing `unlockedTowers`, gems, level, map best waves, achievements, and in-progress `savedGame` towers (no specialization field) must still load.
- No ads, no AdMob re-enable, no loot boxes, no secret changes, no App Store submit from this work.

## Suggested order of work

1. Make audio real: default-on migration that does not override a later mute, distinct SFX, looping music per phase with crossfades, pause when backgrounded, explain the silent switch.
2. Stop initializing AdMob. Replace revive with a gem continue. Reframe the existing premium product so it still delivers something.
3. Login: long timeout, retries, friendly copy, never a raw server alert; do not block Home when a local profile exists.
4. Fix the laser ramp and the tower-count NaN trap. Keep saves compatible.
5. Add towers with a branch at upgrade level 3, flying and armored enemies, two maps, difficulty, two meta upgrades, a few achievements, and a short tutorial that veterans skip.
6. Hit flash, capped damage numbers and bursts, UI-thread shake, clearer enemy shapes and HUD.
7. Unit tests around the pure combat, wave, save, and login helpers. Typecheck and lint. No TestFlight unless CI already can submit, which it cannot.
