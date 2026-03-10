import { create } from 'zustand';
import { TOWERS, ENEMIES, GAME_CONFIG, EXPANDED_GAME_CONFIG, getWaveConfig, DEFAULT_PATH, TowerType, EnemyType, SKIN_COLORS } from '../constants/game';

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
  path: Position[];
  gridCols: number;
  gridRows: number;
  cellSize: number;
  
  // Player progression
  unlockedTowers: TowerType[];
  equippedSkins: Record<string, string>;
  arenaExpanded: boolean;
  
  // Power-ups
  doubleDamageUntil: number;
  hasRevive: boolean;
  
  // Game timing
  gameStartTime: number;
  
  // Selected tower for placement
  selectedTowerType: TowerType | null;
}

interface GameActions {
  // Game flow
  startGame: (unlockedTowers: TowerType[], equippedSkins: Record<string, string>, arenaExpanded: boolean) => void;
  pauseGame: () => void;
  resumeGame: () => void;
  endGame: () => void;
  restartGame: () => void;
  
  // Wave management
  startWave: () => void;
  endWave: () => void;
  
  // Tower actions
  selectTower: (type: TowerType | null) => void;
  placeTower: (position: Position) => boolean;
  upgradeTower: (towerId: string) => boolean;
  sellTower: (towerId: string) => void;
  
  // Enemy actions
  spawnEnemy: (type: EnemyType, healthMultiplier: number, speedMultiplier: number) => void;
  damageEnemy: (enemyId: string, damage: number) => void;
  killEnemy: (enemyId: string) => void;
  moveEnemies: (deltaTime: number) => void;
  slowEnemy: (enemyId: string, slowAmount: number, duration: number) => void;
  
  // Projectile actions
  fireProjectile: (tower: PlacedTower, targetId: string) => void;
  moveProjectiles: (deltaTime: number) => void;
  removeProjectile: (projectileId: string) => void;
  
  // Damage base
  damageBase: (damage: number) => void;
  
  // Coins
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  
  // Power-ups
  activateDoubleDamage: (duration: number) => void;
  grantRevive: () => void;
  useRevive: () => boolean;
  
  // Combo
  incrementCombo: () => void;
  resetCombo: () => void;
  
  // Utility
  canPlaceTower: (position: Position) => boolean;
  getTowerAt: (position: Position) => PlacedTower | undefined;
  getEnemiesInRange: (position: Position, range: number) => Enemy[];
  getTowerCost: (type: TowerType) => number;
  getUpgradeCost: (tower: PlacedTower) => number;
  getSellValue: (tower: PlacedTower) => number;
  getTowerColor: (tower: PlacedTower) => string;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

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
  path: DEFAULT_PATH,
  gridCols: GAME_CONFIG.GRID_COLS,
  gridRows: GAME_CONFIG.GRID_ROWS,
  cellSize: GAME_CONFIG.CELL_SIZE,
  unlockedTowers: ['machine_gun'],
  equippedSkins: {},
  arenaExpanded: false,
  doubleDamageUntil: 0,
  hasRevive: false,
  gameStartTime: 0,
  selectedTowerType: null,

