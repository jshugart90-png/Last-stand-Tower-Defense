// Tower targeting modes
export type TargetingMode = 'first' | 'last' | 'strongest' | 'closest';

export const TARGETING_MODES: { id: TargetingMode; label: string; description: string }[] = [
  { id: 'first', label: 'First', description: 'Target enemy closest to base' },
  { id: 'last', label: 'Last', description: 'Target most recently spawned enemy' },
  { id: 'strongest', label: 'Strong', description: 'Target enemy with most health' },
  { id: 'closest', label: 'Close', description: 'Target nearest enemy to tower' },
];

// Tower definitions
export const TOWERS = {
  machine_gun: {
    id: 'machine_gun',
    name: 'Machine Gun',
    description: 'Fast fire rate, moderate damage',
    baseCost: 50,
    baseStats: {
      damage: 10,
      fireRate: 300, // ms between shots
      range: 3, // in grid cells
      projectileSpeed: 8,
    },
    upgrades: [
      { damage: 15, fireRate: 250, range: 3.5, cost: 30 },
      { damage: 25, fireRate: 200, range: 4, cost: 50 },
      { damage: 40, fireRate: 150, range: 4.5, cost: 80 },
    ],
    unlockWave: 1, // Available from start
    icon: 'crosshairs',
    color: '#4A90D9',
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper',
    description: 'Very long range, high damage, slow fire rate',
    baseCost: 100,
    baseStats: {
      damage: 50,
      fireRate: 2000,
      range: 6, // in grid cells
      projectileSpeed: 12,
    },
    upgrades: [
      { damage: 80, fireRate: 1800, range: 7, cost: 60 },
      { damage: 120, fireRate: 1500, range: 8, cost: 100 },
      { damage: 200, fireRate: 1200, range: 10, cost: 150 },
    ],
    unlockWave: 3,
    icon: 'target',
    color: '#8B4513',
  },
  splash: {
    id: 'splash',
    name: 'Splash',
    description: 'Area damage against groups of enemies',
    baseCost: 120,
    baseStats: {
      damage: 25,
      fireRate: 1500,
      range: 3.5, // in grid cells
      splashRadius: 1.5,
      projectileSpeed: 6,
    },
    upgrades: [
      { damage: 40, splashRadius: 1.8, range: 4, cost: 70 },
      { damage: 60, splashRadius: 2, range: 4.5, cost: 110 },
      { damage: 90, splashRadius: 2.5, range: 5, cost: 160 },
    ],
    unlockWave: 5,
    icon: 'bomb',
    color: '#FF6B35',
  },
  freeze: {
    id: 'freeze',
    name: 'Freeze',
    description: 'Slows enemies',
    baseCost: 80,
    baseStats: {
      damage: 5,
      fireRate: 1000,
      range: 3, // in grid cells
      slowAmount: 0.5, // 50% slow
      slowDuration: 2000,
      projectileSpeed: 8,
    },
    upgrades: [
      { damage: 8, slowAmount: 0.6, slowDuration: 2500, range: 3.5, cost: 50 },
      { damage: 12, slowAmount: 0.7, slowDuration: 3000, range: 4, cost: 80 },
      { damage: 20, slowAmount: 0.8, slowDuration: 4000, range: 4.5, cost: 120 },
    ],
    unlockWave: 8,
    icon: 'snowflake',
    color: '#00D4FF',
  },
  missile: {
    id: 'missile',
    name: 'Missile',
    description: 'High damage but expensive',
    baseCost: 200,
    baseStats: {
      damage: 100,
      fireRate: 3000,
      range: 5, // in grid cells
      splashRadius: 1.2,
      projectileSpeed: 5,
    },
    upgrades: [
      { damage: 150, splashRadius: 1.5, range: 5.5, cost: 100 },
      { damage: 220, splashRadius: 1.8, range: 6, cost: 150 },
      { damage: 350, splashRadius: 2, range: 7, cost: 220 },
    ],
    unlockWave: 12,
    icon: 'rocket',
    color: '#DC143C',
  },
};

export type TowerType = keyof typeof TOWERS;

// Enemy definitions - COIN REWARDS REDUCED BY 75% (quarter of original)
export const ENEMIES = {
  basic: {
    id: 'basic',
    name: 'Basic',
    baseHealth: 30,
    baseSpeed: 0.8,
    coinReward: 1,
    color: '#E74C3C',
    size: 14,
  },
  fast: {
    id: 'fast',
    name: 'Fast',
    baseHealth: 20,
    baseSpeed: 1.5,
    coinReward: 2,
    color: '#9B59B6',
    size: 12,
  },
  tank: {
    id: 'tank',
    name: 'Tank',
    baseHealth: 100,
    baseSpeed: 0.4,
    coinReward: 4,
    color: '#2ECC71',
    size: 20,
  },
  boss: {
    id: 'boss',
    name: 'Boss',
    baseHealth: 500,
    baseSpeed: 0.25,
    coinReward: 25,
    color: '#F39C12',
    size: 28,
  },
};

