import type { EnemyType } from '../constants/game';

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
