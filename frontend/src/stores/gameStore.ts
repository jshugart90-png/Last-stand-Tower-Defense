import { create } from 'zustand';
import {
  TOWERS,
  ENEMIES,
  GAME_CONFIG,
  TowerType,
  EnemyType,
  SKIN_COLORS,
  SPAWN_POINT,
  BASE_POSITION,
  getInfiniteUpgradeCost,
  TargetingMode,
  GameSpeed,
  clampGameSpeed,
  normalizeUnlockedSpeeds,
  getWaveCompletionBonus,
  getWavePlannedEnemyCount,
  STARTING_COINS_BONUS_PER_LEVEL,
  getRunCoinIncomeMultiplier,
  targetWavePerformanceGems,
  FORTIFY_HP_PER_LEVEL,
} from '../constants/game';
import { isServerBackedPlayerId } from '../hooks/useApi';
import { findPath, wouldBlockPath } from '../utils/pathfinding';
import {
  getArenaMap,
  sliceRouteFromPosition,
  isCellOnArenaRoute,
  manhattanPath,
  CLASSIC_MAP_ID,
  type ArenaMapTheme,
} from '../constants/arenaMaps';
import {
  playWeaponFireSound,
  playProjectileImpact,
  playEnemyDeathBurst,
  playBaseDamageSound,
  playWaveStartFanfare,
  playBuildSound,
  playUpgradeSound,
  playWinSound,
  playLoseSound,
  stopAllSounds,
  setGameplaySfxArmed,
} from '../services/audioService';
import { usePlayerStore } from './playerStore';
import { getDifficultyModifiers, PREMIUM_COIN_MULT } from '../logic/difficulty';
import {
  canTargetEnemy,
  computeHitDamage,
  nearestOtherIds,
  needsPathChoice,
  normalizeTowerPath,
  resolveTowerStats,
  type TowerPath,
} from '../logic/combat';
import { mergeNumericRecord } from '../logic/save';

/** Cleared on new runs / game end so dismiss callbacks never stack or fire after teardown. */
let bonusPopupDismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearBonusPopupDismissTimer() {
  if (bonusPopupDismissTimer !== null) {
    clearTimeout(bonusPopupDismissTimer);
    bonusPopupDismissTimer = null;
  }
}

function scaleRunCoinsFromKill(baseReward: number): number {
  const player = usePlayerStore.getState();
  const lv = player.coinIncomeUpgradeLevel ?? 0;
  const premium = player.premium ? PREMIUM_COIN_MULT : 1;
  const reward = getDifficultyModifiers(player.difficultyMode).reward;
  return Math.max(1, Math.floor(baseReward * getRunCoinIncomeMultiplier(lv) * premium * reward));
}

function startingBaseHealth(): number {
  const lv = usePlayerStore.getState().fortifyUpgradeLevel ?? 0;
  return GAME_CONFIG.BASE_HEALTH + Math.max(0, lv) * FORTIFY_HP_PER_LEVEL;
}

export interface FloatText {
  id: string;
  x: number;
  y: number;
  text: string;
  born: number;
}

export interface Burst {
  id: string;
  x: number;
  y: number;
  born: number;
  color: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface PlacedTower {
  id: string;
  type: TowerType;
  position: Position;
  level: number;
  lastFireTime: number;
  skin: string;
  targetingMode: TargetingMode;
  totalCostSpent: number;
  path: TowerPath;
  // Laser tower specific
  currentTargetId: string | null;
  damageAccumulator: number; // For laser ramping damage
}

export interface Enemy {
  id: string;
  type: EnemyType;
  position: Position;
  health: number;
  maxHealth: number;
  speed: number;
  pathIndex: number;
  slowedUntil: number;
  coinReward: number;
  spawnTime: number;
  path: Position[];
  damageReduction?: number;
  healPerSecond?: number;
  auraRange?: number;
  splitOnDeath?: boolean;
  splitCount?: number;
  splitInto?: EnemyType;
  flying?: boolean;
  armor?: number;
  hitFlashUntil?: number;
}

export interface Projectile {
  id: string;
  position: Position;
  targetId: string;
  damage: number;
  speed: number;
  towerId: string;
  towerType: TowerType;
  isSplash?: boolean;
  splashRadius?: number;
  isFreeze?: boolean;
  slowAmount?: number;
  slowDuration?: number;
  pierce?: number;
  airMultiplier?: number;
  groundMultiplier?: number;
  chain?: number;
}

export interface LaserBeam {
  towerId: string;
  targetId: string;
  damage: number;
  pierce: number;
  airMultiplier: number;
  groundMultiplier: number;
  chain: number;
}

export interface GameState {
  // Game status
  isPlaying: boolean;
  isPaused: boolean;
  isGameOver: boolean;
  /** True once the player has used their one rewarded-ad revive this run. */
  revivedThisRun: boolean;
  currentWave: number;
  waveInProgress: boolean;
  /** Planned wave spawns from `getWavePlannedEnemyCount` when the wave starts. */
  waveSpawnSlotsTotal: number;
  /** How many scheduled wave spawns have entered the map (via `spawnEnemy`). */
  waveSpawnSlotsReleased: number;

  // Player stats
  coins: number;
  baseHealth: number;
  score: number;
  enemiesKilled: number;
  towersPlaced: number;
  
  // Game entities
  towers: PlacedTower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  laserBeams: LaserBeam[];
  
  // Map configuration
  gridCols: number;
  gridRows: number;
  cellSize: number;
  spawnPoint: Position;
  basePosition: Position;
  
  // Player progression (from playerStore)
  unlockedTowers: TowerType[];
  unlockedSpeeds: GameSpeed[];
  towerUpgradeLevels: Record<TowerType, number>;
  equippedSkins: Record<string, string>;
  arenaExpansions: number;
  
  // Tower purchase tracking
  towerPurchaseCount: Record<TowerType, number>;
  
  // Power-ups
  doubleDamageUntil: number;
  
  // Game timing
  gameStartTime: number;
  gameSpeed: GameSpeed;
  waveEndTime: number;
  autoWaveTimer: number;
  
  // UI State
  selectedTowerType: TowerType | null;
  selectedPlacedTower: PlacedTower | null;
  
  // Wave completion bonus display
  lastWaveBonus: number;
  showBonusPopup: boolean;
  
  // Zoom
  zoomLevel: number;

  /** Cumulative scaled wave-linear gem slice granted this run (see targetWavePerformanceGems). */
  runGemsFromWavePart: number;

  /** Selected arena (persisted in player store). */
  currentMapId: string;
  /** Pre-baked enemy corridor; empty = classic dynamic A* path. */
  arenaRoute: { x: number; y: number }[];
  mapTheme: ArenaMapTheme | null;

