import type { EnemyType, TowerType } from '../constants/game';

/** 0 = first gun, 1 = mid upgrade, 2 = top tier. Level 0 stays on the first sprite. */
export function towerArtTier(level: number): 0 | 1 | 2 {
  if (level >= 3) return 2;
  if (level >= 1) return 1;
  return 0;
}

/** Flying units alternate two frames. Everyone else bobs on a single sprite. */
export function enemyArtFrame(type: EnemyType, nowTs: number): 0 | 1 {
  if (type !== 'flying') return 0;
  return Math.floor(nowTs / 180) % 2 === 0 ? 0 : 1;
}

export function burstArtFrame(nowTs: number): 0 | 1 | 2 | 3 {
  return (Math.floor(nowTs / 90) % 4) as 0 | 1 | 2 | 3;
}

export const TOWER_ART_TIERS: Record<TowerType, readonly [number, number, number]> = {
  machine_gun: [203, 204, 270],
  sniper: [205, 206, 271],
  splash: [226, 227, 293],
  freeze: [228, 229, 294],
  missile: [245, 226, 271],
  laser: [246, 227, 291],
  tesla: [247, 228, 294],
  flak: [248, 229, 293],
  cannon: [248, 206, 270],
};

export const ENEMY_ART: Record<EnemyType, readonly [number, number]> = {
  basic: [249, 249],
  fast: [250, 250],
  tank: [268, 268],
  armored: [269, 269],
  boss: [250, 268],
  flying: [291, 292],
  shielded: [249, 269],
  healer: [251, 251],
  splitter: [252, 252],
};
