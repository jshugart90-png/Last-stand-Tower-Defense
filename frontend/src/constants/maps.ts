import { CLASSIC_MAP_ID, getArenaMap } from './arenaMaps';
import type { EnemyType } from './game';

export type MapDifficulty = 'standard' | 'hard' | 'expert' | 'nightmare';

export type MapUnlockRequirement = {
  gemCost: number;
  previousMapId: string;
  previousMapWave: number;
};

export type MapDefinition = {
  id: string;
  name: string;
  difficulty: MapDifficulty;
  description: string;
  pathWaypoints: number[][];
  unlock: MapUnlockRequirement | null;
  spawnDelayMultiplier: number;
  enemyHealthMultiplier: number;
  enemySpeedMultiplier: number;
  enemyTierShift: 0 | 1 | 2;
};

const MAP_ORDER = [
  CLASSIC_MAP_ID,
  'ash_pass',
  'sunken_mire',
  'obsidian_spiral',
  'grave_circuit',
  'raven_choke',
  'crypt_serpent',
  'shadow_fen',
  'void_switchback',
  'iron_widow',
  'dusk_causeway',
] as const;

const GEM_COSTS = [0, 75, 200, 400, 650, 950, 1300, 1700, 2150, 2700, 3400];
const WAVE_GATES = [0, 15, 18, 21, 24, 27, 30, 34, 38, 42, 46];

const difficultyByIndex = (i: number): MapDifficulty => {
  if (i <= 2) return 'standard';
  if (i <= 5) return 'hard';
  if (i <= 8) return 'expert';
  return 'nightmare';
};

const getPathWaypoints = (mapId: string): number[][] => {
  if (mapId === CLASSIC_MAP_ID) {
    return [
      [0, 0],
      [9, 13],
    ];
  }
  const arena = getArenaMap(mapId);
  return (arena?.route ?? []).map((p) => [p.x, p.y]);
};

const defs: MapDefinition[] = MAP_ORDER.map((id, idx) => ({
  id,
  name: id === CLASSIC_MAP_ID ? 'Free Play' : getArenaMap(id)?.name ?? `Map ${idx + 1}`,
  difficulty: difficultyByIndex(idx),
  description:
    id === CLASSIC_MAP_ID
      ? 'Standard defense mode. Spawn and base are locked to opposite map corners.'
      : getArenaMap(id)?.description ?? 'Progressively tougher tactical route.',
  pathWaypoints: getPathWaypoints(id),
  unlock:
    idx === 0
      ? null
      : {
          gemCost: GEM_COSTS[idx],
          previousMapId: MAP_ORDER[idx - 1],
          previousMapWave: WAVE_GATES[idx],
        },
  spawnDelayMultiplier: Math.max(0.55, 1 - idx * 0.045),
  enemyHealthMultiplier: 1 + idx * 0.08,
  enemySpeedMultiplier: 1 + idx * 0.035,
  enemyTierShift: idx >= 9 ? 2 : idx >= 5 ? 1 : 0,
}));

export const GAME_MAPS: MapDefinition[] = defs;
export const DEFAULT_MAP_ID = CLASSIC_MAP_ID;

const byId: Record<string, MapDefinition> = Object.fromEntries(defs.map((m) => [m.id, m]));

export const getMapById = (id: string | null | undefined): MapDefinition | undefined =>
  id ? byId[id] : undefined;

export const getDifficultyColor = (difficulty: MapDifficulty): string => {
  switch (difficulty) {
    case 'standard':
      return '#b43838';
    case 'hard':
      return '#c53a3a';
    case 'expert':
      return '#d74343';
    case 'nightmare':
      return '#f05252';
    default:
      return '#b43838';
  }
};

export const promoteEnemyType = (type: EnemyType, shift: 0 | 1 | 2): EnemyType => {
  if (shift <= 0) return type;
  if (shift === 1) {
    if (type === 'basic') return 'fast';
    if (type === 'fast') return 'shielded';
    if (type === 'tank') return 'splitter';
    return type;
  }
  if (type === 'basic') return 'shielded';
  if (type === 'fast') return 'splitter';
  if (type === 'tank') return 'healer';
  return type;
};
