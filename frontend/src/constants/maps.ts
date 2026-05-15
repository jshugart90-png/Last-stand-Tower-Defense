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
/** Min best wave on the *previous* map to unlock the next map (index aligned with GAME_MAPS). */
/**
 * WG[i] unlocks GAME_MAPS[i] when best wave on GAME_MAPS[i - 1] is ≥ WG[i].
 * One entry per transition (Free Play → … → 10th arena). Penultimate pair uses 50 then 55 then 60 on the last unlock.
 */
/** Wave targets along MAP_ORDER: 20↑…55 then 60 for the last arena unlock (WG[8] uses 50 for the 50+ step). */
const WAVE_GATES: readonly number[] = [0, 20, 25, 30, 35, 40, 45, 50, 50, 55, 60];

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
      ? 'Classic tower defense: enemies march from their entry toward your base.'
      : getArenaMap(id)?.description ?? 'A tougher route with more pressure each wave.',
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

/**
 * Applies wave-based progression to `unlockedMapIds` without removing gem-purchased unlocks.
 * Free Play stays always available (`unlock: null`).
 */
export function mergeWaveProgressUnlocks(
  unlockedMapIds: string[],
  mapBestWaves: Record<string, number>
): string[] {
  const set = new Set(unlockedMapIds);
  for (const m of GAME_MAPS) {
    if (!m.unlock) {
      set.add(m.id);
      continue;
    }
    const prevBest = mapBestWaves[m.unlock.previousMapId] ?? 0;
    if (prevBest >= m.unlock.previousMapWave) {
      set.add(m.id);
    }
  }
  return [...set];
}

export function describeWaveUnlockRequirement(map: MapDefinition): string | null {
  if (!map.unlock) return null;
  const prevName =
    GAME_MAPS.find((g) => g.id === map.unlock?.previousMapId)?.name ?? 'the previous map';
  return `Reach Wave ${map.unlock.previousMapWave}+ on ${prevName} to unlock`;
}

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
