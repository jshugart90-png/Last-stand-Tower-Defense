# Art manifest: painted fantasy set (v2.3 reskin)

Original hand-painted fantasy art generated for Last Stand Tower Defense (style picked by John: "look A"). It replaces every Kenney bitmap the game used. Transparent PNGs except terrain tiles and app icons. One file per resolution; React Native scales them (sprites are 256 px, about 3x the largest on-screen size).

Tower ids are unchanged; only the look is fantasy:

| Tower id | Shown as |
| --- | --- |
| machine_gun | Archer Tower |
| sniper | Ranger Spire |
| splash | Alchemist Tower |
| freeze | Frost Mage Tower |
| missile | Fire Mage Tower |
| laser | Arcane Crystal Tower |
| tesla | Storm Mage Tower (lightning) |
| flak | Ballista Tower |
| cannon | Dwarven Cannon Tower |

Tier files: `_t0` = level 0, `_t1` = levels 1-2, `_t2` = level 3+ (see `towerArtTier`). Tower sprites are bottom-anchored in a square canvas (the base of the tower sits at the bottom edge). Enemies are centered. Flying has two wing frames (`flying_0`, `flying_1`); everything else is one frame. Burst is a 4-frame sequence.

| File | Size | Depicts |
| --- | --- | --- |
| `frontend/assets/art/towers/machine_gun_t0.png` | 256×256 | Archer Tower tier 1: wooden archer watchtower, thatched roof |
| `frontend/assets/art/towers/machine_gun_t1.png` | 256×256 | Archer Tower tier 2: stone-and-wood archer tower, red banners |
| `frontend/assets/art/towers/machine_gun_t2.png` | 256×256 | Archer Tower tier 3: grand stone archer fortress, gold trim, blue roof |
| `frontend/assets/art/towers/sniper_t0.png` | 256×256 | Ranger Spire tier 1: slender pale-stone spire, green roof, hooded ranger |
| `frontend/assets/art/towers/sniper_t1.png` | 256×256 | Ranger Spire tier 2: taller ivy spire, green banners, elven ranger |
| `frontend/assets/art/towers/sniper_t2.png` | 256×256 | Ranger Spire tier 3: white marble elven spire, glowing green crystal, master ranger |
| `frontend/assets/art/towers/splash_t0.png` | 256×256 | Alchemist Tower tier 1: stone hut with bubbling green cauldron |
| `frontend/assets/art/towers/splash_t1.png` | 256×256 | Alchemist Tower tier 2: alchemist tower with copper pipes and flasks |
| `frontend/assets/art/towers/splash_t2.png` | 256×256 | Alchemist Tower tier 3: brass-domed alchemy lab, giant glowing flask, fumes |
| `frontend/assets/art/towers/freeze_t0.png` | 256×256 | Frost Mage Tower tier 1: pale stone tower with ice crystal |
| `frontend/assets/art/towers/freeze_t1.png` | 256×256 | Frost Mage Tower tier 2: frosted tower with icicles and floating crystal |
| `frontend/assets/art/towers/freeze_t2.png` | 256×256 | Frost Mage Tower tier 3: ice citadel with huge frost crystal and swirling snow |
| `frontend/assets/art/towers/missile_t0.png` | 256×256 | Fire Mage Tower tier 1: red-brick tower with flaming brazier |
| `frontend/assets/art/towers/missile_t1.png` | 256×256 | Fire Mage Tower tier 2: dark stone fire tower, glowing runes, fireball orb |
| `frontend/assets/art/towers/missile_t2.png` | 256×256 | Fire Mage Tower tier 3: obsidian volcanic spire, lava, dragon gargoyles, huge fireball |
| `frontend/assets/art/towers/laser_t0.png` | 256×256 | Arcane Crystal Tower tier 1: stone obelisk with purple crystal |
| `frontend/assets/art/towers/laser_t1.png` | 256×256 | Arcane Crystal Tower tier 2: rune-carved tower with large magenta crystal |
| `frontend/assets/art/towers/laser_t2.png` | 256×256 | Arcane Crystal Tower tier 3: gold-and-violet arcane sanctum, floating rings, radiant crystal |
| `frontend/assets/art/towers/tesla_t0.png` | 256×256 | Storm Mage Tower (lightning) tier 1: slate tower with sparking copper lightning rod |
| `frontend/assets/art/towers/tesla_t1.png` | 256×256 | Storm Mage Tower (lightning) tier 2: copper-coiled storm tower with electric orb |
| `frontend/assets/art/towers/tesla_t2.png` | 256×256 | Storm Mage Tower (lightning) tier 3: grand storm spire, floating orb, lightning arcs |
| `frontend/assets/art/towers/flak_t0.png` | 256×256 | Ballista Tower tier 1: timber tower with mounted crossbow |
| `frontend/assets/art/towers/flak_t1.png` | 256×256 | Ballista Tower tier 2: stone tower with iron-banded ballista and bolt racks |
| `frontend/assets/art/towers/flak_t2.png` | 256×256 | Ballista Tower tier 3: gold-trimmed fortress with heavy ballista, red banners |
| `frontend/assets/art/towers/cannon_t0.png` | 256×256 | Dwarven Cannon Tower tier 1: round stone tower with bronze cannon |
| `frontend/assets/art/towers/cannon_t1.png` | 256×256 | Dwarven Cannon Tower tier 2: stone bastion with iron cannon and cannonball stacks |
| `frontend/assets/art/towers/cannon_t2.png` | 256×256 | Dwarven Cannon Tower tier 3: dwarven fortress with gold-and-black bombard, blue runes |
| `frontend/assets/art/towers/pad_t0.png` | 256×256 | Tower build pad tier 1: packed-dirt pad ringed with stones |
| `frontend/assets/art/towers/pad_t1.png` | 256×256 | Tower build pad tier 2: cobblestone pad with stone rim |
| `frontend/assets/art/towers/pad_t2.png` | 256×256 | Tower build pad tier 3: flagstone pad with gold ring and blue rune circle |
| `frontend/assets/art/enemies/basic.png` | 256×256 | Goblin grunt with rusty dagger |
| `frontend/assets/art/enemies/fast.png` | 256×256 | Goblin wolf rider |
| `frontend/assets/art/enemies/tank.png` | 256×256 | Troll brute with spiked club |
| `frontend/assets/art/enemies/armored.png` | 256×256 | Orc in heavy iron plate with horned helm and axe |
| `frontend/assets/art/enemies/shielded.png` | 256×256 | Orc defender with round shield and spear |
| `frontend/assets/art/enemies/healer.png` | 256×256 | Goblin shaman with glowing green bone staff |
| `frontend/assets/art/enemies/splitter.png` | 256×256 | Green ooze slime that splits |
| `frontend/assets/art/enemies/boss.png` | 256×256 | Orc warlord boss in black-and-red spiked armor with war axe |
| `frontend/assets/art/enemies/flying_0.png` | 256×256 | Goblin wyvern rider, wings up (frame 0) |
| `frontend/assets/art/enemies/flying_1.png` | 256×256 | Goblin wyvern rider, wings down (frame 1) |
| `frontend/assets/art/projectiles/machine_gun.png` | 128×128 | Arrow with red fletching |
| `frontend/assets/art/projectiles/sniper.png` | 128×128 | Elven arrow with glowing green tip |
| `frontend/assets/art/projectiles/splash.png` | 128×128 | Green potion flask |
| `frontend/assets/art/projectiles/freeze.png` | 128×128 | Ice shard |
| `frontend/assets/art/projectiles/missile.png` | 128×128 | Fireball |
| `frontend/assets/art/projectiles/laser.png` | 128×128 | Arcane purple bolt |
| `frontend/assets/art/projectiles/tesla.png` | 128×128 | Lightning ball |
| `frontend/assets/art/projectiles/cannon.png` | 128×128 | Iron cannonball with spark |
| `frontend/assets/art/projectiles/flak.png` | 128×128 | Heavy ballista bolt |
| `frontend/assets/art/effects/burst_0.png` | 256×256 | Explosion frame 1: spark flash |
| `frontend/assets/art/effects/burst_1.png` | 256×256 | Explosion frame 2: fireball burst |
| `frontend/assets/art/effects/burst_2.png` | 256×256 | Explosion frame 3: full blast with debris |
| `frontend/assets/art/effects/burst_3.png` | 256×256 | Explosion frame 4: smoke puff with embers |
| `frontend/assets/art/terrain/grass.png` | 256×256 | Painted meadow grass, seamless tile |
| `frontend/assets/art/terrain/grass_alt.png` | 256×256 | Same grass tile, slightly darker (checker variant; edges match grass.png) |
| `frontend/assets/art/terrain/path.png` | 256×256 | Sandy cobblestone road, seamless tile |
| `frontend/assets/art/terrain/decor_rocks.png` | 256×256 | Mossy boulders with wildflowers |
| `frontend/assets/art/terrain/decor_bush.png` | 256×256 | Leafy flowering bush |
| `frontend/assets/art/terrain/decor_pine.png` | 256×256 | Small pine tree |
| `frontend/assets/art/ui/button_blue.png` | 768×244 | Blue enamel button, gold bevel (blank, stretchable) |
| `frontend/assets/art/ui/button_red.png` | 768×234 | Red enamel button, gold bevel (blank, stretchable) |
| `frontend/assets/art/ui/button_square.png` | 256×256 | Square dark-wood button with gold corners |
| `frontend/assets/art/ui/panel.png` | 768×403 | Dark wood plank panel with iron-and-gold frame |
| `frontend/assets/images/icon.png` | 1024×1024 | App icon 1024x1024, no alpha: cannon tower, orc, explosion, sunset |
| `frontend/assets/images/adaptive-icon.png` | 512×512 | Android adaptive foreground 512x512 (full-bleed) |
| `frontend/assets/images/favicon.png` | 48×48 | Web favicon 48x48 |


