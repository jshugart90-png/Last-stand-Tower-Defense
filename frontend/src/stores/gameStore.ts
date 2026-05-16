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
  getInfiniteUpgradeStats,
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
} from '../constants/game';
import { isServerBackedPlayerId } from '../hooks/useApi';
import { findPath, wouldBlockPath } from '../utils/pathfinding';
import {
  getArenaMap,
  sliceRouteFromPosition,
  isCellOnArenaRoute,
  CLASSIC_MAP_ID,
  type ArenaMapTheme,
} from '../constants/arenaMaps';
import {
  playWeaponFireSound,
  playProjectileImpact,
  playEnemyDeathBurst,
  playBaseDamageSound,
  playWaveStartFanfare,
  stopAllSounds,
  setGameplaySfxArmed,
} from '../services/audioService';
import { usePlayerStore } from './playerStore';

/** Cleared on new runs / game end so dismiss callbacks never stack or fire after teardown. */
let bonusPopupDismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearBonusPopupDismissTimer() {
  if (bonusPopupDismissTimer !== null) {
    clearTimeout(bonusPopupDismissTimer);
    bonusPopupDismissTimer = null;
  }
}

function scaleRunCoinsFromKill(baseReward: number): number {
  const lv = usePlayerStore.getState().coinIncomeUpgradeLevel ?? 0;
  return Math.max(1, Math.floor(baseReward * getRunCoinIncomeMultiplier(lv)));
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
}

export interface LaserBeam {
  towerId: string;
  targetId: string;
  damage: number;
}

export interface GameState {
  // Game status
  isPlaying: boolean;
  isPaused: boolean;
  isGameOver: boolean;
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
  hasRevive: boolean;
  adReviveUsed: boolean;
  
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
  upgradeTower: (towerId: string) => boolean;
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
  grantRevive: () => void;
  useRevive: () => boolean;
  canUseAdRevive: () => boolean;
  
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
  }[];
  towerPurchaseCount: Record<TowerType, number>;
  gridCols: number;
  gridRows: number;
  arenaExpansions: number;
  savedAt: number;
  adReviveUsed: boolean;
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

const generateId = () => Math.random().toString(36).substr(2, 9);

const MAX_WEAPON_SFX_PER_TICK = 10;