  floatTexts: FloatText[];
  bursts: Burst[];
  runFlyingKills: number;
  runArmoredKills: number;
  runBossKills: number;
}

interface GameActions {
  // Game flow
  startGame: (
    unlockedTowers: TowerType[],
    unlockedSpeeds: GameSpeed[],
    towerUpgradeLevels: Record<TowerType, number>,
    equippedSkins: Record<string, string>, 
    arenaExpansions: number,
    mapId: string
  ) => void;
  pauseGame: () => void;
  resumeGame: () => void;
  endGame: () => void;
  /** Rewarded-ad revive: restore half base health, clear the field, resume prep. One per run. */
  reviveGame: () => void;
  restartGame: () => void;
  
  // Speed control
  setGameSpeed: (speed: GameSpeed) => void;
  
  // Wave management
  startWave: () => void;
  endWave: () => void;
  dismissBonusPopup: () => void;
  
  // Tower actions
  selectTower: (type: TowerType | null) => void;
  selectPlacedTower: (tower: PlacedTower | null) => void;
  placeTower: (position: Position) => boolean;
  upgradeTower: (towerId: string, path?: TowerPath) => boolean;
  sellTower: (towerId: string) => void;
  setTowerTargeting: (towerId: string, mode: TargetingMode) => void;
  
  // Enemy actions
  spawnEnemy: (type: EnemyType, healthMultiplier: number, speedMultiplier: number) => void;
  
  // Main game tick
  gameTick: (deltaTime: number) => void;
  
  // Damage base
  damageBase: (damage: number) => void;
  
  // Coins
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  
  // Power-ups
  activateDoubleDamage: (duration: number) => void;
  
  // Utility
  canPlaceTower: (position: Position) => boolean;
  getTowerAt: (position: Position) => PlacedTower | undefined;
  getEnemiesInRange: (position: Position, range: number) => Enemy[];
  getTowerCost: (type: TowerType) => number;
  getUpgradeCost: (tower: PlacedTower) => number;
  getSellValue: (tower: PlacedTower) => number;
  getTowerColor: (tower: PlacedTower) => string;
  recalculatePath: () => Position[] | null;
  
  // Zoom
  setZoomLevel: (level: number) => void;
  
  // Get current coins (for saving)
  getCurrentCoins: () => number;
  
