// Tower targeting modes
export type TargetingMode = 'first' | 'last' | 'strongest' | 'closest';

export const TARGETING_MODES: { id: TargetingMode; label: string; description: string }[] = [
  { id: 'first', label: 'First', description: 'Target enemy closest to base' },
  { id: 'last', label: 'Last', description: 'Target most recently spawned enemy' },
  { id: 'strongest', label: 'Strong', description: 'Target enemy with most health' },
  { id: 'closest', label: 'Close', description: 'Target nearest enemy to tower' },
];

// Speed unlock prices (coins) - 1x is free
export type GameSpeed = 1 | 2 | 3 | 5 | 10;
export const SPEED_UNLOCK_PRICES: Record<GameSpeed, number> = {
  1: 0,      // Free
  2: 300,    // Unlock 2x speed
  3: 800,    // Unlock 3x speed
  5: 2000,   // Unlock 5x speed
  10: 5000,  // Unlock 10x speed
};

// Tower unlock prices (coins) - purchased in shop
export const TOWER_UNLOCK_PRICES = {
  machine_gun: 0,      // Free starter tower
  sniper: 2000,        // Long range
  splash: 3500,        // Area damage
  freeze: 3000,        // Slow enemies
  missile: 6000,       // High damage
  laser: 10000,        // Most expensive - progressive damage
};

// Tower definitions
export const TOWERS = {
  machine_gun: {
    id: 'machine_gun',
    name: 'Machine Gun',
    description: 'Fast fire rate, moderate damage',
    baseCost: 50,
    baseStats: {
      damage: 10,
      fireRate: 300,
      range: 3,
      projectileSpeed: 8,
    },
    unlockPrice: 0,
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
      range: 6,
      projectileSpeed: 12,
    },
    unlockPrice: 2000,
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
      range: 3.5,
      splashRadius: 1.5,
      projectileSpeed: 6,
    },
    unlockPrice: 3500,
    icon: 'bomb',
    color: '#FF6B35',
  },
  freeze: {
    id: 'freeze',
    name: 'Freeze',
    description: 'Slows enemies significantly',
    baseCost: 80,
    baseStats: {
      damage: 5,
      fireRate: 1000,
      range: 3,
      slowAmount: 0.5,
      slowDuration: 2000,
      projectileSpeed: 8,
    },
    unlockPrice: 3000,
    icon: 'snowflake',
    color: '#00D4FF',
  },
  missile: {
    id: 'missile',
    name: 'Missile',
    description: 'High damage explosive rounds',
    baseCost: 200,
    baseStats: {
      damage: 100,
      fireRate: 3000,
      range: 5,
      splashRadius: 1.2,
      projectileSpeed: 5,
    },
    unlockPrice: 6000,
    icon: 'rocket',
    color: '#DC143C',
  },
  laser: {
    id: 'laser',
    name: 'Laser',
    description: 'Continuous beam - damage increases while targeting same enemy',
    baseCost: 300,
    baseStats: {
      damage: 5,              // Starting damage per tick
      fireRate: 100,          // Very fast ticks (continuous)
      range: 4,
      damageRampUp: 0.5,      // +0.5 damage per tick on same target
      maxDamageMultiplier: 10, // Max 10x damage after sustained fire
      projectileSpeed: 0,     // Instant hit (laser beam)
    },
    unlockPrice: 10000,
    icon: 'flashlight',
    color: '#FF00FF',
  },
};

export type TowerType = keyof typeof TOWERS;

// Enemy definitions - VERY SLOW coin rewards for progression
export const ENEMIES = {
  basic: {
    id: 'basic',
    name: 'Basic',
    baseHealth: 30,
    baseSpeed: 0.8,
    coinReward: 1,      // Very slow
    color: '#E74C3C',
    size: 14,
  },
  fast: {
    id: 'fast',
    name: 'Fast',
    baseHealth: 20,
    baseSpeed: 1.5,
    coinReward: 1,      // Same as basic
    color: '#9B59B6',
    size: 12,
  },
  tank: {
    id: 'tank',
    name: 'Tank',
    baseHealth: 100,
    baseSpeed: 0.4,
    coinReward: 2,      // Slightly more
    color: '#2ECC71',
    size: 20,
  },
  boss: {
    id: 'boss',
    name: 'Boss',
    baseHealth: 500,
    baseSpeed: 0.25,
    coinReward: 15,     // Reduced from 25
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
  STARTING_COINS: 100,
  WAVE_DELAY: 3000,
  ENEMY_SPAWN_DELAY: 800,
  XP_PER_WAVE: 10,
  XP_PER_KILL: 1,
  BOSS_WAVE_INTERVAL: 10,
  TOWER_COST_INCREASE: 1.20,
  UPGRADE_COST_MULTIPLIER: 1.8,
  // Wave completion bonus: base + (wave * scaling)
  WAVE_BONUS_BASE: 10,      // Base bonus coins
  WAVE_BONUS_SCALING: 3,    // Additional coins per wave number
};

// Calculate wave completion bonus
export const getWaveCompletionBonus = (waveNumber: number): number => {
  return GAME_CONFIG.WAVE_BONUS_BASE + (waveNumber * GAME_CONFIG.WAVE_BONUS_SCALING);
  // Wave 1: 10 + 3 = 13 coins
  // Wave 5: 10 + 15 = 25 coins
  // Wave 10: 10 + 30 = 40 coins
  // Wave 20: 10 + 60 = 70 coins
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

// Calculate infinite upgrade stats for towers
export const getInfiniteUpgradeStats = (baseStats: any, level: number) => {
  if (level === 0) return baseStats;
  
  const multiplier = Math.pow(1.15, level); // 15% increase per level
  return {
    ...baseStats,
    damage: Math.floor(baseStats.damage * multiplier),
    range: baseStats.range + (level * 0.15),
    fireRate: Math.max(50, baseStats.fireRate - (level * 15)),
  };
};

// Calculate infinite upgrade cost (no max level)
export const getInfiniteUpgradeCost = (baseCost: number, currentLevel: number): number => {
  const baseUpgradeCost = Math.floor(baseCost * 0.6);
  return Math.floor(baseUpgradeCost * Math.pow(GAME_CONFIG.UPGRADE_COST_MULTIPLIER, currentLevel));
};

// Shop tower upgrade prices (permanent stat boosts)
export const getShopUpgradeCost = (towerType: TowerType, currentLevel: number): number => {
  const basePrices: Record<TowerType, number> = {
    machine_gun: 200,
    sniper: 300,
    splash: 350,
    freeze: 250,
    missile: 400,
    laser: 500,
  };
  return Math.floor(basePrices[towerType] * Math.pow(1.5, currentLevel));
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
