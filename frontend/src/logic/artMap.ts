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

/** Stable 0..1 value. Same cell and salt always return the same number. */
export function cellUnit(col: number, row: number, salt: number): number {
  let n =
    Math.imul(col + 19, 374761393) ^
    Math.imul(row + 7, 668265263) ^
    Math.imul(salt + 3, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

export type DecorSpot = {
  /** 0 rock, 1 bush, 2 pine */
  variant: 0 | 1 | 2;
  /** Offset from the cell center, in cell widths. */
  dx: number;
  dy: number;
  scale: number;
};

/**
 * A few props in the open meadow. Null on most cells so they do not line up
 * in columns. Callers still skip the path and the cells beside it.
 */
export function decorSpot(col: number, row: number): DecorSpot | null {
  if (cellUnit(col, row, 11) > 0.28) return null;
  const variant = Math.floor(cellUnit(col, row, 12) * 3) as 0 | 1 | 2;
  const pine = variant === 2;
  return {
    variant,
    dx: (cellUnit(col, row, 13) - 0.5) * 0.9,
    dy: (cellUnit(col, row, 14) - 0.5) * 0.9,
    scale: pine ? 0.95 + cellUnit(col, row, 15) * 0.5 : 0.42 + cellUnit(col, row, 15) * 0.58,
  };
}

export type PathBlob = {
  dx: number;
  dy: number;
  scale: number;
  rot: number;
};

/** Overlapping dirt blobs so a straight route does not read as a tile strip. */
export function pathBlobs(col: number, row: number): PathBlob[] {
  const main: PathBlob = {
    dx: (cellUnit(col, row, 1) - 0.5) * 0.42,
    dy: (cellUnit(col, row, 2) - 0.5) * 0.34,
    scale: 1.32 + cellUnit(col, row, 3) * 0.62,
    rot: (cellUnit(col, row, 4) - 0.5) * 32,
  };
  const side: PathBlob = {
    dx: (cellUnit(col, row, 5) - 0.5) * 0.95,
    dy: (cellUnit(col, row, 6) - 0.5) * 0.95,
    scale: 0.7 + cellUnit(col, row, 7) * 0.55,
    rot: (cellUnit(col, row, 8) - 0.5) * 70,
  };
  return [main, side];
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
