import type { TowerType } from '../constants/game';

export type TowerPath = 'none' | 'alpha' | 'beta';

export const PATH_CHOICE_LEVEL = 2;

export type PathInfo = { id: Exclude<TowerPath, 'none'>; name: string; blurb: string };

export const TOWER_PATHS: Record<TowerType, { alpha: PathInfo; beta: PathInfo }> = {
  machine_gun: {
    alpha: { id: 'alpha', name: 'Overclock', blurb: 'Shoots much faster.' },
    beta: { id: 'beta', name: 'Hollow points', blurb: 'Heavier bullets, slower cycle.' },
  },
  sniper: {
    alpha: { id: 'alpha', name: 'Piercing round', blurb: 'Ignores most armor.' },
    beta: { id: 'beta', name: 'Deadeye', blurb: 'Bigger hits, longer reload.' },
  },
  splash: {
    alpha: { id: 'alpha', name: 'Wide bore', blurb: 'Larger blast.' },
    beta: { id: 'beta', name: 'Incendiary', blurb: 'Hotter payload.' },
  },
  freeze: {
    alpha: { id: 'alpha', name: 'Deep freeze', blurb: 'Stronger, longer slow.' },
    beta: { id: 'beta', name: 'Shatter', blurb: 'The ice itself hurts.' },
  },
  missile: {
    alpha: { id: 'alpha', name: 'Cluster', blurb: 'Wider explosion.' },
    beta: { id: 'beta', name: 'Rapid rack', blurb: 'Reloads sooner.' },
  },
  laser: {
    alpha: { id: 'alpha', name: 'Focus lens', blurb: 'Ramp climbs faster.' },
    beta: { id: 'beta', name: 'Split beam', blurb: 'A weaker beam jumps once.' },
  },
  tesla: {
    alpha: { id: 'alpha', name: 'Fork', blurb: 'Chains to more targets.' },
    beta: { id: 'beta', name: 'Overcharge', blurb: 'Harder arcs.' },
  },
  flak: {
    alpha: { id: 'alpha', name: 'Proximity', blurb: 'Wider airburst.' },
    beta: { id: 'beta', name: 'Heavy shell', blurb: 'More punch per burst.' },
  },
  cannon: {
    alpha: { id: 'alpha', name: 'Sabot', blurb: 'Punches straight through armor.' },
    beta: { id: 'beta', name: 'Siege', blurb: 'Slower, much harder shot.' },
  },
};

export type ResolvedStats = {
  damage: number;
  fireRate: number;
  range: number;
  projectileSpeed: number;
  splashRadius?: number;
  slowAmount?: number;
  slowDuration?: number;
  damageRampUp?: number;
  maxDamageMultiplier?: number;
  pierce: number;
  airMultiplier: number;
  groundMultiplier: number;
  chain: number;
};

type BaseStats = {
  damage: number;
  fireRate: number;
  range: number;
  projectileSpeed?: number;
  splashRadius?: number;
  slowAmount?: number;
  slowDuration?: number;
  damageRampUp?: number;
  maxDamageMultiplier?: number;
};

const AIR: Record<TowerType, number> = {
  machine_gun: 0.55,
  sniper: 1,
  splash: 0.35,
  freeze: 0.7,
  missile: 1.05,
  laser: 1,
  tesla: 0,
  flak: 1.65,
  cannon: 0.2,
};

const GROUND: Record<TowerType, number> = {
  machine_gun: 1,
  sniper: 1,
  splash: 1,
  freeze: 1,
  missile: 1,
  laser: 1,
  tesla: 1,
  flak: 0.4,
  cannon: 1,
};

const PIERCE: Record<TowerType, number> = {
  machine_gun: 0,
  sniper: 0.2,
  splash: 0,
  freeze: 0,
  missile: 0.1,
  laser: 0.15,
  tesla: 0,
  flak: 0,
  cannon: 0.72,
};

