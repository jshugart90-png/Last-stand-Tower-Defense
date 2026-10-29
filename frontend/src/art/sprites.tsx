import React from 'react';
import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import type { EnemyType, TowerType } from '../constants/game';
import { PAD_DRAW_SCALE, TOWER_DRAW_SCALE, towerArtTier } from '../logic/artMap';

/** Hand-painted fantasy art (original, generated for Last Stand). See docs/ART_MANIFEST.md. */
const towerTiers: Record<TowerType, readonly [ImageSourcePropType, ImageSourcePropType, ImageSourcePropType]> = {
  machine_gun: [
    require('../../assets/art/towers/machine_gun_t0.png'),
    require('../../assets/art/towers/machine_gun_t1.png'),
    require('../../assets/art/towers/machine_gun_t2.png'),
  ],
  sniper: [
    require('../../assets/art/towers/sniper_t0.png'),
    require('../../assets/art/towers/sniper_t1.png'),
    require('../../assets/art/towers/sniper_t2.png'),
  ],
  splash: [
    require('../../assets/art/towers/splash_t0.png'),
    require('../../assets/art/towers/splash_t1.png'),
    require('../../assets/art/towers/splash_t2.png'),
  ],
  freeze: [
    require('../../assets/art/towers/freeze_t0.png'),
    require('../../assets/art/towers/freeze_t1.png'),
    require('../../assets/art/towers/freeze_t2.png'),
  ],
  missile: [
    require('../../assets/art/towers/missile_t0.png'),
    require('../../assets/art/towers/missile_t1.png'),
    require('../../assets/art/towers/missile_t2.png'),
  ],
  laser: [
    require('../../assets/art/towers/laser_t0.png'),
    require('../../assets/art/towers/laser_t1.png'),
    require('../../assets/art/towers/laser_t2.png'),
  ],
  tesla: [
    require('../../assets/art/towers/tesla_t0.png'),
    require('../../assets/art/towers/tesla_t1.png'),
    require('../../assets/art/towers/tesla_t2.png'),
  ],
  flak: [
    require('../../assets/art/towers/flak_t0.png'),
    require('../../assets/art/towers/flak_t1.png'),
    require('../../assets/art/towers/flak_t2.png'),
  ],
  cannon: [
    require('../../assets/art/towers/cannon_t0.png'),
    require('../../assets/art/towers/cannon_t1.png'),
    require('../../assets/art/towers/cannon_t2.png'),
  ],
};

const enemyFrames: Record<EnemyType, readonly [ImageSourcePropType, ImageSourcePropType]> = {
  basic: [require('../../assets/art/enemies/basic.png'), require('../../assets/art/enemies/basic.png')],
  fast: [require('../../assets/art/enemies/fast.png'), require('../../assets/art/enemies/fast.png')],
  tank: [require('../../assets/art/enemies/tank.png'), require('../../assets/art/enemies/tank.png')],
  armored: [require('../../assets/art/enemies/armored.png'), require('../../assets/art/enemies/armored.png')],
  boss: [require('../../assets/art/enemies/boss.png'), require('../../assets/art/enemies/boss.png')],
  shielded: [require('../../assets/art/enemies/shielded.png'), require('../../assets/art/enemies/shielded.png')],
  healer: [require('../../assets/art/enemies/healer.png'), require('../../assets/art/enemies/healer.png')],
  splitter: [require('../../assets/art/enemies/splitter.png'), require('../../assets/art/enemies/splitter.png')],
  flying: [require('../../assets/art/enemies/flying_0.png'), require('../../assets/art/enemies/flying_1.png')],
};

export const uiArt = {
  buttonBlue: require('../../assets/art/ui/button_blue.png') as ImageSourcePropType,
  buttonRed: require('../../assets/art/ui/button_red.png') as ImageSourcePropType,
  panel: require('../../assets/art/ui/panel.png') as ImageSourcePropType,
  buttonSquare: require('../../assets/art/ui/button_square.png') as ImageSourcePropType,
};

export const terrainArt = {
  grass: require('../../assets/art/terrain/grass.png') as ImageSourcePropType,
  grassAlt: require('../../assets/art/terrain/grass_alt.png') as ImageSourcePropType,
  path: require('../../assets/art/terrain/path.png') as ImageSourcePropType,
  decor: require('../../assets/art/terrain/decor_rocks.png') as ImageSourcePropType,
  /** Extra decor variants; pick one per cell, e.g. by (col * 7 + row) % 3. */
  decorVariants: [
    require('../../assets/art/terrain/decor_rocks.png'),
    require('../../assets/art/terrain/decor_bush.png'),
    require('../../assets/art/terrain/decor_pine.png'),
  ] as ImageSourcePropType[],
  /** Grass texture, opaque at the top, fading out. Rotate for the other edges. */
  edgeFade: require('../../assets/art/terrain/edge_fade.png') as ImageSourcePropType,
  vignette: require('../../assets/art/terrain/vignette.png') as ImageSourcePropType,
  spawn: require('../../assets/art/terrain/spawn_portal.png') as ImageSourcePropType,
  base: require('../../assets/art/terrain/base_gate.png') as ImageSourcePropType,
};

const bases = [
  require('../../assets/art/towers/pad_t0.png'),
  require('../../assets/art/towers/pad_t1.png'),
  require('../../assets/art/towers/pad_t2.png'),
] as const;
const bullets: Record<TowerType, ImageSourcePropType> = {
  machine_gun: require('../../assets/art/projectiles/machine_gun.png'),
  sniper: require('../../assets/art/projectiles/sniper.png'),
  splash: require('../../assets/art/projectiles/splash.png'),
  freeze: require('../../assets/art/projectiles/freeze.png'),
  missile: require('../../assets/art/projectiles/missile.png'),
  laser: require('../../assets/art/projectiles/laser.png'),
  tesla: require('../../assets/art/projectiles/tesla.png'),
  flak: require('../../assets/art/projectiles/flak.png'),
  cannon: require('../../assets/art/projectiles/cannon.png'),
};
const bursts = [
  require('../../assets/art/effects/burst_0.png'),
  require('../../assets/art/effects/burst_1.png'),
  require('../../assets/art/effects/burst_2.png'),
  require('../../assets/art/effects/burst_3.png'),
] as const;

export function TowerPicture({
  type,
  level,
  size,
  style,
}: {
  type: TowerType;
  level: number;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const tier = towerArtTier(level);
  const pad = size * (PAD_DRAW_SCALE / TOWER_DRAW_SCALE);
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Image
        source={bases[tier]}
        style={{
          position: 'absolute',
          width: pad,
          height: pad,
          left: (size - pad) / 2,
          bottom: size * 0.02,
        }}
        resizeMode="contain"
      />
      <Image
        source={towerTiers[type][tier]}
        style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

export function EnemyPicture({
  type,
  frame,
  size,
}: {
  type: EnemyType;
  frame: 0 | 1;
  size: number;
}) {
  return <Image source={enemyFrames[type][frame]} style={{ width: size, height: size }} resizeMode="contain" />;
}

export function ShotPicture({ towerType, size }: { towerType: TowerType; size: number }) {
  return (
    <Image source={bullets[towerType] ?? bullets.machine_gun} style={{ width: size, height: size }} resizeMode="contain" />
  );
}

export function BurstPicture({ frame, size }: { frame: 0 | 1 | 2 | 3; size: number }) {
  return <Image source={bursts[frame]} style={{ width: size, height: size }} resizeMode="contain" />;
}