## Map backgrounds (fixed-path arenas)

One hand-painted background per fixed-path arena map (`ARENA_MAP_LIST` in `frontend/src/constants/arenaMaps.ts`). Free Play (`classic`) has a dynamic path and no painted background; keep the tiled terrain there.

Rendering contract:

- Each image is exactly **64 px per grid cell**: width = `gridCols × 64`, height = `gridRows × 64`. Its aspect ratio is therefore exactly `gridCols : gridRows`, the same as the board (`gridCols × cellSize` by `gridRows × cellSize`, times the zoom scale).
- Draw it as the bottom layer of the board, filling the board exactly: `<Image source={...} style={{ position: 'absolute', left: 0, top: 0, width: boardWidth, height: boardHeight }} resizeMode="stretch" />`. Because the aspects match, `stretch` and `cover` give the same result; no cropping or letterboxing.
- Grid cell `(x, y)` (column x, row y, origin top-left, same as `route` / `spawnPoint` / `basePosition`) covers image pixels `[x·64, (x+1)·64) × [y·64, (y+1)·64)`, i.e. on screen `[x·s, (x+1)·s) × [y·s, (y+1)·s)` with `s = scaledCellSize`.
- The painted road covers every cell in that map's `route`; every other cell is open ground with no trees, boulders or other tall objects, so towers can sit on any of them. When the background is shown, the per-cell floor/path fills (`mapTheme.floor` / `path`) should be transparent; keep the placement preview, range rings and spawn/base markers on top.
- Where a route ends on a board edge the road runs off that edge. The road may be slightly narrower than a full cell, with soft edges; enemies still walk the cell centres.
- Images are baked for the current routes. If a route in `arenaMaps.ts` changes, its background must be regenerated.