const CHAIN: Record<TowerType, number> = {
  machine_gun: 0,
  sniper: 0,
  splash: 0,
  freeze: 0,
  missile: 0,
  laser: 0,
  tesla: 2,
  flak: 0,
  cannon: 0,
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function isTowerPath(value: unknown): value is TowerPath {
  return value === 'none' || value === 'alpha' || value === 'beta';
}

export function normalizeTowerPath(value: unknown): TowerPath {
  return isTowerPath(value) ? value : 'none';
}

/** True when the next upgrade must pick a specialization. Older high-level towers stay on the generic path. */
export function needsPathChoice(level: number, path: TowerPath): boolean {
  return level === PATH_CHOICE_LEVEL && path === 'none';
}

export function resolveTowerStats(
  type: TowerType,
  baseStats: BaseStats,
  level: number,
  shopLevel: number,
  path: TowerPath,
  calibrationLevel: number
): ResolvedStats {
  const lv = Math.max(0, level);
  const multiplier = Math.pow(1.15, lv);
  let damage = Math.floor(baseStats.damage * multiplier);
  let range = baseStats.range + lv * 0.15;
  let fireRate = Math.max(50, baseStats.fireRate - lv * 15);
  let splashRadius = baseStats.splashRadius;
  let slowAmount = baseStats.slowAmount;
  let slowDuration = baseStats.slowDuration;
  let damageRampUp = baseStats.damageRampUp;
  const shop = Math.max(0, shopLevel);
  if (shop > 0) {
    damage = Math.floor(damage * Math.pow(1.05, shop));
    range *= 1 + shop * 0.02;
  }
  const calib = Math.max(0, calibrationLevel);
  if (calib > 0) damage = Math.floor(damage * (1 + 0.02 * calib));

  let pierce = PIERCE[type] ?? 0;
  let airMultiplier = AIR[type] ?? 1;
  let groundMultiplier = GROUND[type] ?? 1;
  let chain = CHAIN[type] ?? 0;

  if (path !== 'none' && lv >= 3) {
    if (type === 'machine_gun' && path === 'alpha') {
      fireRate = Math.max(50, fireRate * 0.7);
      damage = Math.floor(damage * 0.92);
    } else if (type === 'machine_gun' && path === 'beta') {
      damage = Math.floor(damage * 1.38);
      fireRate *= 1.08;
    } else if (type === 'sniper' && path === 'alpha') {
      pierce = 0.9;
    } else if (type === 'sniper' && path === 'beta') {
      damage = Math.floor(damage * 1.42);
      fireRate *= 1.12;
    } else if (type === 'splash' && path === 'alpha' && splashRadius) {
      splashRadius += 0.65;
    } else if (type === 'splash' && path === 'beta') {
      damage = Math.floor(damage * 1.28);
    } else if (type === 'freeze' && path === 'alpha') {
      slowAmount = Math.min(0.8, (slowAmount ?? 0.5) + 0.2);
      slowDuration = Math.floor((slowDuration ?? 2000) * 1.4);
    } else if (type === 'freeze' && path === 'beta') {
      damage = Math.floor(damage * 2.2);
    } else if (type === 'missile' && path === 'alpha' && splashRadius) {
      splashRadius += 0.5;
    } else if (type === 'missile' && path === 'beta') {
      fireRate = Math.max(50, fireRate * 0.66);
    } else if (type === 'laser' && path === 'alpha') {
      damageRampUp = (damageRampUp ?? 0.5) * 1.8;
    } else if (type === 'laser' && path === 'beta') {
      chain = 1;
      damage = Math.floor(damage * 0.85);
    } else if (type === 'tesla' && path === 'alpha') {
      chain += 1;
    } else if (type === 'tesla' && path === 'beta') {
      damage = Math.floor(damage * 1.4);
    } else if (type === 'flak' && path === 'alpha' && splashRadius) {
      splashRadius += 0.45;
      airMultiplier *= 1.12;
    } else if (type === 'flak' && path === 'beta') {
      damage = Math.floor(damage * 1.35);
    } else if (type === 'cannon' && path === 'alpha') {
      pierce = 1;
    } else if (type === 'cannon' && path === 'beta') {
      damage = Math.floor(damage * 1.32);
      fireRate *= 1.1;
    }
  }

  return {
    damage,
    fireRate,
    range,
    projectileSpeed: baseStats.projectileSpeed ?? 0,
    splashRadius,
    slowAmount,
    slowDuration,
    damageRampUp,
    maxDamageMultiplier: baseStats.maxDamageMultiplier,
    pierce: clamp01(pierce),
    airMultiplier,
    groundMultiplier,
    chain,
  };
}

export function canTargetEnemy(flying: boolean, airMultiplier: number, groundMultiplier: number): boolean {
  return flying ? airMultiplier > 0 : groundMultiplier > 0;
}

export function computeHitDamage(args: {
  raw: number;
  flying: boolean;
  airMultiplier: number;
  groundMultiplier: number;
  armor: number;
  pierce: number;
  damageReduction: number;
  doubleDamage: boolean;
}): number {
  if (!(args.raw > 0)) return 0;
  const mult = args.flying ? args.airMultiplier : args.groundMultiplier;
  if (mult <= 0) return 0;
  let raw = args.raw * mult;
  if (args.doubleDamage) raw *= 2;
  const armorLeft = Math.max(0, args.armor) * (1 - clamp01(args.pierce));
  const afterArmor = Math.max(0, raw - armorLeft);
  const reduction = Math.max(0, Math.min(0.85, args.damageReduction));
  return afterArmor * (1 - reduction);
}

export function nearestOtherIds(
  origin: { x: number; y: number },
  selfId: string,
  enemies: { id: string; x: number; y: number }[],
  count: number,
  maxDist: number
): string[] {
  if (count <= 0) return [];
  const maxSq = maxDist * maxDist;
  const ranked: { id: string; d: number }[] = [];
  for (const e of enemies) {
    if (e.id === selfId) continue;
    const dx = e.x - origin.x;
    const dy = e.y - origin.y;
    const d = dx * dx + dy * dy;
    if (d <= maxSq) ranked.push({ id: e.id, d });
  }
  ranked.sort((a, b) => a.d - b.d);
  return ranked.slice(0, count).map((r) => r.id);
}
