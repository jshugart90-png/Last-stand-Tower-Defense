import { create } from 'zustand';
import { 
  TOWERS, ENEMIES, GAME_CONFIG, getWaveConfig, TowerType, EnemyType, 
  SKIN_COLORS, SPAWN_POINT, BASE_POSITION, getTowersUnlockedByWave,
  getInfiniteUpgradeStats, getInfiniteUpgradeCost, TargetingMode
} from '../constants/game';
import { findPath, wouldBlockPath } from '../utils/pathfinding';

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
  totalCostSpent: number; // Track total coins spent on this tower
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
  spawnTime: number; // For "last" targeting
  path: Position[]; // Individual path for each enemy
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

export type GameSpeed = 1 | 2 | 3;

export interface GameState {
  // Game status
  isPlaying: boolean;
  isPaused: boolean;
  isGameOver: boolean;
  currentWave: number;
  waveInProgress: boolean;
  
  // Player stats
  coins: number;
  baseHealth: number;
  score: number;
  enemiesKilled: number;
  towersPlaced: number;
  
  // Combo system
  comboCount: number;
  lastKillTime: number;
  
  // Game entities
  towers: PlacedTower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  
  // Map configuration
  gridCols: number;
  gridRows: number;
  cellSize: number;
  spawnPoint: Position;
  basePosition: Position;
  
  // Player progression
  unlockedTowers: TowerType[];
  equippedSkins: Record<string, string>;
  arenaExpansions: number;
  
  // Tower purchase tracking (for cost increases)
  towerPurchaseCount: Record<TowerType, number>;
  
  // Power-ups
  doubleDamageUntil: number;
  hasRevive: boolean;
  adReviveUsed: boolean; // Track if ad revive already used this game
  
  // Game timing
  gameStartTime: number;
  gameSpeed: GameSpeed;
  waveEndTime: number; // For auto-start timer
  autoWaveTimer: number; // Countdown in ms
  
  // UI State
  selectedTowerType: TowerType | null;
  selectedPlacedTower: PlacedTower | null;
  
  // Zoom
  zoomLevel: number;
}

interface GameActions {
  // Game flow
  startGame: (equippedSkins: Record<string, string>, arenaExpansions: number) => void;
  pauseGame: () => void;
  resumeGame: () => void;
  endGame: () => void;
  restartGame: () => void;
  
  // Speed control
  setGameSpeed: (speed: GameSpeed) => void;
  
  // Wave management
  startWave: () => void;
  endWave: () => void;
  
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
  