| File | Size (px) | Grid | Depicts |
| --- | --- | --- | --- |
| `frontend/assets/art/maps/ash_pass.jpg` | 1024×1280 | 16×20 | Ash Pass: Cinder fields: cobble-and-dirt road, olive grass with grey ash drifts and ember cracks |
| `frontend/assets/art/maps/sunken_mire.jpg` | 896×1408 | 14×22 | Sunken Mire: Swamp: muddy plank road over mossy teal-green marsh grass with small puddles (composited fallback) |
| `frontend/assets/art/maps/obsidian_spiral.jpg` | 1152×1152 | 18×18 | Obsidian Spiral: Pale flagstone spiral road, mossy grass with small obsidian shards |
| `frontend/assets/art/maps/grave_circuit.jpg` | 1088×1216 | 17×19 | Grave Circuit: Old graveyard field: grey cobblestone road, misty moonlit grass, fallen leaves, scattered bones |
| `frontend/assets/art/maps/raven_choke.jpg` | 960×1344 | 15×21 | Raven Choke: Raven forest: dirt road with stone kerbs, forest grass with autumn leaves and raven feathers |
| `frontend/assets/art/maps/crypt_serpent.jpg` | 1024×1408 | 16×22 | Crypt Serpent: Crypt grounds: bone-white flagstone road, dark moss grass, teal moonlight and mist |
| `frontend/assets/art/maps/shadow_fen.jpg` | 1088×1280 | 17×20 | Shadow Fen: Dark marsh: mud road with boardwalk planks, olive fen grass, low fog |
| `frontend/assets/art/maps/void_switchback.jpg` | 960×1472 | 15×23 | Void Switchback: Frozen highland: snow-rimmed cobble road, blue-green grass with snow patches |
| `frontend/assets/art/maps/iron_widow.jpg` | 1152×1216 | 18×19 | Iron Widow: Mining trench: iron-grey cobble road with riveted plates, rust-red soil and grass |
| `frontend/assets/art/maps/dusk_causeway.jpg` | 1024×1344 | 16×21 | Dusk Causeway: Desert causeway: sandstone slab road, golden sand and cracked earth |
| `frontend/assets/art/maps/cinder_ridge.jpg` | 1024×1152 | 16×18 | Cinder Ridge: Burnt ridge: grey cobblestone road, scorched grass with charred ember patches |
| `frontend/assets/art/maps/gale_bastion.jpg` | 896×1280 | 14×20 | Gale Bastion: Windswept meadow: pebbled dirt road, lush green grass with wildflowers |

Sources and processing scripts live outside the repo (generation sheets, background removal with rembg `isnet-general-use`, trimming, seamless tiling).