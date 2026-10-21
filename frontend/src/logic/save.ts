import type { TowerType } from '../constants/game';
import { TOWERS } from '../constants/game';
import type { Achievement } from '../constants/progression';
import { normalizeTowerPath, type TowerPath } from './combat';

export const AUDIO_PREFS_REVISION = 1;

/**
 * 2.2/2.3 persisted `soundEnabled: false` as the factory default, so a missing
 * revision means the mute was never a real choice. Later mutes keep revision 1.
 */
export function migrateAudioPrefs(input: {
  soundEnabled?: boolean;
  audioPrefsRevision?: number;
}): { soundEnabled: boolean; audioPrefsRevision: number } {
  if (input.audioPrefsRevision === AUDIO_PREFS_REVISION) {
    return {
      soundEnabled: input.soundEnabled !== false,
      audioPrefsRevision: AUDIO_PREFS_REVISION,
    };
  }
  return { soundEnabled: true, audioPrefsRevision: AUDIO_PREFS_REVISION };
}

/** Veterans who finished the old three-card tutorial are not shown the field briefing. */
export function migrateFieldBriefing(input: {
  tutorialCompleted?: boolean;
  fieldBriefingSeen?: boolean;
}): boolean {
  if (typeof input.fieldBriefingSeen === 'boolean') return input.fieldBriefingSeen;
  return input.tutorialCompleted === true;
}

export function towerTypeKeys(): TowerType[] {
  return Object.keys(TOWERS) as TowerType[];
}

export function mergeNumericRecord(
  stored: Partial<Record<TowerType, number>> | undefined
): Record<TowerType, number> {
  const out = {} as Record<TowerType, number>;
  for (const key of towerTypeKeys()) {
    const n = stored?.[key];
    out[key] = typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  return out;
}

export function unionTowerUnlocks(
  local: readonly string[] | undefined,
  incoming: readonly string[] | undefined
): TowerType[] {
  const set = new Set<TowerType>();
  const add = (list: readonly string[] | undefined) => {
    if (!list) return;
    for (const raw of list) {
      if (typeof raw === 'string' && raw in TOWERS) set.add(raw as TowerType);
    }
  };
  add(local);
  add(incoming);
  set.add('machine_gun');
  return [...set];
}

export function mergeAchievementLists(
  defaults: Achievement[],
  stored: Achievement[] | undefined
): Achievement[] {
  if (!stored?.length) return defaults.map((d) => ({ ...d }));
  const map = new Map(stored.map((a) => [a.id, a]));
  return defaults.map((d) => {
    const prev = map.get(d.id);
    return { ...d, unlocked: prev?.unlocked ?? false };
  });
}

export function readTowerPath(value: unknown): TowerPath {
  return normalizeTowerPath(value);
}