  // Save coins to player store callback
  onCoinsEarned?: (coins: number) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

// Get blocked cells from towers
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
  coins: GAME_CONFIG.STARTING_COINS,
  baseHealth: GAME_CONFIG.BASE_HEALTH,
  score: 0,
  enemiesKilled: 0,
  towersPlaced: 0,
  comboCount: 0,
  lastKillTime: 0,
  towers: [],
  enemies: [],
  projectiles: [],
  gridCols: GAME_CONFIG.GRID_COLS,
  gridRows: GAME_CONFIG.GRID_ROWS,
  cellSize: GAME_CONFIG.CELL_SIZE,
  spawnPoint: { ...SPAWN_POINT },
  basePosition: { ...BASE_POSITION },
  unlockedTowers: ['machine_gun'],
  equippedSkins: {},
  arenaExpansions: 0,
  towerPurchaseCount: {
    machine_gun: 0,
    sniper: 0,
    splash: 0,
    freeze: 0,
    missile: 0,
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
  zoomLevel: 1,

  // Game flow
  startGame: (equippedSkins, arenaExpansions) => {
    const baseConfig = GAME_CONFIG;
    const gridCols = baseConfig.GRID_COLS + (arenaExpansions * 2);
    const gridRows = baseConfig.GRID_ROWS + (arenaExpansions * 2);
    const cellSize = arenaExpansions > 3 ? 28 : arenaExpansions > 1 ? 30 : baseConfig.CELL_SIZE;
    
    // Adjust spawn and base for expansions
    const spawnPoint = { x: arenaExpansions, y: arenaExpansions };
    const basePosition = { 
      x: gridCols - 1 - arenaExpansions, 
      y: gridRows - 1 - arenaExpansions 
    };
    
    set({
      isPlaying: true,
      isPaused: false,
      isGameOver: false,
      currentWave: 0,
      waveInProgress: false,
      coins: GAME_CONFIG.STARTING_COINS,
      baseHealth: GAME_CONFIG.BASE_HEALTH,
      score: 0,
      enemiesKilled: 0,
      towersPlaced: 0,
      comboCount: 0,
      lastKillTime: 0,
      towers: [],
      enemies: [],
      projectiles: [],
      gridCols,
      gridRows,
      cellSize,
      spawnPoint,
      basePosition,
      unlockedTowers: ['machine_gun'], // Start with only machine gun
      equippedSkins,
      arenaExpansions,
      towerPurchaseCount: {
        machine_gun: 0,
        sniper: 0,
        splash: 0,
        freeze: 0,
        missile: 0,
      },
      doubleDamageUntil: 0,
      hasRevive: false,
      adReviveUsed: false,
      gameStartTime: Date.now(),
      gameSpeed: 1,
      waveEndTime: 0,
      autoWaveTimer: GAME_CONFIG.WAVE_DELAY,
      selectedTowerType: null,
      selectedPlacedTower: null,
      zoomLevel: 1,
    });
  },

  pauseGame: () => set({ isPaused: true }),
  resumeGame: () => set({ isPaused: false }),
  endGame: () => set({ isPlaying: false, isGameOver: true }),
  
  restartGame: () => {
    const { equippedSkins, arenaExpansions } = get();
    get().startGame(equippedSkins, arenaExpansions);
  },

  setGameSpeed: (speed) => set({ gameSpeed: speed }),

  // Wave management
  startWave: () => {
    const state = get();
    const newWave = state.currentWave + 1;
    
    // Unlock towers based on wave
    const newUnlockedTowers = getTowersUnlockedByWave(newWave);
    
    set({
      currentWave: newWave,
      waveInProgress: true,
      unlockedTowers: newUnlockedTowers,
      autoWaveTimer: 0,
    });
  },

  endWave: () => {
    set({ 
      waveInProgress: false,
      waveEndTime: Date.now(),
      autoWaveTimer: GAME_CONFIG.WAVE_DELAY,
    });
  },

  // Tower actions
  selectTower: (type) => set({ selectedTowerType: type, selectedPlacedTower: null }),
  selectPlacedTower: (tower) => set({ selectedPlacedTower: tower, selectedTowerType: null }),

  placeTower: (position) => {
    const state = get();
    if (!state.selectedTowerType) return false;
    
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
    };

    // Update tower purchase count for cost increase
    const newPurchaseCount = {
      ...state.towerPurchaseCount,
      [state.selectedTowerType]: state.towerPurchaseCount[state.selectedTowerType] + 1,
    };

    set(s => ({
      towers: [...s.towers, newTower],
      coins: s.coins - cost,
      towersPlaced: s.towersPlaced + 1,
      towerPurchaseCount: newPurchaseCount,
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
    
    // Calculate path for this enemy
    const blockedCells = getBlockedCells(state.towers);
    const path = findPath(
      state.spawnPoint,
      state.basePosition,
      state.gridCols,
      state.gridRows,
      blockedCells
    );
    
    if (!path || path.length < 2) {
      console.error('No valid path for enemy!');
      return;
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
    };

    set(s => ({ enemies: [...s.enemies, enemy] }));
  },

  // Main game tick
  gameTick: (deltaTime) => {
    const state = get();
    if (!state.isPlaying || state.isPaused) return;

    const now = Date.now();
    const adjustedDelta = deltaTime * state.gameSpeed;

    // Update auto wave timer
    if (!state.waveInProgress && state.autoWaveTimer > 0) {
      const newTimer = state.autoWaveTimer - adjustedDelta;
      if (newTimer <= 0) {
        // Auto start next wave
        get().startWave();
        return;
      }
      set({ autoWaveTimer: newTimer });
    }

    // ====== MOVE ENEMIES ======
    let enemiesToRemove: string[] = [];
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

    // ====== TOWER FIRING ======
    let newProjectiles: Projectile[] = [];
    const updatedTowers = state.towers.map(tower => {
      const towerDef = TOWERS[tower.type];
      const stats = getInfiniteUpgradeStats(towerDef.baseStats, tower.level);
      
      if (now - tower.lastFireTime < stats.fireRate / state.gameSpeed) {
        return tower;
      }
      
      // Find enemies in range
      const enemiesInRange = updatedEnemies.filter(enemy => {
        if (enemiesToRemove.includes(enemy.id)) return false;
        const dx = enemy.position.x - tower.position.x;
        const dy = enemy.position.y - tower.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist <= stats.range;
      });
      
      if (enemiesInRange.length === 0) return tower;
      
      // Select target based on targeting mode
      let target: typeof enemiesInRange[0];
      switch (tower.targetingMode) {
        case 'first':
          // Furthest along their path (closest to base)
          target = enemiesInRange.reduce((a, b) => 
            (a.pathIndex / a.path.length) > (b.pathIndex / b.path.length) ? a : b
          );
          break;
        case 'last':
          // Most recently spawned
          target = enemiesInRange.reduce((a, b) => 
            a.spawnTime > b.spawnTime ? a : b
          );
          break;
        case 'strongest':
          // Most health
          target = enemiesInRange.reduce((a, b) => 
            a.health > b.health ? a : b
          );
          break;
        case 'closest':
          // Nearest to tower
          target = enemiesInRange.reduce((a, b) => {
            const distA = Math.sqrt(
              Math.pow(a.position.x - tower.position.x, 2) +
              Math.pow(a.position.y - tower.position.y, 2)
            );
            const distB = Math.sqrt(
              Math.pow(b.position.x - tower.position.x, 2) +
              Math.pow(b.position.y - tower.position.y, 2)
            );
            return distA < distB ? a : b;
          });
          break;
        default:
          target = enemiesInRange[0];
      }
      
      // Create projectile
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
      return { ...tower, lastFireTime: now };
    });

    // ====== MOVE PROJECTILES ======
    let projectilesToRemove: string[] = [];
    let enemyDamage: { id: string; damage: number; slow?: { amount: number; duration: number } }[] = [];

    const updatedProjectiles = [...state.projectiles, ...newProjectiles].map(proj => {
      const target = updatedEnemies.find(e => e.id === proj.targetId);
      if (!target || enemiesToRemove.includes(target.id)) {
        projectilesToRemove.push(proj.id);
        return proj;
      }

      const dx = target.position.x - proj.position.x;
      const dy = target.position.y - proj.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const moveAmount = proj.speed * adjustedDelta * 0.001;

      if (dist < moveAmount + 0.2) {
        projectilesToRemove.push(proj.id);
        
        if (proj.isSplash && proj.splashRadius) {
          updatedEnemies.forEach(e => {
            const edx = e.position.x - target.position.x;
            const edy = e.position.y - target.position.y;
            const eDist = Math.sqrt(edx * edx + edy * edy);
            if (eDist <= proj.splashRadius!) {
              enemyDamage.push({ id: e.id, damage: proj.damage });
            }
          });
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

    // ====== APPLY DAMAGE ======
    let enemiesKilledThisTick = 0;
    let coinsEarned = 0;
    const doubleDamage = now < state.doubleDamageUntil;

    const finalEnemies = updatedEnemies
      .filter(e => !enemiesToRemove.includes(e.id))
      .map(enemy => {
        const damageEntries = enemyDamage.filter(d => d.id === enemy.id);
        if (damageEntries.length === 0) return enemy;

        let totalDamage = damageEntries.reduce((sum, d) => sum + d.damage, 0);
        if (doubleDamage) totalDamage *= 2;

        const newHealth = enemy.health - totalDamage;
        
        let slowedUntil = enemy.slowedUntil;
        damageEntries.forEach(d => {
          if (d.slow) {
            slowedUntil = Math.max(slowedUntil, now + d.slow.duration);
          }
        });

        if (newHealth <= 0) {
          enemiesKilledThisTick++;
          coinsEarned += enemy.coinReward;
          return null;
        }

        return { ...enemy, health: newHealth, slowedUntil };
      })
      .filter(Boolean) as Enemy[];

    // ====== UPDATE STATE ======
    const newBaseHealth = Math.max(0, state.baseHealth - baseDamage);
    const isGameOver = newBaseHealth <= 0 && !state.hasRevive;

    // Combo system
    let newComboCount = state.comboCount;
    let newLastKillTime = state.lastKillTime;
    if (enemiesKilledThisTick > 0) {
      const isCombo = now - state.lastKillTime < GAME_CONFIG.COMBO_WINDOW;
      if (isCombo) {
        newComboCount += enemiesKilledThisTick;
        coinsEarned += Math.floor(coinsEarned * newComboCount * GAME_CONFIG.COMBO_BONUS_MULTIPLIER);
      } else {
        newComboCount = enemiesKilledThisTick;
      }
      newLastKillTime = now;
    }

    set({
      enemies: finalEnemies,
      towers: updatedTowers,
      projectiles: updatedProjectiles.filter(p => !projectilesToRemove.includes(p.id)),
      baseHealth: newBaseHealth,
      isGameOver,
      isPlaying: !isGameOver,
      coins: state.coins + coinsEarned,
      score: state.score + coinsEarned,
      enemiesKilled: state.enemiesKilled + enemiesKilledThisTick,
      comboCount: newComboCount,
      lastKillTime: newLastKillTime,
    });
  },

  // Base damage
  damageBase: (damage) => {
    set(s => {
      const newHealth = s.baseHealth - damage;
      if (newHealth <= 0 && !s.hasRevive) {
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
      baseHealth: Math.floor(GAME_CONFIG.BASE_HEALTH / 2),
      isGameOver: false,
      isPlaying: true,
      adReviveUsed: true,
      waveInProgress: false,
      autoWaveTimer: GAME_CONFIG.WAVE_DELAY,
    });
    return true;
  },

  canUseAdRevive: () => !get().adReviveUsed,

  // Utility functions
  canPlaceTower: (position) => {
    const state = get();
    
    // Check bounds
    if (position.x < 0 || position.x >= state.gridCols) return false;
    if (position.y < 0 || position.y >= state.gridRows) return false;
    
    // Can't place on spawn point
    if (position.x === state.spawnPoint.x && position.y === state.spawnPoint.y) return false;
    
    // Can't place on base
    if (position.x === state.basePosition.x && position.y === state.basePosition.y) return false;

    // Check if position already has tower
    const hasTower = state.towers.some(
      t => Math.floor(t.position.x) === Math.floor(position.x) && 
           Math.floor(t.position.y) === Math.floor(position.y)
    );
    if (hasTower) return false;

    // Check if placing here would block all paths
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
    // Each purchase increases cost by 15%
    return Math.floor(baseCost * Math.pow(GAME_CONFIG.TOWER_COST_INCREASE, purchaseCount));
  },

  getUpgradeCost: (tower) => {
    return getInfiniteUpgradeCost(TOWERS[tower.type].baseCost, tower.level);
  },

  getSellValue: (tower) => {
    return Math.floor(tower.totalCostSpent * 0.6); // 60% return
  },

  getTowerColor: (tower) => {
    return SKIN_COLORS[tower.skin] || TOWERS[tower.type].color;
  },

  recalculatePath: () => {
    const state = get();
    const blockedCells = getBlockedCells(state.towers);
    return findPath(
      state.spawnPoint,
      state.basePosition,
      state.gridCols,
      state.gridRows,
      blockedCells
    );
  },

  setZoomLevel: (level) => set({ zoomLevel: Math.max(0.5, Math.min(2, level)) }),
}));