const scratchEnemiesInRange: Enemy[] = [];
const scratchLaserDamage: { id: string; damage: number }[] = [];

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
  towerUpgradeLevels: {
    machine_gun: 0,
    sniper: 0,
    splash: 0,
    freeze: 0,
    missile: 0,
    laser: 0,
  },
  equippedSkins: {},
  arenaExpansions: 0,
  towerPurchaseCount: {
    machine_gun: 0,
    sniper: 0,
    splash: 0,
    freeze: 0,
    missile: 0,
    laser: 0,
  },
  doubleDamageUntil: 0,
  hasRevive: false,
  adReviveUsed: false,
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
        currentWave: 0,
        waveInProgress: false,
        waveSpawnSlotsTotal: 0,
        waveSpawnSlotsReleased: 0,
        coins: GAME_CONFIG.STARTING_COINS + coinBonus,
        baseHealth: GAME_CONFIG.BASE_HEALTH,
        score: 0,
        enemiesKilled: 0,
        towersPlaced: 0,
        towers: [],
        enemies: [],
        projectiles: [],
        laserBeams: [],
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
        towerPurchaseCount: {
          machine_gun: 0,
          sniper: 0,
          splash: 0,
          freeze: 0,
          missile: 0,
          laser: 0,
        },
        doubleDamageUntil: 0,
        hasRevive: false,
        adReviveUsed: false,
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
      currentWave: 0,
      waveInProgress: false,
      waveSpawnSlotsTotal: 0,
      waveSpawnSlotsReleased: 0,
      coins: GAME_CONFIG.STARTING_COINS + coinBonus,
      baseHealth: GAME_CONFIG.BASE_HEALTH,
      score: 0,
      enemiesKilled: 0,
      towersPlaced: 0,
      towers: [],
      enemies: [],
      projectiles: [],
      laserBeams: [],
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
      towerPurchaseCount: {
        machine_gun: 0,
        sniper: 0,
        splash: 0,
        freeze: 0,
        missile: 0,
        laser: 0,
      },
      doubleDamageUntil: 0,
      hasRevive: false,
      adReviveUsed: false,
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
    set({ isPlaying: false, isGameOver: true });
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
    const bonus = Math.max(
      0,
      Math.floor(rawBonus * getRunCoinIncomeMultiplier(incomeLv))
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

    void stopAllSounds();
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
      currentTargetId: null,
      damageAccumulator: 0,
    };

    const newPurchaseCount = {
      ...state.towerPurchaseCount,
      [state.selectedTowerType]: state.towerPurchaseCount[state.selectedTowerType] + 1,
    };

    // Get all towers including the new one for path recalculation
    const allTowers = [...state.towers, newTower];
    const blockedCells = getBlockedCells(allTowers);

    // Recalculate paths for ALL existing enemies
    const updatedEnemies = state.enemies.map((enemy) => {
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

    return true;
  },

  upgradeTower: (towerId) => {
    const state = get();
    const tower = state.towers.find(t => t.id === towerId);
    if (!tower) return false;

    const cost = state.getUpgradeCost(tower);
    if (state.coins < cost) return false;

    set(s => ({
      towers: s.towers.map(t =>
        t.id === towerId 
          ? { ...t, level: t.level + 1, totalCostSpent: t.totalCostSpent + cost } 
          : t
      ),
      coins: s.coins - cost,
      selectedPlacedTower: s.selectedPlacedTower?.id === towerId 
        ? { ...s.selectedPlacedTower, level: s.selectedPlacedTower.level + 1, totalCostSpent: s.selectedPlacedTower.totalCostSpent + cost }
        : s.selectedPlacedTower,
    }));

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
    
    let path: { x: number; y: number }[];
    if (state.arenaRoute.length >= 2) {
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
      damageReduction: (enemyDef as any).damageReduction,
      healPerSecond: (enemyDef as any).healPerSecond,
      auraRange: (enemyDef as any).auraRange,
      splitOnDeath: (enemyDef as any).splitOnDeath,
      splitCount: (enemyDef as any).splitCount,
      splitInto: (enemyDef as any).splitInto,
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
      let stats = getInfiniteUpgradeStats(towerDef.baseStats, tower.level);

      if (shopBonus > 0) {
        const shopMultiplier = Math.pow(1.05, shopBonus);
        stats = {
          ...stats,
          damage: Math.floor(stats.damage * shopMultiplier),
          range: stats.range * (1 + shopBonus * 0.02),
        };
      }

      if (now - tower.lastFireTime < stats.fireRate / state.gameSpeed) {
        if (tower.type === 'laser') {
          return { ...tower, currentTargetId: null, damageAccumulator: 0 };
        }
        return tower;
      }

      const rangeSq = stats.range * stats.range;
      const tx = tower.position.x;
      const ty = tower.position.y;
      scratchEnemiesInRange.length = 0;
      for (const enemy of enemiesForTowers) {
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
        const laserStats = stats as any;
        let newDamageAccumulator = tower.damageAccumulator;
        
        // If same target, increase damage
        if (tower.currentTargetId === target.id) {
          newDamageAccumulator += laserStats.damageRampUp || 0.5;
        } else {
          newDamageAccumulator = 0;
        }
        
        // Cap the damage multiplier
        const maxMultiplier = laserStats.maxDamageMultiplier || 10;
        const damageMultiplier = Math.min(1 + newDamageAccumulator, maxMultiplier);
        const laserDamage = Math.floor(stats.damage * damageMultiplier);
        
        newLaserBeams.push({
          towerId: tower.id,
          targetId: target.id,
          damage: laserDamage,
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
        isSplash: tower.type === 'splash' || tower.type === 'missile',
        splashRadius: (stats as any).splashRadius,
        isFreeze: tower.type === 'freeze',
        slowAmount: (stats as any).slowAmount,
        slowDuration: (stats as any).slowDuration,
      };

      newProjectiles.push(projectile);
      if (sfxPlayed < MAX_WEAPON_SFX_PER_TICK) {
        sfxPlayed += 1;
        void playWeaponFireSound(tower.type);
      }
      return { ...tower, lastFireTime: now };
    });

    // ====== PROCESS LASER BEAMS (instant damage) ======
    scratchLaserDamage.length = 0;
    for (const beam of newLaserBeams) {
      scratchLaserDamage.push({ id: beam.targetId, damage: beam.damage });
    }

    // ====== MOVE PROJECTILES ======
    const projectilesToRemove = new Set<string>();
    const enemyDamage: { id: string; damage: number; slow?: { amount: number; duration: number } }[] =
      scratchLaserDamage.slice();
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
              enemyDamage.push({ id: e.id, damage: proj.damage });
            }
          }
        } else {
          enemyDamage.push({ 
            id: target.id, 
            damage: proj.damage,
            slow: proj.isFreeze && proj.slowAmount && proj.slowDuration 
              ? { amount: proj.slowAmount, duration: proj.slowDuration }
              : undefined
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

    type SlowPayload = { amount: number; duration: number };
    const damageAgg = new Map<string, { totalDamage: number; slow?: SlowPayload }>();
    for (const d of enemyDamage) {
      let entry = damageAgg.get(d.id);
      if (!entry) {
        entry = { totalDamage: 0 };
        damageAgg.set(d.id, entry);
      }
      entry.totalDamage += d.damage;
      if (d.slow) {
        if (!entry.slow || d.slow.duration > entry.slow.duration) {
          entry.slow = d.slow;
        }
      }
    }

    const finalEnemies = updatedEnemies
      .filter((e) => !exploding.has(e.id))
      .map((enemy) => {
        const agg = damageAgg.get(enemy.id);
        if (!agg) return enemy;

        let totalDamage = agg.totalDamage;
        if (doubleDamage) totalDamage *= 2;
        if (enemy.damageReduction) {
          totalDamage *= (1 - enemy.damageReduction);
        }

        const healAmount = healedByAura.get(enemy.id) || 0;
        const newHealth = Math.min(enemy.maxHealth, enemy.health + healAmount - totalDamage);

        let slowedUntil = enemy.slowedUntil;
        if (agg.slow) {
          slowedUntil = Math.max(slowedUntil, now + agg.slow.duration);
        }

        if (newHealth <= 0) {
          enemiesKilledThisTick++;
          coinsEarned += scaleRunCoinsFromKill(enemy.coinReward);
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
              });
            }
          }
          return null;
        }

        return { ...enemy, health: newHealth, slowedUntil };
      })
      .filter(Boolean) as Enemy[];

    const newBaseHealth = Math.max(0, state.baseHealth - baseDamage);
    const isGameOver = newBaseHealth <= 0 && !state.hasRevive;

    if (isGameOver) {
      void stopAllSounds();
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
    });
    } catch {
      /* abort this tick only */
    }
  },

  // Base damage
  damageBase: (damage) => {
    set((s) => {
      const newHealth = s.baseHealth - damage;
      if (newHealth <= 0 && !s.hasRevive) {
        void stopAllSounds();
        return { baseHealth: 0, isGameOver: true, isPlaying: false };
      }
      return { baseHealth: Math.max(0, newHealth) };
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

  grantRevive: () => set({ hasRevive: true }),

  useRevive: () => {
    const state = get();
    if (!state.hasRevive) return false;
    set({
      hasRevive: false,
      baseHealth: Math.max(1, Math.floor(GAME_CONFIG.BASE_HEALTH * 0.4)),
      isGameOver: false,
      isPlaying: true,
      adReviveUsed: true,
      // Keep the run in-flight: resume the same wave immediately after revive.
      waveInProgress: true,
      autoWaveTimer: 0,
    });
    setGameplaySfxArmed(true);
    return true;
  },

  canUseAdRevive: () => !get().adReviveUsed,

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
    const purchaseCount = state.towerPurchaseCount[type];
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
      })),
      towerPurchaseCount: { ...state.towerPurchaseCount },
      gridCols: state.gridCols,
      gridRows: state.gridRows,
      arenaExpansions: state.arenaExpansions,
      savedAt: Date.now(),
      adReviveUsed: state.adReviveUsed,
      mapId: state.currentMapId,
    };
  },
  
  // Resume from saved game
  resumeFromSavedGame: (savedGame, playerData) => {
    const baseConfig = GAME_CONFIG;
    const restoredTowers: PlacedTower[] = savedGame.towers.map((t) => ({
      ...t,
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
        towerPurchaseCount: savedGame.towerPurchaseCount,
        doubleDamageUntil: 0,
        hasRevive: false,
        adReviveUsed: savedGame.adReviveUsed,
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
      towerPurchaseCount: savedGame.towerPurchaseCount,
      doubleDamageUntil: 0,
      hasRevive: false,
      adReviveUsed: savedGame.adReviveUsed,
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
