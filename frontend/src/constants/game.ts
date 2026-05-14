import { TacticalTheme } from '../theme/colors';

// Tower targeting modes
export type TargetingMode = 'first' | 'last' | 'strongest' | 'closest';

export const TARGETING_MODES: { id: TargetingMode; label: string; description: string }[] = [
  { id: 'first', label: 'First', description: 'Target enemy closest to base' },
  { id: 'last', label: 'Last', description: 'Target most recently spawned enemy' },
  { id: 'strongest', label: 'Strong', description: 'Target enemy with most health' },
  { id: 'closest', label: 'Close', description: 'Target nearest enemy to tower' },
];

// Speed unlock prices (gems) — 1x is free; max simulation speed is 5x (no 10x).
export type GameSpeed = 1 | 2 | 3 | 5;

export const MAX_GAME_SPEED: GameSpeed = 5;

export const ALLOWED_GAME_SPEEDS: readonly GameSpeed[] = [1, 2, 3, 5];

export function isGameSpeed(n: number): n is GameSpeed {
  return (ALLOWED_GAME_SPEEDS as readonly number[]).includes(n);
}

/** Map legacy saves / bad values onto allowed speeds (10 → 5). */
export function clampGameSpeed(n: number): GameSpeed {
  if (isGameSpeed(n)) return n;
  if (n === 10 || n > 5) return 5;
  if (n < 1) return 1;
  const list: GameSpeed[] = [1, 2, 3, 5];
  return list.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
}

export function normalizeUnlockedSpeeds(input: unknown): GameSpeed[] {
  const out = new Set<GameSpeed>([1]);
  if (!Array.isArray(input)) return [1];
  for (const raw of input) {
    const n = Number(raw);
    if (n === 10) {
      out.add(5);
      continue;
    }
    if (isGameSpeed(n)) out.add(n);
  }
  return Array.from(out).sort((a, b) => a - b);
}

export const SPEED_UNLOCK_PRICES: Record<GameSpeed, number> = {
  1: 0,      // Free
  2: 30,     // 30 gems for 2x speed
  3: 80,     // 80 gems for 3x speed
  5: 150,    // 150 gems for 5x speed
};

// Tower unlock prices (gems) - purchased in shop
export const TOWER_UNLOCK_PRICES = {
  machine_gun: 0,      // Free starter tower
  sniper: 50,          // 50 gems
  splash: 75,          // 75 gems
  freeze: 60,          // 60 gems
  missile: 100,        // 100 gems
  laser: 200,          // 200 gems
};