  // Game flow
  startGame: (unlockedTowers, equippedSkins, arenaExpanded) => {
    const config = arenaExpanded ? EXPANDED_GAME_CONFIG : GAME_CONFIG;
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
      path: DEFAULT_PATH,
      gridCols: config.GRID_COLS,
      gridRows: config.GRID_ROWS,
      cellSize: config.CELL_SIZE,
      unlockedTowers,
      equippedSkins,
      arenaExpanded,
      doubleDamageUntil: 0,
      hasRevive: false,
      gameStartTime: Date.now(),
      selectedTowerType: null,
    });
  },

  pauseGame: () => set({ isPaused: true }),
  resumeGame: () => set({ isPaused: false }),
  
  endGame: () => set({ isPlaying: false, isGameOver: true }),
  
  restartGame: () => {
    const { unlockedTowers, equippedSkins, arenaExpanded } = get();
    get().startGame(unlockedTowers, equippedSkins, arenaExpanded);
  },

  // Wave management
  startWave: () => {
    set(state => ({
      currentWave: state.currentWave + 1,
      waveInProgress: true,
    }));
  },

  endWave: () => set({ waveInProgress: false }),

  // Tower actions
  selectTower: (type) => set({ selectedTowerType: type }),

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
    };

    set(s => ({
      towers: [...s.towers, newTower],
      coins: s.coins - cost,
      towersPlaced: s.towersPlaced + 1,
    }));

    return true;
  },

  upgradeTower: (towerId) => {
    const state = get();
    const tower = state.towers.find(t => t.id === towerId);
    if (!tower) return false;

    const towerDef = TOWERS[tower.type];
    if (tower.level >= towerDef.upgrades.length) return false;

    const cost = state.getUpgradeCost(tower);
    if (state.coins < cost) return false;

    set(s => ({
      towers: s.towers.map(t =>
        t.id === towerId ? { ...t, level: t.level + 1 } : t
      ),
      coins: s.coins - cost,
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
    }));
  },

  // Enemy actions
  spawnEnemy: (type, healthMultiplier, speedMultiplier) => {
    const enemyDef = ENEMIES[type];
    const path = get().path;
    
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
    };

    set(s => ({ enemies: [...s.enemies, enemy] }));
  },

  damageEnemy: (enemyId, damage) => {
    const state = get();
    const doubleDamage = Date.now() < state.doubleDamageUntil;
    const actualDamage = doubleDamage ? damage * 2 : damage;

    set(s => ({
      enemies: s.enemies.map(e =>
        e.id === enemyId ? { ...e, health: e.health - actualDamage } : e
      ),
    }));

    // Check if enemy died
    const enemy = get().enemies.find(e => e.id === enemyId);
    if (enemy && enemy.health <= 0) {
      get().killEnemy(enemyId);
    }
  },

  killEnemy: (enemyId) => {
    const state = get();
    const enemy = state.enemies.find(e => e.id === enemyId);
    if (!enemy) return;

    // Combo system
    const now = Date.now();
    const isCombo = now - state.lastKillTime < GAME_CONFIG.COMBO_WINDOW;
    
    let comboBonus = 0;
    if (isCombo) {
      const newCombo = state.comboCount + 1;
      comboBonus = Math.floor(enemy.coinReward * newCombo * GAME_CONFIG.COMBO_BONUS_MULTIPLIER);
      set({ comboCount: newCombo, lastKillTime: now });
    } else {
      set({ comboCount: 1, lastKillTime: now });
    }

    const totalReward = enemy.coinReward + comboBonus;

    set(s => ({
      enemies: s.enemies.filter(e => e.id !== enemyId),
      coins: s.coins + totalReward,
      score: s.score + totalReward,
      enemiesKilled: s.enemiesKilled + 1,
    }));
  },

  moveEnemies: (deltaTime) => {
    const state = get();
    const path = state.path;
    const cellSize = state.cellSize;

    set(s => ({
      enemies: s.enemies.map(enemy => {
        const now = Date.now();
        const isSlowed = now < enemy.slowedUntil;
        const speed = isSlowed ? enemy.speed * 0.5 : enemy.speed;
        
        const targetPathPoint = path[enemy.pathIndex + 1];
        if (!targetPathPoint) {
          // Enemy reached the end
          return enemy;
        }

        const targetX = targetPathPoint.x * cellSize + cellSize / 2;
        const targetY = targetPathPoint.y * cellSize + cellSize / 2;
        const currentX = enemy.position.x * cellSize + cellSize / 2;
        const currentY = enemy.position.y * cellSize + cellSize / 2;

        const dx = targetX - currentX;
        const dy = targetY - currentY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < speed * deltaTime) {
          // Reached current waypoint
          if (enemy.pathIndex + 2 >= path.length) {
            // Reached the base
            return { ...enemy, pathIndex: path.length };
          }
          return {
            ...enemy,
            position: { x: targetPathPoint.x, y: targetPathPoint.y },
            pathIndex: enemy.pathIndex + 1,
          };
        }

        const moveX = (dx / dist) * speed * deltaTime / cellSize;
        const moveY = (dy / dist) * speed * deltaTime / cellSize;

        return {
          ...enemy,
          position: {
            x: enemy.position.x + moveX,
            y: enemy.position.y + moveY,
          },
        };
      }),
    }));

    // Check for enemies that reached the base
    const reachedBase = get().enemies.filter(e => e.pathIndex >= path.length - 1);
    reachedBase.forEach(enemy => {
      get().damageBase(1);
      set(s => ({ enemies: s.enemies.filter(e => e.id !== enemy.id) }));
    });
  },

  slowEnemy: (enemyId, slowAmount, duration) => {
    set(s => ({
      enemies: s.enemies.map(e =>
        e.id === enemyId ? { ...e, slowedUntil: Date.now() + duration } : e
      ),
    }));
  },

  // Projectile actions
  fireProjectile: (tower, targetId) => {
    const towerDef = TOWERS[tower.type];
    const stats = tower.level === 0 
      ? towerDef.baseStats 
      : { ...towerDef.baseStats, ...towerDef.upgrades[tower.level - 1] };

    const projectile: Projectile = {
      id: generateId(),
      position: { ...tower.position },
      targetId,
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

    set(s => ({
      projectiles: [...s.projectiles, projectile],
      towers: s.towers.map(t =>
        t.id === tower.id ? { ...t, lastFireTime: Date.now() } : t
      ),
    }));
  },

  moveProjectiles: (deltaTime) => {
    const state = get();
    const cellSize = state.cellSize;
    const projectilesToRemove: string[] = [];

    set(s => ({
      projectiles: s.projectiles.map(proj => {
        const target = s.enemies.find(e => e.id === proj.targetId);
        if (!target) {
          projectilesToRemove.push(proj.id);
          return proj;
        }

        const dx = target.position.x - proj.position.x;
        const dy = target.position.y - proj.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const moveSpeed = proj.speed * deltaTime / cellSize;

        if (dist < moveSpeed + 0.3) {
          // Hit target
          projectilesToRemove.push(proj.id);
          
          if (proj.isSplash && proj.splashRadius) {
            // Splash damage
            const enemiesInRadius = state.getEnemiesInRange(
              target.position,
              proj.splashRadius / cellSize
            );
            enemiesInRadius.forEach(e => {
              get().damageEnemy(e.id, proj.damage);
            });
          } else {
            get().damageEnemy(target.id, proj.damage);
          }

          if (proj.isFreeze && proj.slowAmount && proj.slowDuration) {
            get().slowEnemy(target.id, proj.slowAmount, proj.slowDuration);
          }

          return proj;
        }

        return {
          ...proj,
          position: {
            x: proj.position.x + (dx / dist) * moveSpeed,
            y: proj.position.y + (dy / dist) * moveSpeed,
          },
        };
      }),
    }));

    // Remove hit projectiles
    set(s => ({
      projectiles: s.projectiles.filter(p => !projectilesToRemove.includes(p.id)),
    }));
  },

  removeProjectile: (projectileId) => {
    set(s => ({
      projectiles: s.projectiles.filter(p => p.id !== projectileId),
    }));
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
    });
    return true;
  },

  // Combo
  incrementCombo: () => set(s => ({ comboCount: s.comboCount + 1 })),
  resetCombo: () => set({ comboCount: 0 }),

  // Utility functions
  canPlaceTower: (position) => {
    const state = get();
    // Check if position is on path
    const isOnPath = state.path.some(
      p => Math.floor(p.x) === Math.floor(position.x) && Math.floor(p.y) === Math.floor(position.y)
    );
    if (isOnPath) return false;

    // Check if position already has tower
    const hasTower = state.towers.some(
      t => Math.floor(t.position.x) === Math.floor(position.x) && 
           Math.floor(t.position.y) === Math.floor(position.y)
    );
    if (hasTower) return false;

    // Check bounds
    if (position.x < 0 || position.x >= state.gridCols) return false;
    if (position.y < 0 || position.y >= state.gridRows) return false;

    return true;
  },

  getTowerAt: (position) => {
    return get().towers.find(
      t => Math.floor(t.position.x) === Math.floor(position.x) && 
           Math.floor(t.position.y) === Math.floor(position.y)
    );
  },

  getEnemiesInRange: (position, range) => {
    const state = get();
    return state.enemies.filter(enemy => {
      const dx = enemy.position.x - position.x;
      const dy = enemy.position.y - position.y;
      return Math.sqrt(dx * dx + dy * dy) <= range;
    });
  },

  getTowerCost: (type) => TOWERS[type].baseCost,

  getUpgradeCost: (tower) => {
    const towerDef = TOWERS[tower.type];
    if (tower.level >= towerDef.upgrades.length) return Infinity;
    return towerDef.upgrades[tower.level].cost;
  },

  getSellValue: (tower) => {
    const towerDef = TOWERS[tower.type];
    let totalCost = towerDef.baseCost;
    for (let i = 0; i < tower.level; i++) {
      totalCost += towerDef.upgrades[i].cost;
    }
    return Math.floor(totalCost * 0.6); // 60% return
  },

  getTowerColor: (tower) => {
    return SKIN_COLORS[tower.skin] || TOWERS[tower.type].color;
  },
}));