export type EnemyType = keyof typeof ENEMIES;

// Game configuration
export const GAME_CONFIG = {
  GRID_COLS: 10,
  GRID_ROWS: 14,
  CELL_SIZE: 32,
  BASE_HEALTH: 20,
  STARTING_COINS: 150,
  WAVE_DELAY: 3000, // 3 seconds between waves (auto-start timer)
  ENEMY_SPAWN_DELAY: 800, // ms between enemy spawns
  COMBO_WINDOW: 2000, // ms for combo kills
  COMBO_BONUS_MULTIPLIER: 0.15,
  XP_PER_WAVE: 10,
  XP_PER_KILL: 1,
  BOSS_WAVE_INTERVAL: 10, // Boss every 10 waves
  TOWER_COST_INCREASE: 1.15, // 15% cost increase per tower of same type
  UPGRADE_COST_MULTIPLIER: 1.5, // Infinite upgrade cost multiplier
};

// Expanded arena configuration
export const EXPANDED_GAME_CONFIG = {
  GRID_COLS: 12,
  GRID_ROWS: 18,
  CELL_SIZE: 28,
};

// Wave configuration - Boss every 10 waves
export const getWaveConfig = (waveNumber: number) => {
  const baseEnemies = 5 + Math.floor(waveNumber * 1.5);
  const healthMultiplier = 1 + (waveNumber - 1) * 0.15;
  const speedMultiplier = 1 + (waveNumber - 1) * 0.05;
  
  let enemies: { type: EnemyType; count: number }[] = [];
  
  if (waveNumber <= 3) {
    enemies = [{ type: 'basic', count: baseEnemies }];
  } else if (waveNumber <= 6) {
    enemies = [
      { type: 'basic', count: Math.floor(baseEnemies * 0.7) },
      { type: 'fast', count: Math.floor(baseEnemies * 0.3) },
    ];
  } else if (waveNumber <= 10) {
    enemies = [
      { type: 'basic', count: Math.floor(baseEnemies * 0.5) },
      { type: 'fast', count: Math.floor(baseEnemies * 0.3) },
      { type: 'tank', count: Math.floor(baseEnemies * 0.2) },
    ];
  } else {
    enemies = [
      { type: 'basic', count: Math.floor(baseEnemies * 0.4) },
      { type: 'fast', count: Math.floor(baseEnemies * 0.25) },
      { type: 'tank', count: Math.floor(baseEnemies * 0.25) },
    ];
  }
  
  // Boss every 10 waves
  if (waveNumber > 0 && waveNumber % GAME_CONFIG.BOSS_WAVE_INTERVAL === 0) {
    enemies.push({ type: 'boss', count: 1 });
  }
  
  return {
    waveNumber,
    enemies,
    healthMultiplier,
    speedMultiplier,
  };
};

// Spawn point and base positions (fixed)
export const SPAWN_POINT = { x: 0, y: 0 };
export const BASE_POSITION = { x: 9, y: 13 };

// Get towers unlocked by wave
export const getTowersUnlockedByWave = (wave: number): TowerType[] => {
  return (Object.keys(TOWERS) as TowerType[]).filter(
    type => TOWERS[type].unlockWave <= wave
  );
};

// Calculate infinite upgrade stats
export const getInfiniteUpgradeStats = (baseStats: any, level: number) => {
  if (level === 0) return baseStats;
  
  const multiplier = Math.pow(1.2, level); // 20% increase per level
  return {
    ...baseStats,
    damage: Math.floor(baseStats.damage * multiplier),
    range: baseStats.range + (level * 0.2),
    fireRate: Math.max(100, baseStats.fireRate - (level * 20)),
  };
};

// Calculate infinite upgrade cost
export const getInfiniteUpgradeCost = (baseCost: number, currentLevel: number): number => {
  // Base upgrade cost starts at 50% of tower cost, increases by 50% each level
  const baseUpgradeCost = Math.floor(baseCost * 0.5);
  return Math.floor(baseUpgradeCost * Math.pow(GAME_CONFIG.UPGRADE_COST_MULTIPLIER, currentLevel));
};

// Skin colors
export const SKIN_COLORS: Record<string, string> = {
  default: '#4A90D9',
  neon: '#00FF88',
  military: '#4A5D23',
  ice: '#00D4FF',
  gold: '#FFD700',
  cyber: '#FF00FF',
};