  // Save/Resume game
  getGameStateForSave: () => SavedGameStateForExport;
  resumeFromSavedGame: (savedGame: SavedGameStateForExport, playerData: ResumePlayerData) => void;
}

// Type for saved game export
export interface SavedGameStateForExport {
  currentWave: number;
  waveInProgress: boolean;
  coins: number;
  baseHealth: number;
  score: number;
  enemiesKilled: number;
  towersPlaced: number;
  towers: {
    id: string;
    type: TowerType;
    position: Position;
    level: number;
    skin: string;
    targetingMode: TargetingMode;
    totalCostSpent: number;
    /** Upgrade branch chosen at level 2. Missing on saves from before paths existed. */
    path?: TowerPath;
  }[];
  towerPurchaseCount: Record<TowerType, number>;
  gridCols: number;
  gridRows: number;
  arenaExpansions: number;
  savedAt: number;
  /** Arena id (see arenaMaps) — saved for resume. */
  mapId?: string;
}

// Player data needed for resume
export interface ResumePlayerData {
  unlockedTowers: TowerType[];
  unlockedSpeeds: GameSpeed[];
  towerUpgradeLevels: Record<TowerType, number>;
  equippedSkins: Record<string, string>;
}

let idSeq = 0;
const generateId = () => {
  idSeq = (idSeq + 1) % 1_000_000_000;
  return `${Date.now().toString(36)}${idSeq.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
};

const MAX_WEAPON_SFX_PER_TICK = 10;

const scratchEnemiesInRange: Enemy[] = [];

const getBlockedCells = (towers: PlacedTower[]): Set<string> => {
  const blocked = new Set<string>();
  for (const tower of towers) {
    blocked.add(`${tower.position.x},${tower.position.y}`);
  }
  return blocked;
};

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  // Initial state
  isPlaying: false,
  isPaused: false,
  isGameOver: false,
  revivedThisRun: false,
  currentWave: 0,
  waveInProgress: false,
  waveSpawnSlotsTotal: 0,
  waveSpawnSlotsReleased: 0,
  coins: GAME_CONFIG.STARTING_COINS,
  baseHealth: GAME_CONFIG.BASE_HEALTH,
  score: 0,
  enemiesKilled: 0,
  towersPlaced: 0,
  towers: [],
  enemies: [],
  projectiles: [],
  laserBeams: [],
  gridCols: GAME_CONFIG.GRID_COLS,
  gridRows: GAME_CONFIG.GRID_ROWS,
  cellSize: GAME_CONFIG.CELL_SIZE,
  spawnPoint: { ...SPAWN_POINT },
  basePosition: { ...BASE_POSITION },
  unlockedTowers: ['machine_gun'],
  unlockedSpeeds: [1],
  towerUpgradeLevels: mergeNumericRecord(undefined),
  equippedSkins: {},
  arenaExpansions: 0,
  towerPurchaseCount: mergeNumericRecord(undefined),
  floatTexts: [],
  bursts: [],
  runFlyingKills: 0,
  runArmoredKills: 0,
  runBossKills: 0,
  doubleDamageUntil: 0,
  gameStartTime: 0,
  gameSpeed: 1,
  waveEndTime: 0,
  autoWaveTimer: 0,
  selectedTowerType: null,
  selectedPlacedTower: null,
  lastWaveBonus: 0,
  showBonusPopup: false,
  zoomLevel: 1,
  runGemsFromWavePart: 0,
  currentMapId: CLASSIC_MAP_ID,
  arenaRoute: [],
  mapTheme: null,

  // Game flow
  startGame: (unlockedTowers, unlockedSpeeds, towerUpgradeLevels, equippedSkins, arenaExpansions, mapId) => {
    const def = getArenaMap(mapId);
    const useArena = def && def.route.length >= 2;
    const baseConfig = GAME_CONFIG;
    const coinBonus =
      usePlayerStore.getState().startingCoinUpgradeLevel * STARTING_COINS_BONUS_PER_LEVEL;

    if (useArena && def) {
      clearBonusPopupDismissTimer();
      const arenaRoute = def.route.map((p) => ({ x: p.x, y: p.y }));
      set({
        isPlaying: true,
        isPaused: false,
        isGameOver: false,
        revivedThisRun: false,
        currentWave: 0,
        waveInProgress: false,
        waveSpawnSlotsTotal: 0,
        waveSpawnSlotsReleased: 0,
        coins: GAME_CONFIG.STARTING_COINS + coinBonus,
        baseHealth: startingBaseHealth(),
        score: 0,
        enemiesKilled: 0,
        towersPlaced: 0,
        towers: [],
        enemies: [],
        projectiles: [],
        laserBeams: [],
        floatTexts: [],
        bursts: [],
        runFlyingKills: 0,
        runArmoredKills: 0,
        runBossKills: 0,
        gridCols: def.gridCols,
        gridRows: def.gridRows,
        cellSize: def.cellSize,
        spawnPoint: { ...def.spawnPoint },
        basePosition: { ...def.basePosition },
        unlockedTowers,
        unlockedSpeeds: normalizeUnlockedSpeeds(unlockedSpeeds),
        towerUpgradeLevels,
        equippedSkins,
        arenaExpansions,
        towerPurchaseCount: mergeNumericRecord(undefined),
        doubleDamageUntil: 0,
        gameStartTime: Date.now(),
        gameSpeed: 1,
        waveEndTime: 0,
        autoWaveTimer: 0,
        selectedTowerType: null,
        selectedPlacedTower: null,
        zoomLevel: 1,
        runGemsFromWavePart: 0,
        currentMapId: def.id,
        arenaRoute,
        mapTheme: def.theme,
      });
      setGameplaySfxArmed(true);
      return;
    }

    const gridCols = baseConfig.GRID_COLS + (arenaExpansions * 2);
    const gridRows = baseConfig.GRID_ROWS + (arenaExpansions * 2);
    const cellSize = arenaExpansions > 3 ? 28 : arenaExpansions > 1 ? 30 : baseConfig.CELL_SIZE;

    const spawnPoint = { x: 0, y: 0 };
    const basePosition = {
      x: gridCols - 1,
      y: gridRows - 1,
    };

    clearBonusPopupDismissTimer();
    set({
      isPlaying: true,
      isPaused: false,
      isGameOver: false,
      revivedThisRun: false,
      currentWave: 0,
      waveInProgress: false,
      waveSpawnSlotsTotal: 0,
      waveSpawnSlotsReleased: 0,
      coins: GAME_CONFIG.STARTING_COINS + coinBonus,
      baseHealth: startingBaseHealth(),
      score: 0,
      enemiesKilled: 0,
      towersPlaced: 0,
      towers: [],
      enemies: [],
      projectiles: [],
      laserBeams: [],
      floatTexts: [],
      bursts: [],
      runFlyingKills: 0,
      runArmoredKills: 0,
      runBossKills: 0,
      gridCols,
      gridRows,
      cellSize,
      spawnPoint,
      basePosition,
      unlockedTowers,
      unlockedSpeeds: normalizeUnlockedSpeeds(unlockedSpeeds),
      towerUpgradeLevels,
      equippedSkins,
      arenaExpansions,
      towerPurchaseCount: mergeNumericRecord(undefined),
      doubleDamageUntil: 0,
      gameStartTime: Date.now(),
      gameSpeed: 1,
      waveEndTime: 0,
      autoWaveTimer: 0,
      selectedTowerType: null,
      selectedPlacedTower: null,
      zoomLevel: 1,
      runGemsFromWavePart: 0,
      currentMapId: CLASSIC_MAP_ID,
      arenaRoute: [],
      mapTheme: null,
    });
    setGameplaySfxArmed(true);
  },

  pauseGame: () => {
    void stopAllSounds();
    set({ isPaused: true });
  },
  resumeGame: () => {
    setGameplaySfxArmed(true);
    set({ isPaused: false });
  },
  endGame: () => {
    clearBonusPopupDismissTimer();
    void stopAllSounds();
    playLoseSound();
    set({ isPlaying: false, isGameOver: true });
  },

  reviveGame: () => {
    clearBonusPopupDismissTimer();
    setGameplaySfxArmed(true);
    set({
      isPlaying: true,
      isPaused: false,
      isGameOver: false,
      revivedThisRun: true,
      baseHealth: Math.max(1, Math.floor(startingBaseHealth() / 2)),
      waveInProgress: false,
      waveSpawnSlotsTotal: 0,
      waveSpawnSlotsReleased: 0,
      autoWaveTimer: 0,
      enemies: [],
      projectiles: [],
      laserBeams: [],
      floatTexts: [],
      bursts: [],
      selectedPlacedTower: null,
    });
  },
  
  restartGame: () => {
    void stopAllSounds();
    const {
      unlockedTowers,
      unlockedSpeeds,
      towerUpgradeLevels,
      equippedSkins,
      arenaExpansions,
      currentMapId,
    } = get();
    get().startGame(
      unlockedTowers,
      unlockedSpeeds,
      towerUpgradeLevels,
      equippedSkins,
      arenaExpansions,
      currentMapId
    );
  },

  setGameSpeed: (speed) => {
    const state = get();
    const target = clampGameSpeed(Number(speed));
    if (!state.unlockedSpeeds.includes(target)) return;
    if (state.gameSpeed === target) return;
    set({ gameSpeed: target });
  },

  // Wave management
  startWave: () => {
    clearBonusPopupDismissTimer();
    setGameplaySfxArmed(true);
    void playWaveStartFanfare();
    set((state) => {
      const nextWave = state.currentWave + 1;
      return {
        currentWave: nextWave,
        waveInProgress: true,
        autoWaveTimer: 0,
        showBonusPopup: false,
        waveSpawnSlotsTotal: getWavePlannedEnemyCount(nextWave),
        waveSpawnSlotsReleased: 0,
      };
    });
  },

  endWave: () => {
    const state = get();
    const incomeLv = usePlayerStore.getState().coinIncomeUpgradeLevel ?? 0;
    const rawBonus = getWaveCompletionBonus(state.currentWave);
    const premium = usePlayerStore.getState().premium ? PREMIUM_COIN_MULT : 1;
    const reward = getDifficultyModifiers(usePlayerStore.getState().difficultyMode).reward;
    const bonus = Math.max(
      0,
      Math.floor(rawBonus * getRunCoinIncomeMultiplier(incomeLv) * premium * reward)
    );
    const w = state.currentWave;
    const newWaveGemTotal = targetWavePerformanceGems(w);
    const waveGemDelta = Math.max(0, newWaveGemTotal - state.runGemsFromWavePart);
    if (waveGemDelta > 0) {
      const pid = usePlayerStore.getState().playerId;
      if (!isServerBackedPlayerId(pid)) {
        usePlayerStore.getState().addGems(waveGemDelta);
      }
    }

    set({
      waveInProgress: false,
      waveSpawnSlotsTotal: 0,
      waveSpawnSlotsReleased: 0,
      waveEndTime: Date.now(),
      autoWaveTimer: GAME_CONFIG.WAVE_DELAY,
      coins: state.coins + bonus,
      score: state.score + bonus,
      lastWaveBonus: bonus,
      showBonusPopup: true,
      runGemsFromWavePart: newWaveGemTotal,
    });
    
    clearBonusPopupDismissTimer();
    bonusPopupDismissTimer = setTimeout(() => {
      bonusPopupDismissTimer = null;
      try {
        useGameStore.setState({ showBonusPopup: false });
      } catch {
        /* ignore dismiss failure */
      }
    }, 2000);

    playWinSound();
  },

  dismissBonusPopup: () => {
    clearBonusPopupDismissTimer();
    set({ showBonusPopup: false });
  },

  // Tower actions
  selectTower: (type) => set({ selectedTowerType: type, selectedPlacedTower: null }),
  selectPlacedTower: (tower) => set({ selectedPlacedTower: tower, selectedTowerType: null }),

  placeTower: (position) => {
    const state = get();
    if (!state.selectedTowerType) return false;
    if (!state.unlockedTowers.includes(state.selectedTowerType)) return false;
    
    const cost = state.getTowerCost(state.selectedTowerType);
    if (state.coins < cost) return false;
    if (!state.canPlaceTower(position)) return false;

    const skin = state.equippedSkins[state.selectedTowerType] || 'default';
    
    const newTower: PlacedTower = {
      id: generateId(),
      type: state.selectedTowerType,
      position,
      level: 0,
      lastFireTime: 0,
      skin,
      targetingMode: 'first',
      totalCostSpent: cost,
      path: 'none',
      currentTargetId: null,
      damageAccumulator: 0,
    };

    const newPurchaseCount = {
      ...mergeNumericRecord(state.towerPurchaseCount),
      [state.selectedTowerType]: (state.towerPurchaseCount[state.selectedTowerType] || 0) + 1,
    };

    // Get all towers including the new one for path recalculation
    const allTowers = [...state.towers, newTower];
    const blockedCells = getBlockedCells(allTowers);

    // Recalculate paths for ALL existing enemies
    const updatedEnemies = state.enemies.map((enemy) => {
      if (enemy.flying) return enemy;
      const currentGridX = Math.round(enemy.position.x);
      const currentGridY = Math.round(enemy.position.y);
      let newPath: { x: number; y: number }[] | null = null;

      if (state.arenaRoute.length >= 2) {
        newPath = sliceRouteFromPosition(
          { x: enemy.position.x, y: enemy.position.y },
          state.arenaRoute
        );
      } else {
        newPath = findPath(
          { x: currentGridX, y: currentGridY },
          state.basePosition,
          state.gridCols,
          state.gridRows,
          blockedCells
        );
      }

      if (newPath && newPath.length > 1) {
        return {
          ...enemy,
          path: newPath,
          pathIndex: 0,
          position: { x: enemy.position.x, y: enemy.position.y },
        };
      }

      return enemy;
    });

    set((s) => ({
      towers: allTowers,
      enemies: updatedEnemies,
      coins: s.coins - cost,
      towersPlaced: s.towersPlaced + 1,
      towerPurchaseCount: newPurchaseCount,
      selectedTowerType: null,
    }));

    playBuildSound();
    return true;
  },

  upgradeTower: (towerId, chosenPath) => {
    const state = get();
    const tower = state.towers.find(t => t.id === towerId);
    if (!tower) return false;

    const currentPath = normalizeTowerPath(tower.path);
    if (needsPathChoice(tower.level, currentPath)) {
      if (chosenPath !== 'alpha' && chosenPath !== 'beta') return false;
    }

    const cost = state.getUpgradeCost(tower);
    if (state.coins < cost) return false;
    const nextPath =
      chosenPath === 'alpha' || chosenPath === 'beta' ? chosenPath : currentPath;

    set(s => ({
      towers: s.towers.map(t =>
        t.id === towerId 
          ? { ...t, level: t.level + 1, path: nextPath, totalCostSpent: t.totalCostSpent + cost } 
          : t
      ),
      coins: s.coins - cost,
      selectedPlacedTower: s.selectedPlacedTower?.id === towerId 
        ? {
            ...s.selectedPlacedTower,
            level: s.selectedPlacedTower.level + 1,
            path: nextPath,
            totalCostSpent: s.selectedPlacedTower.totalCostSpent + cost,
          }
        : s.selectedPlacedTower,
    }));

    playUpgradeSound();
    return true;
  },

  sellTower: (towerId) => {
    const state = get();
    const tower = state.towers.find(t => t.id === towerId);
    if (!tower) return;

    const sellValue = state.getSellValue(tower);

    set(s => ({
      towers: s.towers.filter(t => t.id !== towerId),
      coins: s.coins + sellValue,
      selectedPlacedTower: null,
    }));
  },

  setTowerTargeting: (towerId, mode) => {
    set(s => ({
      towers: s.towers.map(t =>
        t.id === towerId ? { ...t, targetingMode: mode } : t
      ),
      selectedPlacedTower: s.selectedPlacedTower?.id === towerId 
        ? { ...s.selectedPlacedTower, targetingMode: mode }
        : s.selectedPlacedTower,
    }));
  },

  // Enemy actions
  spawnEnemy: (type, healthMultiplier, speedMultiplier) => {
    const state = get();
    const enemyDef = ENEMIES[type];
    
    const flying = Boolean((enemyDef as { flying?: boolean }).flying);
    let path: { x: number; y: number }[];
    if (flying && state.arenaRoute.length < 2) {
      path = manhattanPath(state.spawnPoint, state.basePosition, true);
    } else if (state.arenaRoute.length >= 2) {
      path = state.arenaRoute.map((p) => ({ x: p.x, y: p.y }));
    } else {
      const blockedCells = getBlockedCells(state.towers);
      const computed =
        findPath(
          state.spawnPoint,
          state.basePosition,
          state.gridCols,
          state.gridRows,
          blockedCells
        ) ?? null;
      if (!computed || computed.length < 2) {
        return;
      }
      path = computed;
    }
    
    const enemy: Enemy = {
      id: generateId(),
      type,
      position: { x: path[0].x, y: path[0].y },
      health: Math.floor(enemyDef.baseHealth * healthMultiplier),
      maxHealth: Math.floor(enemyDef.baseHealth * healthMultiplier),
      speed: enemyDef.baseSpeed * speedMultiplier,
      pathIndex: 0,
      slowedUntil: 0,
      coinReward: enemyDef.coinReward,
      spawnTime: Date.now(),
      path,
      damageReduction: (enemyDef as { damageReduction?: number }).damageReduction,
      healPerSecond: (enemyDef as { healPerSecond?: number }).healPerSecond,
      auraRange: (enemyDef as { auraRange?: number }).auraRange,
      splitOnDeath: (enemyDef as { splitOnDeath?: boolean }).splitOnDeath,
      splitCount: (enemyDef as { splitCount?: number }).splitCount,
      splitInto: (enemyDef as { splitInto?: EnemyType }).splitInto,
      flying,
      armor: (enemyDef as { armor?: number }).armor ?? 0,
    };

    set((s) => ({
      enemies: [...s.enemies, enemy],
      waveSpawnSlotsReleased:
        s.waveInProgress && s.waveSpawnSlotsTotal > 0
          ? Math.min(s.waveSpawnSlotsTotal, s.waveSpawnSlotsReleased + 1)
          : s.waveSpawnSlotsReleased,
    }));
  },

  // Main game tick - NO COMBO SYSTEM
  gameTick: (deltaTime) => {
    const state = get();
    if (!state.isPlaying || state.isPaused) return;

    try {
    const now = Date.now();
    const adjustedDelta = deltaTime * state.gameSpeed;

    // Update auto wave timer (only after wave 1). Always persist decremented value — a prior
    // `>= 100` throttle compared delta to the *unchanged* store value, so at 1x–2x speed the
    // timer never moved (frozen countdown / no auto-start).
    if (!state.waveInProgress && state.autoWaveTimer > 0 && state.currentWave > 0) {
      const newTimer = state.autoWaveTimer - adjustedDelta;
      if (newTimer <= 0) {
        try {
          get().startWave();
        } catch {
          /* keep timer state consistent */
        }
        return;
      }
      set({ autoWaveTimer: newTimer });
    }

    // ====== MOVE ENEMIES ======
    const enemiesToRemove: string[] = [];
    let baseDamage = 0;

    const updatedEnemies = state.enemies.map(enemy => {
      const isSlowed = now < enemy.slowedUntil;
      const speedMultiplier = isSlowed ? 0.5 : 1;
      const speed = enemy.speed * speedMultiplier;
      
      const targetPathPoint = enemy.path[enemy.pathIndex + 1];
      if (!targetPathPoint) {
        enemiesToRemove.push(enemy.id);
        baseDamage += 1;
        return enemy;
      }

      const targetX = targetPathPoint.x;
      const targetY = targetPathPoint.y;
      const dx = targetX - enemy.position.x;
      const dy = targetY - enemy.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const moveAmount = speed * adjustedDelta * 0.001;

      if (dist < moveAmount) {
        if (enemy.pathIndex + 2 >= enemy.path.length) {
          enemiesToRemove.push(enemy.id);
          baseDamage += 1;
          return enemy;
        }
        return {
          ...enemy,
          position: { x: targetX, y: targetY },
          pathIndex: enemy.pathIndex + 1,
        };
      }

      return {
        ...enemy,
        position: {
          x: enemy.position.x + (dx / dist) * moveAmount,
          y: enemy.position.y + (dy / dist) * moveAmount,
        },
      };
    });

    const exploding = new Set(enemiesToRemove);

    // Healer aura pass (applies before tower damage this tick)
    const healedByAura = new Map<string, number>();
    for (const healer of updatedEnemies) {
      if (!healer.healPerSecond || !healer.auraRange) continue;
      const healAmount = healer.healPerSecond * adjustedDelta * 0.001;
      const rangeSq = healer.auraRange * healer.auraRange;
      for (const ally of updatedEnemies) {
        if (ally.id === healer.id || exploding.has(ally.id)) continue;
        const dx = ally.position.x - healer.position.x;
        const dy = ally.position.y - healer.position.y;
        if (dx * dx + dy * dy <= rangeSq) {
          healedByAura.set(ally.id, (healedByAura.get(ally.id) || 0) + healAmount);
        }
      }
    }
    const enemiesForTowers = updatedEnemies.filter((e) => !exploding.has(e.id));

    // ====== TOWER FIRING ======
    const newProjectiles: Projectile[] = [];
    const newLaserBeams: LaserBeam[] = [];
    let sfxPlayed = 0;

    const shopUpgradeLevels = state.towerUpgradeLevels;

    const updatedTowers = state.towers.map((tower) => {
      const towerDef = TOWERS[tower.type];

      const shopBonus = shopUpgradeLevels[tower.type] || 0;
      const calibration = usePlayerStore.getState().calibrationUpgradeLevel ?? 0;
      const stats = resolveTowerStats(
        tower.type,
        towerDef.baseStats,
        tower.level,
        shopBonus,
        normalizeTowerPath(tower.path),
        calibration
      );

      if (now - tower.lastFireTime < stats.fireRate / state.gameSpeed) {
        return tower;
      }

      const rangeSq = stats.range * stats.range;
      const tx = tower.position.x;
      const ty = tower.position.y;
      scratchEnemiesInRange.length = 0;
      for (const enemy of enemiesForTowers) {
        if (!canTargetEnemy(!!enemy.flying, stats.airMultiplier, stats.groundMultiplier)) continue;
        const dx = enemy.position.x - tx;
        const dy = enemy.position.y - ty;
        if (dx * dx + dy * dy <= rangeSq) {
          scratchEnemiesInRange.push(enemy);
        }
      }

      if (scratchEnemiesInRange.length === 0) {
        if (tower.type === 'laser') {
          return { ...tower, currentTargetId: null, damageAccumulator: 0 };
        }
        return tower;
      }

      let target: Enemy;
      switch (tower.targetingMode) {
        case 'first':
          target = scratchEnemiesInRange.reduce((a, b) =>
            a.pathIndex / a.path.length > b.pathIndex / b.path.length ? a : b
          );
          break;
        case 'last':
          target = scratchEnemiesInRange.reduce((a, b) => (a.spawnTime > b.spawnTime ? a : b));
          break;
        case 'strongest':
          target = scratchEnemiesInRange.reduce((a, b) => (a.health > b.health ? a : b));
          break;
        case 'closest': {
          let best = scratchEnemiesInRange[0];
          let bestSq =
            (best.position.x - tx) ** 2 + (best.position.y - ty) ** 2;
          for (let i = 1; i < scratchEnemiesInRange.length; i++) {
            const e = scratchEnemiesInRange[i];
            const dsq = (e.position.x - tx) ** 2 + (e.position.y - ty) ** 2;
            if (dsq < bestSq) {
              best = e;
              bestSq = dsq;
            }
          }
          target = best;
          break;
        }
        default:
          target = scratchEnemiesInRange[0];
      }
      
      // Handle laser tower specially
      if (tower.type === 'laser') {
        let newDamageAccumulator = tower.damageAccumulator;

        if (tower.currentTargetId === target.id) {
          newDamageAccumulator += stats.damageRampUp || 0.5;
        } else {
          newDamageAccumulator = 0;
        }

        const maxMultiplier = stats.maxDamageMultiplier || 10;
        const damageMultiplier = Math.min(1 + newDamageAccumulator, maxMultiplier);
        const laserDamage = Math.floor(stats.damage * damageMultiplier);

        newLaserBeams.push({
          towerId: tower.id,
          targetId: target.id,
          damage: laserDamage,
          pierce: stats.pierce,
          airMultiplier: stats.airMultiplier,
          groundMultiplier: stats.groundMultiplier,
          chain: stats.chain,
        });

        if (sfxPlayed < MAX_WEAPON_SFX_PER_TICK) {
          sfxPlayed += 1;
          void playWeaponFireSound('laser');
        }

        return {
          ...tower,
          lastFireTime: now,
          currentTargetId: target.id,
          damageAccumulator: newDamageAccumulator,
        };
      }

      // Create projectile for non-laser towers
      const projectile: Projectile = {
        id: generateId(),
        position: { x: tower.position.x, y: tower.position.y },
        targetId: target.id,
        damage: stats.damage,
        speed: stats.projectileSpeed,
        towerId: tower.id,
        towerType: tower.type,
        isSplash: tower.type === 'splash' || tower.type === 'missile' || tower.type === 'flak',
        splashRadius: stats.splashRadius,
        isFreeze: tower.type === 'freeze',
        slowAmount: stats.slowAmount,
        slowDuration: stats.slowDuration,
        pierce: stats.pierce,
        airMultiplier: stats.airMultiplier,
        groundMultiplier: stats.groundMultiplier,
        chain: stats.chain,
      };

      newProjectiles.push(projectile);
      if (sfxPlayed < MAX_WEAPON_SFX_PER_TICK) {
        sfxPlayed += 1;
        void playWeaponFireSound(tower.type);
      }
      return { ...tower, lastFireTime: now };
    });

    // ====== PROCESS LASER BEAMS (instant damage) ======
    type HitPacket = {
      id: string;
      damage: number;
      pierce: number;
      airMultiplier: number;
      groundMultiplier: number;
      chain: number;
      slow?: { amount: number; duration: number };
    };

    // ====== MOVE PROJECTILES ======
    const projectilesToRemove = new Set<string>();
    const enemyDamage: HitPacket[] = newLaserBeams.map((beam) => ({
      id: beam.targetId,
      damage: beam.damage,
      pierce: beam.pierce,
      airMultiplier: beam.airMultiplier,
      groundMultiplier: beam.groundMultiplier,
      chain: beam.chain,
    }));
    const enemyById = new Map<string, Enemy>();
    for (const enemy of updatedEnemies) {
      enemyById.set(enemy.id, enemy);
    }

    const updatedProjectiles = [...state.projectiles, ...newProjectiles].map(proj => {
      const target = enemyById.get(proj.targetId);
      if (!target || exploding.has(target.id)) {
        projectilesToRemove.add(proj.id);
        return proj;
      }

      const dx = target.position.x - proj.position.x;
      const dy = target.position.y - proj.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const moveAmount = proj.speed * adjustedDelta * 0.001;

      if (dist < moveAmount + 0.2) {
        projectilesToRemove.add(proj.id);
        void playProjectileImpact(proj);

        if (proj.isSplash && proj.splashRadius) {
          const splashRadiusSq = proj.splashRadius * proj.splashRadius;
          for (const e of enemiesForTowers) {
            const edx = e.position.x - target.position.x;
            const edy = e.position.y - target.position.y;
            if (edx * edx + edy * edy <= splashRadiusSq) {
              if (!canTargetEnemy(!!e.flying, proj.airMultiplier ?? 1, proj.groundMultiplier ?? 1)) continue;
              enemyDamage.push({
                id: e.id,
                damage: proj.damage,
                pierce: proj.pierce ?? 0,
                airMultiplier: proj.airMultiplier ?? 1,
                groundMultiplier: proj.groundMultiplier ?? 1,
                chain: 0,
              });
            }
          }
        } else {
          enemyDamage.push({
            id: target.id,
            damage: proj.damage,
            pierce: proj.pierce ?? 0,
            airMultiplier: proj.airMultiplier ?? 1,
            groundMultiplier: proj.groundMultiplier ?? 1,
            chain: proj.chain ?? 0,
            slow: proj.isFreeze && proj.slowAmount && proj.slowDuration
              ? { amount: proj.slowAmount, duration: proj.slowDuration }
              : undefined,
          });
        }
        
        return proj;
      }

      return {
        ...proj,
        position: {
          x: proj.position.x + (dx / dist) * moveAmount,
          y: proj.position.y + (dy / dist) * moveAmount,
        },
      };
    });

    // ====== APPLY DAMAGE (NO COMBO) ======
    let enemiesKilledThisTick = 0;
    let coinsEarned = 0;
    const doubleDamage = now < state.doubleDamageUntil;
    const splitSpawns: Enemy[] = [];

    const chainExtra: HitPacket[] = [];
    for (const packet of enemyDamage) {
      if (packet.chain <= 0) continue;
      const origin = updatedEnemies.find((e) => e.id === packet.id);
      if (!origin) continue;
      const ids = nearestOtherIds(
        origin.position,
        origin.id,
        enemiesForTowers.map((e) => ({ id: e.id, x: e.position.x, y: e.position.y })),
        packet.chain,
        2.4
      );
      for (const id of ids) {
        chainExtra.push({ ...packet, id, damage: packet.damage * 0.55, chain: 0, slow: undefined });
      }
    }
    if (chainExtra.length) enemyDamage.push(...chainExtra);

    type SlowPayload = { amount: number; duration: number };
    const damageAgg = new Map<string, { dealt: number; slow?: SlowPayload }>();
    for (const packet of enemyDamage) {
      const enemy = updatedEnemies.find((e) => e.id === packet.id);
      if (!enemy) continue;
      const dealt = computeHitDamage({
        raw: packet.damage,
        flying: !!enemy.flying,
        airMultiplier: packet.airMultiplier,
        groundMultiplier: packet.groundMultiplier,
        armor: enemy.armor ?? 0,
        pierce: packet.pierce,
        damageReduction: enemy.damageReduction ?? 0,
        doubleDamage,
      });
      let entry = damageAgg.get(packet.id);
      if (!entry) {
        entry = { dealt: 0 };
        damageAgg.set(packet.id, entry);
      }
      entry.dealt += dealt;
      if (packet.slow) {
        if (!entry.slow || packet.slow.duration > entry.slow.duration) entry.slow = packet.slow;
      }
    }

    const allowFx = !usePlayerStore.getState().performanceMode && (usePlayerStore.getState().vfxQuality ?? 2) > 0;
    const nextFloats: FloatText[] = allowFx ? state.floatTexts.filter((f) => now - f.born < 700).slice(-12) : [];
    const nextBursts: Burst[] = allowFx ? state.bursts.filter((b) => now - b.born < 520).slice(-16) : [];
    let flyingKills = 0;
    let armoredKills = 0;
    let bossKills = 0;

    const finalEnemies = updatedEnemies
      .filter((e) => !exploding.has(e.id))
      .map((enemy) => {
        const agg = damageAgg.get(enemy.id);
        const healAmount = healedByAura.get(enemy.id) || 0;
        if (!agg && healAmount <= 0) return enemy;

        const dealt = agg?.dealt ?? 0;
        const newHealth = Math.min(enemy.maxHealth, enemy.health + healAmount - dealt);

        let slowedUntil = enemy.slowedUntil;
        if (agg?.slow) {
          slowedUntil = Math.max(slowedUntil, now + agg.slow.duration);
        }

        if (allowFx && dealt >= 8 && nextFloats.length < 12) {
          nextFloats.push({
            id: generateId(),
            x: enemy.position.x,
            y: enemy.position.y,
            text: String(Math.max(1, Math.round(dealt))),
            born: now,
          });
        }

        if (newHealth <= 0) {
          enemiesKilledThisTick++;
          if (enemy.type === 'flying') flyingKills += 1;
          else if (enemy.type === 'armored') armoredKills += 1;
          else if (enemy.type === 'boss') bossKills += 1;
          coinsEarned += scaleRunCoinsFromKill(enemy.coinReward);
          if (allowFx && nextBursts.length < 16) {
            nextBursts.push({
              id: generateId(),
              x: enemy.position.x,
              y: enemy.position.y,
              born: now,
              color: ENEMIES[enemy.type].color,
            });
          }
          if (enemy.splitOnDeath && enemy.splitInto && enemy.splitCount) {
            const splitDef = ENEMIES[enemy.splitInto];
            const blockedCells = getBlockedCells(state.towers);
            const start = {
              x: Math.max(0, Math.min(state.gridCols - 1, Math.round(enemy.position.x))),
              y: Math.max(0, Math.min(state.gridRows - 1, Math.round(enemy.position.y))),
            };
            const splitPath =
              state.arenaRoute.length >= 2
                ? sliceRouteFromPosition(enemy.position, state.arenaRoute)
                : findPath(start, state.basePosition, state.gridCols, state.gridRows, blockedCells) ??
                  enemy.path;

            for (let i = 0; i < enemy.splitCount; i++) {
              splitSpawns.push({
                id: generateId(),
                type: enemy.splitInto,
                position: { x: enemy.position.x, y: enemy.position.y },
                health: Math.max(1, Math.floor(splitDef.baseHealth * 0.55)),
                maxHealth: Math.max(1, Math.floor(splitDef.baseHealth * 0.55)),
                speed: splitDef.baseSpeed * 1.15,
                pathIndex: 0,
                slowedUntil: 0,
                coinReward: Math.max(1, Math.floor(splitDef.coinReward * 0.5)),
                spawnTime: now,
                path: splitPath,
                damageReduction: (splitDef as any).damageReduction,
                healPerSecond: (splitDef as any).healPerSecond,
                auraRange: (splitDef as any).auraRange,
                splitOnDeath: false,
                splitCount: 0,
                splitInto: undefined,
                flying: Boolean((splitDef as { flying?: boolean }).flying),
                armor: (splitDef as { armor?: number }).armor ?? 0,
              });
            }
          }
          return null;
        }

        return {
          ...enemy,
          health: newHealth,
          slowedUntil,
          hitFlashUntil: dealt > 0 ? now + 140 : enemy.hitFlashUntil,
        };
      })
      .filter(Boolean) as Enemy[];

    const newBaseHealth = Math.max(0, state.baseHealth - baseDamage);
    const isGameOver = newBaseHealth <= 0;

    if (isGameOver) {
      void stopAllSounds();
      playLoseSound();
    } else {
      if (baseDamage > 0) {
        void playBaseDamageSound();
      }
      if (enemiesKilledThisTick > 0) {
        void playEnemyDeathBurst(enemiesKilledThisTick);
      }
    }

    const sel = state.selectedPlacedTower;
    const nextSelected =
      sel === null ? null : updatedTowers.find((t) => t.id === sel.id) ?? null;

    set({
      enemies: [...finalEnemies, ...splitSpawns],
      towers: updatedTowers,
      projectiles: updatedProjectiles.filter((p) => !projectilesToRemove.has(p.id)),
      laserBeams: newLaserBeams,
      baseHealth: newBaseHealth,
      isGameOver,
      isPlaying: !isGameOver,
      coins: state.coins + coinsEarned,
      score: state.score + coinsEarned,
      enemiesKilled: state.enemiesKilled + enemiesKilledThisTick,
      selectedPlacedTower: nextSelected,
      floatTexts: nextFloats,
      bursts: nextBursts,
      runFlyingKills: state.runFlyingKills + flyingKills,
      runArmoredKills: state.runArmoredKills + armoredKills,
      runBossKills: state.runBossKills + bossKills,
    });
    } catch {
      /* abort this tick only */
    }
  },

  // Base damage
  damageBase: (damage) => {
    set((s) => {
      const newHealth = s.baseHealth - damage;
      if (newHealth <= 0) {
        void stopAllSounds();
        playLoseSound();
        return { baseHealth: 0, isGameOver: true, isPlaying: false };
      }
      return { baseHealth: newHealth };
    });
  },

  // Coins
  addCoins: (amount) => set(s => ({ coins: s.coins + amount })),
  
  spendCoins: (amount) => {
    const state = get();
    if (state.coins < amount) return false;
    set({ coins: state.coins - amount });
    return true;
  },

  // Power-ups
  activateDoubleDamage: (duration) => {
    set({ doubleDamageUntil: Date.now() + duration });
  },

  // Utility functions
  canPlaceTower: (position) => {
    const state = get();
    
    if (position.x < 0 || position.x >= state.gridCols) return false;
    if (position.y < 0 || position.y >= state.gridRows) return false;
    
    if (position.x === state.spawnPoint.x && position.y === state.spawnPoint.y) return false;
    if (position.x === state.basePosition.x && position.y === state.basePosition.y) return false;

    const hasTower = state.towers.some(
      t => Math.floor(t.position.x) === Math.floor(position.x) && 
           Math.floor(t.position.y) === Math.floor(position.y)
    );
    if (hasTower) return false;

    if (state.arenaRoute.length >= 2) {
      return !isCellOnArenaRoute(position, state.arenaRoute);
    }

    const towerPositions = state.towers.map(t => t.position);
    if (wouldBlockPath(
      position,
      state.spawnPoint,
      state.basePosition,
      state.gridCols,
      state.gridRows,
      towerPositions
    )) {
      return false;
    }

    return true;
  },

  getTowerAt: (position) => {
    return get().towers.find(
      t => Math.floor(t.position.x) === Math.floor(position.x) && 
           Math.floor(t.position.y) === Math.floor(position.y)
    );
  },

  getEnemiesInRange: (position, range) => {
    return get().enemies.filter(enemy => {
      const dx = enemy.position.x - position.x;
      const dy = enemy.position.y - position.y;
      return Math.sqrt(dx * dx + dy * dy) <= range;
    });
  },

  getTowerCost: (type) => {
    const state = get();
    const baseCost = TOWERS[type].baseCost;
    const purchaseCount = state.towerPurchaseCount[type] || 0;
    const curve = Math.floor(baseCost * Math.pow(GAME_CONFIG.TOWER_COST_INCREASE, purchaseCount));
    const shopLv = state.towerUpgradeLevels[type] ?? 0;
    const mult = 1 + shopLv * GAME_CONFIG.SHOP_LEVEL_COST_MULT;
    return Math.floor(curve * mult);
  },

  getUpgradeCost: (tower) => {
    const base = getInfiniteUpgradeCost(TOWERS[tower.type].baseCost, tower.level);
    const shopLv = get().towerUpgradeLevels[tower.type] ?? 0;
    const mult = 1 + shopLv * GAME_CONFIG.SHOP_LEVEL_COST_MULT;
    return Math.floor(base * mult);
  },

  getSellValue: (tower) => {
    return Math.floor(tower.totalCostSpent * 0.6);
  },

  getTowerColor: (tower) => {
    return SKIN_COLORS[tower.skin] || TOWERS[tower.type].color;
  },

  recalculatePath: () => {
    const state = get();
    if (state.arenaRoute.length >= 2) {
      return state.arenaRoute.map((p) => ({ x: p.x, y: p.y }));
    }
    const blockedCells = getBlockedCells(state.towers);
    return findPath(
      state.spawnPoint,
      state.basePosition,
      state.gridCols,
      state.gridRows,
      blockedCells
    );
  },

  setZoomLevel: (level) =>
    set({ zoomLevel: Math.max(0.8, Math.min(2.5, level)) }),
  
  getCurrentCoins: () => get().coins,
  
  // Get game state for saving
  getGameStateForSave: () => {
    const state = get();
    return {
      currentWave: state.currentWave,
      waveInProgress: false, // Always save as not in wave
      coins: state.coins,
      baseHealth: state.baseHealth,
      score: state.score,
      enemiesKilled: state.enemiesKilled,
      towersPlaced: state.towersPlaced,
      towers: state.towers.map(t => ({
        id: t.id,
        type: t.type,
        position: { x: t.position.x, y: t.position.y },
        level: t.level,
        skin: t.skin,
        targetingMode: t.targetingMode,
        totalCostSpent: t.totalCostSpent,
        path: normalizeTowerPath(t.path),
      })),
      towerPurchaseCount: mergeNumericRecord(state.towerPurchaseCount),
      gridCols: state.gridCols,
      gridRows: state.gridRows,
      arenaExpansions: state.arenaExpansions,
      savedAt: Date.now(),
      mapId: state.currentMapId,
    };
  },
  
  // Resume from saved game
  resumeFromSavedGame: (savedGame, playerData) => {
    const baseConfig = GAME_CONFIG;
    const restoredTowers: PlacedTower[] = savedGame.towers.map((t) => ({
      ...t,
      path: normalizeTowerPath(t.path),
      lastFireTime: 0,
      currentTargetId: null,
      damageAccumulator: 0,
    }));

    const resumeMapId = savedGame.mapId ?? CLASSIC_MAP_ID;
    const def = getArenaMap(resumeMapId);

    if (def && def.route.length >= 2) {
      const arenaRoute = def.route.map((p) => ({ x: p.x, y: p.y }));
      set({
        isPlaying: true,
        isPaused: false,
        isGameOver: false,
        revivedThisRun: false,
        currentWave: savedGame.currentWave,
        waveInProgress: false,
        waveSpawnSlotsTotal: 0,
        waveSpawnSlotsReleased: 0,
        coins: savedGame.coins,
        baseHealth: savedGame.baseHealth,
        score: savedGame.score,
        enemiesKilled: savedGame.enemiesKilled,
        towersPlaced: savedGame.towersPlaced,
        towers: restoredTowers,
        enemies: [],
        projectiles: [],
        laserBeams: [],
        floatTexts: [],
        bursts: [],
        gridCols: def.gridCols,
        gridRows: def.gridRows,
        cellSize: def.cellSize,
        spawnPoint: { ...def.spawnPoint },
        basePosition: { ...def.basePosition },
        unlockedTowers: playerData.unlockedTowers,
        unlockedSpeeds: normalizeUnlockedSpeeds(playerData.unlockedSpeeds),
        towerUpgradeLevels: playerData.towerUpgradeLevels,
        equippedSkins: playerData.equippedSkins,
        arenaExpansions: savedGame.arenaExpansions,
        towerPurchaseCount: mergeNumericRecord(savedGame.towerPurchaseCount),
        doubleDamageUntil: 0,
        gameStartTime: Date.now(),
        gameSpeed: 1,
        waveEndTime: 0,
        autoWaveTimer: GAME_CONFIG.WAVE_DELAY,
        selectedTowerType: null,
        selectedPlacedTower: null,
        zoomLevel: 1,
        runGemsFromWavePart: targetWavePerformanceGems(savedGame.currentWave),
        currentMapId: def.id,
        arenaRoute,
        mapTheme: def.theme,
      });
      setGameplaySfxArmed(true);
      return;
    }

    const cellSize =
      savedGame.arenaExpansions > 3 ? 28 : savedGame.arenaExpansions > 1 ? 30 : baseConfig.CELL_SIZE;

    const spawnPoint = { x: 0, y: 0 };
    const basePosition = {
      x: savedGame.gridCols - 1,
      y: savedGame.gridRows - 1,
    };

    set({
      isPlaying: true,
      isPaused: false,
      isGameOver: false,
      revivedThisRun: false,
      currentWave: savedGame.currentWave,
      waveInProgress: false,
      waveSpawnSlotsTotal: 0,
      waveSpawnSlotsReleased: 0,
      coins: savedGame.coins,
      baseHealth: savedGame.baseHealth,
      score: savedGame.score,
      enemiesKilled: savedGame.enemiesKilled,
      towersPlaced: savedGame.towersPlaced,
      towers: restoredTowers,
      enemies: [],
      projectiles: [],
      laserBeams: [],
      floatTexts: [],
      bursts: [],
      gridCols: savedGame.gridCols,
      gridRows: savedGame.gridRows,
      cellSize,
      spawnPoint,
      basePosition,
      unlockedTowers: playerData.unlockedTowers,
      unlockedSpeeds: normalizeUnlockedSpeeds(playerData.unlockedSpeeds),
      towerUpgradeLevels: playerData.towerUpgradeLevels,
      equippedSkins: playerData.equippedSkins,
      arenaExpansions: savedGame.arenaExpansions,
      towerPurchaseCount: mergeNumericRecord(savedGame.towerPurchaseCount),
      doubleDamageUntil: 0,
      gameStartTime: Date.now(),
      gameSpeed: 1,
      waveEndTime: 0,
      autoWaveTimer: GAME_CONFIG.WAVE_DELAY,
      selectedTowerType: null,
      selectedPlacedTower: null,
      zoomLevel: 1,
      runGemsFromWavePart: targetWavePerformanceGems(savedGame.currentWave),
      currentMapId: CLASSIC_MAP_ID,
      arenaRoute: [],
      mapTheme: null,
    });
    setGameplaySfxArmed(true);
  },
}));
