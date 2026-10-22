import type { EnemyType } from '../constants/game';

/** Painted towers rise above the cell. Pads stay inside it. */
export const TOWER_DRAW_SCALE = 1.45;
export const PAD_DRAW_SCALE = 0.92;
export const ENEMY_DRAW_SCALE = 1;
export const BOSS_DRAW_SCALE = 1.35;

/**
 * Arrow and bolt sprites point up-right (about -45° in screen space, y down).
 * Subtract this from atan2 degrees. React Native rotate is clockwise.
 */
export const PROJECTILE_ART_HEADING_DEG = -45;

/** 0 = first tier, 1 = mid upgrade, 2 = top tier. Level 0 stays on the first sprite. */
export function towerArtTier(level: number): 0 | 1 | 2 {
  if (level >= 3) return 2;
  if (level >= 1) return 1;
  return 0;
}

export function projectileAngleDeg(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) * 180) / Math.PI - PROJECTILE_ART_HEADING_DEG;
}

/** Play the four explosion frames once across a burst's life. */
export function burstFrameFromAge(ageMs: number): 0 | 1 | 2 | 3 {
  if (ageMs < 90) return 0;
  if (ageMs < 180) return 1;
  if (ageMs < 320) return 2;
  return 3;
}

/** Sparse darker grass so the meadow is not a checkerboard. */
export function grassUsesAlt(col: number, row: number): boolean {
  return (col * 17 + row * 31) % 7 === 0;
}

/** 0 rock, 1 bush, 2 pine, or null. Stable for a cell. */
export function decorVariant(col: number, row: number): 0 | 1 | 2 | null {
  const n = (col * 17 + row * 13) % 13;
  if (n === 0) return 2;
  if (n === 4) return 0;
  if (n === 8) return 1;
  return null;
}

/** Ground sprites face right. Flip when the next path step is to the left. */
export function enemyFacesLeft(fromX: number, toX: number): boolean {
  return toX < fromX - 0.01;
}

/** Flying units alternate two frames. Everyone else bobs on a single sprite. */
export function enemyArtFrame(type: EnemyType, nowTs: number): 0 | 1 {
  if (type !== 'flying') return 0;
  return Math.floor(nowTs / 180) % 2 === 0 ? 0 : 1;
}

export function burstArtFrame(nowTs: number): 0 | 1 | 2 | 3 {
  return (Math.floor(nowTs / 90) % 4) as 0 | 1 | 2 | 3;
}
