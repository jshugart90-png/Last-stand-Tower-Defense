import { ARENA_MAP_LIST, CLASSIC_MAP_ID, getArenaMap } from '../constants/arenaMaps';
import { TOWERS, type TowerType } from '../constants/game';
import { parseShotRoute } from './shotUrl';
import { useGameStore } from '../stores/gameStore';
import { usePlayerStore } from '../stores/playerStore';

/** Dev builds, or a simulator screenshot bundle with EXPO_PUBLIC_PROOF_BATTLE=1. */
export function shotModeEnabled(): boolean {
  const dev = typeof __DEV__ !== 'undefined' && __DEV__;
  return dev || process.env.EXPO_PUBLIC_PROOF_BATTLE === '1';
}

/** Release screenshot automation. Store builds leave this unset. */
export function screenshotAutomation(): boolean {
  return process.env.EXPO_PUBLIC_PROOF_BATTLE === '1';
}

export { parseShotRoute };

/** Several tower types along the road for a proof capture. */
const PROOF_TOWERS: TowerType[] = ['machine_gun', 'cannon', 'sniper', 'splash', 'missile', 'flak'];

const NEIGHBORS: [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [1, -1],
  [-1, 1],
  [1, 1],
  [-1, -1],
];

export type ShotRequest =
  | { kind: 'freeplay'; size: number }
  | { kind: 'arena'; mapId: string };

function clampShotSize(raw: string | null | undefined): number {
  const size = Number(raw ?? '0');
  if (!Number.isFinite(size)) return 0;
  return Math.max(0, Math.min(3, Math.floor(size)));
}

/** `?proof=` on web, or the same query on a native deep link. */
export function readShotRequest(proofFromRoute?: string | null, sizeFromRoute?: string | null): ShotRequest | null {
  if (!shotModeEnabled()) return null;
  let proof = proofFromRoute ?? null;
  let sizeRaw = sizeFromRoute ?? null;
  if (!proof && typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    proof = params.get('proof');
    sizeRaw = sizeRaw ?? params.get('size');
  }
  if (!proof) return null;
  if (proof === 'classic' || proof === 'freeplay' || proof === CLASSIC_MAP_ID) {
    return { kind: 'freeplay', size: clampShotSize(sizeRaw) };
  }
  const def = getArenaMap(proof);
  if (!def || def.route.length < 2) return null;
  return { kind: 'arena', mapId: proof };
}

/** `?proof=<mapId>` for local captures. Dev builds, or EXPO_PUBLIC_PROOF_BATTLE=1. */
export function readProofMapId(): string | null {
  const shot = readShotRequest();
  return shot?.kind === 'arena' ? shot.mapId : null;
}

let shellPrepared = false;

/** Skip the name dialog and tutorial so a screenshot launch lands on the screen. */
export function prepareScreenshotShell(): void {
  if (!screenshotAutomation() || shellPrepared) return;
  shellPrepared = true;
  const player = usePlayerStore.getState();
  const name = player.nickname?.trim();
  if (!player.hasEnteredNameOnce || !name || name === 'Player') {
    player.setPlayer(player.playerId || 'local_shot', name && name !== 'Player' ? name : 'John');
  }
  if (!player.tutorialCompleted) player.completeTutorial();
  if (!player.fieldBriefingSeen) player.completeFieldBriefing();
  player.clearSavedGame();
  for (const id of [CLASSIC_MAP_ID, ...ARENA_MAP_LIST.map((map) => map.id)]) {
    player.unlockMapByProgress(id);
  }
}

/**
 * Open every arena (including Ash Pass), then start wave 10 on `mapId`
 * with several tower types already built and a boss already on the road.
 */
