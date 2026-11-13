export type DifficultyMode = 'casual' | 'normal' | 'veteran' | 'last_stand';

export const DIFFICULTY_MODES: readonly DifficultyMode[] = [
  'casual',
  'normal',
  'veteran',
  'last_stand',
];

export type DifficultyModifiers = {
  id: DifficultyMode;
  label: string;
  blurb: string;
  enemyHealth: number;
  enemySpeed: number;
  reward: number;
};

const TABLE: Record<DifficultyMode, DifficultyModifiers> = {
  casual: {
    id: 'casual',
    label: 'Casual',
    blurb: 'Softer enemies and slightly lower pay.',
    enemyHealth: 0.82,
    enemySpeed: 0.9,
    reward: 0.9,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    blurb: 'The standard last stand.',
    enemyHealth: 1,
    enemySpeed: 1,
    reward: 1,
  },
  veteran: {
    id: 'veteran',
    label: 'Veteran',
    blurb: 'Tougher waves, better coin and gem pressure.',
    enemyHealth: 1.22,
    enemySpeed: 1.08,
    reward: 1.15,
  },
  last_stand: {
    id: 'last_stand',
    label: 'Last Stand',
    blurb: 'Highest health and speed. Highest rewards.',
    enemyHealth: 1.45,
    enemySpeed: 1.16,
    reward: 1.35,
  },
};

export function isDifficultyMode(value: unknown): value is DifficultyMode {
  return value === 'casual' || value === 'normal' || value === 'veteran' || value === 'last_stand';
}

export function getDifficultyModifiers(value: unknown): DifficultyModifiers {
  return isDifficultyMode(value) ? TABLE[value] : TABLE.normal;
}

/** Commander bundle (existing premium product) coin bonus. Ads are not part of this. */
export const PREMIUM_COIN_MULT = 1.15;
