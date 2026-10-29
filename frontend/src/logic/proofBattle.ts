import { ARENA_MAP_LIST, CLASSIC_MAP_ID, getArenaMap } from '../constants/arenaMaps';
import { TOWERS, type TowerType } from '../constants/game';
import { useGameStore } from '../stores/gameStore';
import { usePlayerStore } from '../stores/playerStore';

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

/** `?proof=<mapId>` for local captures. Dev builds, or EXPO_PUBLIC_PROOF_BATTLE=1. */
export function readProofMapId(): string | null {
  const dev = typeof __DEV__ !== 'undefined' && __DEV__;
  const flagged = process.env.EXPO_PUBLIC_PROOF_BATTLE === '1';
  if (!dev && !flagged) return null;
  if (typeof window === 'undefined') return null;
  const id = new URLSearchParams(window.location.search).get('proof');
  if (!id) return null;
  const def = getArenaMap(id);
  if (!def || def.route.length < 2) return null;
  return id;
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
    [1, 2, 3, 5],
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