export function seedProofBattle(mapId: string): void {
  const player = usePlayerStore.getState();
  const allTowers = Object.keys(TOWERS) as TowerType[];
  const name = player.nickname?.trim();
  if (!player.hasEnteredNameOnce || !name || name === 'Player') {
    player.setPlayer(player.playerId || 'local_proof', name && name !== 'Player' ? name : 'John');
  }
  if (!player.tutorialCompleted) player.completeTutorial();
  if (!player.fieldBriefingSeen) player.completeFieldBriefing();
  player.clearSavedGame();
  for (const id of [CLASSIC_MAP_ID, ...ARENA_MAP_LIST.map((map) => map.id)]) {
    player.unlockMapByProgress(id);
  }
  player.setCurrentMapId(mapId);
  usePlayerStore.setState({ unlockedTowers: allTowers });

  const live = usePlayerStore.getState();
  useGameStore.getState().startGame(
    allTowers,
    [1, 2],
    live.towerUpgradeLevels,
    live.equippedSkins,
    live.selectedArenaSize,
    mapId
  );
  useGameStore.setState({ coins: 8000, currentWave: 9, baseHealth: 80 });

  const route = getArenaMap(mapId)?.route ?? [];
  const step = Math.max(1, Math.floor(route.length / 8));
  let placed = 0;
  for (let i = 2; i < route.length - 2 && placed < 8; i += step) {
    const cell = route[i];
    for (const [dx, dy] of NEIGHBORS) {
      useGameStore.getState().selectTower(PROOF_TOWERS[placed % PROOF_TOWERS.length]);
      const ok = useGameStore.getState().placeTower({ x: cell.x + dx, y: cell.y + dy });
      if (ok) {
        placed += 1;
        break;
      }
    }
  }
  useGameStore.getState().selectTower(null);
  useGameStore.getState().startWave();
  const spawn = useGameStore.getState().spawnEnemy;
  spawn('boss', 1.1, 0.45);
  spawn('tank', 1, 0.75);
  spawn('armored', 1, 0.85);
  spawn('basic', 1, 1);
  spawn('fast', 1, 1.05);
}

/** Free Play at a chosen size. Local demo state only — no store purchase. */
export function seedProofFreePlay(size: number): void {
  prepareScreenshotShell();
  const n = Math.max(0, Math.min(3, Math.floor(size)));
  const player = usePlayerStore.getState();
  const name = player.nickname?.trim();
  if (!player.hasEnteredNameOnce || !name || name === 'Player') {
    player.setPlayer(player.playerId || 'local_shot', name && name !== 'Player' ? name : 'John');
  }
  if (!player.tutorialCompleted) player.completeTutorial();
  if (!player.fieldBriefingSeen) player.completeFieldBriefing();
  player.clearSavedGame();
  usePlayerStore.setState({
    arenaExpansions: Math.max(player.arenaExpansions, n),
    selectedArenaSize: n,
    currentMapId: CLASSIC_MAP_ID,
    unlockedTowers: Object.keys(TOWERS) as TowerType[],
  });
  const live = usePlayerStore.getState();
  const allTowers = live.unlockedTowers;
  useGameStore.getState().startGame(
    allTowers,
    [1, 2],
    live.towerUpgradeLevels,
    live.equippedSkins,
    n,
    CLASSIC_MAP_ID
  );
  useGameStore.setState({ coins: 8000, currentWave: 4, baseHealth: 20 });
  const cols = useGameStore.getState().gridCols;
  const rows = useGameStore.getState().gridRows;
  let placed = 0;
  for (let y = 0; y < rows && placed < 5; y += 1) {
    for (let x = 0; x < cols && placed < 5; x += 1) {
      if ((x + y) % 3 !== 1) continue;
      useGameStore.getState().selectTower(PROOF_TOWERS[placed % PROOF_TOWERS.length]);
      if (useGameStore.getState().placeTower({ x, y })) placed += 1;
    }
  }
  useGameStore.getState().selectTower(null);
  useGameStore.getState().startWave();
  const spawn = useGameStore.getState().spawnEnemy;
  spawn('basic', 1, 0.55);
  spawn('fast', 1, 0.8);
  spawn('tank', 1, 1);
}