// Tower definitions
export const TOWERS = {
  machine_gun: {
    id: 'machine_gun',
    name: 'Machine Gun',
    description: 'Fast fire rate, moderate damage',
    baseCost: 32,
    baseStats: {
      damage: 10,
      fireRate: 300,
      range: 3,
      projectileSpeed: 8,
    },
    unlockPrice: 0,
    icon: 'crosshairs',
    color: TacticalTheme.towerMachineGun,
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper',
    description: 'Very long range, high damage, slow fire rate',
    baseCost: 65,
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
    baseCost: 78,
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
    baseCost: 52,
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
    baseCost: 130,
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
    baseCost: 195,
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

// Enemy definitions — base coinReward; in-run income uses getRunCoinIncomeMultiplier (shop)
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
  shielded: {
    id: 'shielded',
    name: 'Shielded',
    baseHealth: 180,
    baseSpeed: 0.6,
    coinReward: 3,
    color: '#3498DB',
    size: 18,
    damageReduction: 0.35,
  },
  healer: {
    id: 'healer',
    name: 'Healer',
    baseHealth: 90,
    baseSpeed: 0.75,
    coinReward: 4,
    color: '#1ABC9C',
    size: 16,
    healPerSecond: 8,
    auraRange: 1.8,
  },
  splitter: {
    id: 'splitter',
    name: 'Splitter',
    baseHealth: 140,
    baseSpeed: 0.7,
    coinReward: 3,
    color: '#9B59B6',
    size: 18,
    splitOnDeath: true,
    splitCount: 2,
    splitInto: 'fast',
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
  XP_PER_WAVE: 2,
  XP_PER_KILL: 0.06,
  BOSS_WAVE_INTERVAL: 10,
  /** Softer curve so 2nd/3rd tower stays affordable early */
  TOWER_COST_INCREASE: 1.14,
  /** Extra in-game $ on tower prices per permanent shop upgrade level (same base curve) */
  SHOP_LEVEL_COST_MULT: 0.10,
  UPGRADE_COST_MULTIPLIER: 1.8,
  // Wave completion bonus: base + (wave * scaling)
  WAVE_BONUS_BASE: 12,
  WAVE_BONUS_SCALING: 4,
};

/** Global rebalance: +25% in-run coin from kills and wave bonus (before shop “coin income” upgrade) */
export const RUN_KILL_COIN_BASE_MULT = 1.25;

/** Tighter gem economy: pay out ~35% of legacy run gem rates (~65% reduction) */
export const GEM_ECONOMY_MULT = 0.35;

export const COMBO_BONUS_GEMS_LEGACY = 20;
export const COMBO_BONUS_GEMS = Math.max(1, Math.floor(COMBO_BONUS_GEMS_LEGACY * GEM_ECONOMY_MULT));

export function rawPerformanceGems(wave: number, kills: number): number {
  return Math.max(0, Math.floor(wave * 0.75) + Math.floor(kills / 20));
}

export function scaledTotalPerformanceGems(wave: number, kills: number): number {
  return Math.max(0, Math.floor(GEM_ECONOMY_MULT * rawPerformanceGems(wave, kills)));
}

/** Cumulative wave-linear share of scaled performance after finishing wave `wave`. */
export function targetWavePerformanceGems(wave: number): number {
  return Math.max(0, Math.floor(GEM_ECONOMY_MULT * Math.floor(0.75 * wave)));
}

export function endGamePerformanceRemainder(
  wave: number,
  kills: number,
  runGemsFromWavePart: number
): number {
  const total = scaledTotalPerformanceGems(wave, kills);
  return Math.max(0, total - runGemsFromWavePart);
}

/** Shop upgrade: +4% coin income per level (kills + wave completion), multiplies with base */
export const COIN_INCOME_PER_LEVEL = 0.04;
export const COIN_INCOME_UPGRADE_MAX = 12;

export function getRunCoinIncomeMultiplier(coinIncomeUpgradeLevel: number): number {
  const lv = Math.min(
    Math.max(0, Math.floor(coinIncomeUpgradeLevel)),
    COIN_INCOME_UPGRADE_MAX
  );
  return RUN_KILL_COIN_BASE_MULT * (1 + COIN_INCOME_PER_LEVEL * lv);
}

export function getCoinIncomeUpgradePrice(currentLevel: number): number {
  return Math.floor(32 * Math.pow(1.36, currentLevel));
}

// Calculate wave completion bonus (before run coin multiplier from shop)
export const getWaveCompletionBonus = (waveNumber: number): number => {
  return GAME_CONFIG.WAVE_BONUS_BASE + (waveNumber * GAME_CONFIG.WAVE_BONUS_SCALING);
};

export const STARTING_COINS_UPGRADE_MAX = 20;
export const STARTING_COINS_BONUS_PER_LEVEL = 40;
export const getStartingCoinsUpgradePrice = (currentLevel: number): number =>
  Math.floor(40 * Math.pow(1.4, currentLevel));

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
      { type: 'basic', count: Math.floor(baseEnemies * 0.3) },
      { type: 'fast', count: Math.floor(baseEnemies * 0.2) },
      { type: 'tank', count: Math.floor(baseEnemies * 0.2) },
    ];
    if (waveNumber >= 12) enemies.push({ type: 'shielded', count: Math.max(1, Math.floor(baseEnemies * 0.15)) });
    if (waveNumber >= 16) enemies.push({ type: 'healer', count: Math.max(1, Math.floor(baseEnemies * 0.1)) });
    if (waveNumber >= 14) enemies.push({ type: 'splitter', count: Math.max(1, Math.floor(baseEnemies * 0.12)) });
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

/** Total enemies scheduled to spawn this wave (matches one spawn queue entry per unit). */
export const getWavePlannedEnemyCount = (waveNumber: number): number => {
  const cfg = getWaveConfig(waveNumber);
  return cfg.enemies.reduce((sum, g) => sum + g.count, 0);
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

// Shop tower upgrade prices in GEMS (permanent stat boosts)
export const getShopUpgradeCost = (towerType: TowerType, currentLevel: number): number => {
  const basePrices: Record<TowerType, number> = {
    machine_gun: 15,
    sniper: 25,
    splash: 30,
    freeze: 20,
    missile: 35,
    laser: 50,
  };
  return Math.floor(basePrices[towerType] * Math.pow(1.5, currentLevel));
};

// Skin colors (equipped per tower type via player store)
export const SKIN_COLORS: Record<string, string> = {
  default: TacticalTheme.towerMachineGun,
  neon: '#00FF88',
  military: '#5D6D3A',
  ice: TacticalTheme.freezeTint,
  gold: '#FFD700',
  cyber: '#FF00FF',
  crimson: '#E74C3C',
  sunset: '#FF8C42',
  void: '#7B68EE',
};

/** Unlockable cosmetics (gems). `default` is free. */
export const COSMETIC_SKINS: { id: keyof typeof SKIN_COLORS; name: string; price: number }[] = [
  { id: 'default', name: 'Classic Slate', price: 0 },
  { id: 'neon', name: 'Neon Strike', price: 45 },
  { id: 'military', name: 'OD Green', price: 35 },
  { id: 'ice', name: 'Frost', price: 40 },
  { id: 'gold', name: 'Champion Gold', price: 120 },
  { id: 'cyber', name: 'Cyber Magenta', price: 90 },
  { id: 'crimson', name: 'Crimson', price: 55 },
  { id: 'sunset', name: 'Sunset', price: 50 },
  { id: 'void', name: 'Void Purple', price: 75 },
];
