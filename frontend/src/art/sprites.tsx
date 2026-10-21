import React from 'react';
import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import type { EnemyType, TowerType } from '../constants/game';
import { ENEMY_ART, TOWER_ART_TIERS, towerArtTier } from '../logic/artMap';

const td = {
  24: require('../../assets/kenney/td/t24.png'),
  25: require('../../assets/kenney/td/t25.png'),
  50: require('../../assets/kenney/td/t50.png'),
  183: require('../../assets/kenney/td/t183.png'),
  180: require('../../assets/kenney/td/t180.png'),
  181: require('../../assets/kenney/td/t181.png'),
  182: require('../../assets/kenney/td/t182.png'),
  203: require('../../assets/kenney/td/t203.png'),
  204: require('../../assets/kenney/td/t204.png'),
  205: require('../../assets/kenney/td/t205.png'),
  206: require('../../assets/kenney/td/t206.png'),
  226: require('../../assets/kenney/td/t226.png'),
  227: require('../../assets/kenney/td/t227.png'),
  228: require('../../assets/kenney/td/t228.png'),
  229: require('../../assets/kenney/td/t229.png'),
  245: require('../../assets/kenney/td/t245.png'),
  246: require('../../assets/kenney/td/t246.png'),
  247: require('../../assets/kenney/td/t247.png'),
  248: require('../../assets/kenney/td/t248.png'),
  249: require('../../assets/kenney/td/t249.png'),
  250: require('../../assets/kenney/td/t250.png'),
  251: require('../../assets/kenney/td/t251.png'),
  252: require('../../assets/kenney/td/t252.png'),
  268: require('../../assets/kenney/td/t268.png'),
  269: require('../../assets/kenney/td/t269.png'),
  270: require('../../assets/kenney/td/t270.png'),
  271: require('../../assets/kenney/td/t271.png'),
  272: require('../../assets/kenney/td/t272.png'),
  273: require('../../assets/kenney/td/t273.png'),
  274: require('../../assets/kenney/td/t274.png'),
  275: require('../../assets/kenney/td/t275.png'),
  276: require('../../assets/kenney/td/t276.png'),
  278: require('../../assets/kenney/td/t278.png'),
  284: require('../../assets/kenney/td/t284.png'),
  286: require('../../assets/kenney/td/t286.png'),
  288: require('../../assets/kenney/td/t288.png'),
  291: require('../../assets/kenney/td/t291.png'),
  292: require('../../assets/kenney/td/t292.png'),
  293: require('../../assets/kenney/td/t293.png'),
  294: require('../../assets/kenney/td/t294.png'),
  295: require('../../assets/kenney/td/t295.png'),
  296: require('../../assets/kenney/td/t296.png'),
  297: require('../../assets/kenney/td/t297.png'),
  298: require('../../assets/kenney/td/t298.png'),
} as const;

type TdId = keyof typeof td;

function tile(id: TdId): ImageSourcePropType {
  return td[id];
}

export const uiArt = {
  buttonBlue: require('../../assets/kenney/ui/button-blue.png') as ImageSourcePropType,
  buttonRed: require('../../assets/kenney/ui/button-red.png') as ImageSourcePropType,
  panel: require('../../assets/kenney/ui/panel.png') as ImageSourcePropType,
  buttonSquare: require('../../assets/kenney/ui/button-square.png') as ImageSourcePropType,
};

export const terrainArt = {
  grass: tile(24),
  grassAlt: tile(25),
  path: tile(50),
  decor: tile(183),
};

const bases = [tile(180), tile(181), tile(182)] as const;
const bullets: Record<string, ImageSourcePropType> = {
  machine_gun: tile(272),
  sniper: tile(273),
  splash: tile(274),
  freeze: tile(275),
  missile: tile(251),
  laser: tile(291),
  tesla: tile(272),
  flak: tile(274),
  cannon: tile(275),
};
const bursts = [tile(295), tile(296), tile(297), tile(298)] as const;

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
  const gunId = TOWER_ART_TIERS[type][tier] as TdId;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Image source={bases[tier]} style={{ width: size, height: size }} resizeMode="contain" />
      <Image
        source={tile(gunId)}
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
  const id = ENEMY_ART[type][frame] as TdId;
  return <Image source={tile(id)} style={{ width: size, height: size }} resizeMode="contain" />;
}

export function ShotPicture({ towerType, size }: { towerType: TowerType; size: number }) {
  return (
    <Image source={bullets[towerType] ?? tile(272)} style={{ width: size, height: size }} resizeMode="contain" />
  );
}

export function BurstPicture({ frame, size }: { frame: 0 | 1 | 2 | 3; size: number }) {
  return <Image source={bursts[frame]} style={{ width: size, height: size }} resizeMode="contain" />;
}
