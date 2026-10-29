import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TowerType,
  GameSpeed,
  TOWER_UNLOCK_PRICES,
  SPEED_UNLOCK_PRICES,
  normalizeUnlockedSpeeds,
  isGameSpeed,
  getShopUpgradeCost,
  TargetingMode,
  TOWERS,
  STARTING_COINS_UPGRADE_MAX,
  getStartingCoinsUpgradePrice,
  getCoinIncomeUpgradePrice,
  COIN_INCOME_UPGRADE_MAX,
  COMBO_BONUS_GEMS,
  FORTIFY_UPGRADE_MAX,
  getFortifyUpgradePrice,
  CALIBRATION_UPGRADE_MAX,
  getCalibrationUpgradePrice,
} from '../constants/game';
import {
  Achievement,
  createDefaultAchievements,
  createDefaultDailyMissions,
  createDefaultWeeklyMissions,
  DailyMission,
  WeeklyMission,
} from '../constants/progression';
import type { DifficultyMode } from '../logic/difficulty';
import type { TowerPath } from '../logic/combat';
import {
  mergeAchievementLists as mergeAchievementListsPure,
  mergeNumericRecord,
  migrateAudioPrefs,
  migrateFieldBriefing,
  unionTowerUnlocks,
} from '../logic/save';
import {
  getLocalDayKey,
  getLocalWeekAnchorDayKey,
} from '../utils/missionReset';
import { DEFAULT_MAP_ID, mergeWaveProgressUnlocks } from '../constants/maps';
import {
  SESSION_SLAUGHTER_WIN_KILLS,
  SESSION_BOUNTY_TRIUMPHS_NEEDED,
} from '../constants/sessionProgress';
import { DEFAULT_PLAYER_LOGO_ID } from '../constants/logos';
import {
  applyArenaProduct,
  arenaTierProductId,
  changeArenaSizeDuringSavedRun,
  clampSelectedArenaSize,
  ownedAfterRestore,
  ownedArenaTier,
  selectedAfterUnlock,
  type ArenaTier,
} from '../logic/arenaSize';

// Arena expansion is REAL MONEY - $2.99 per expansion
export const ARENA_EXPANSION_PRICE_USD = 2.99;

// Product ID for in-app purchases
export const IAP_PRODUCT_IDS = {
  ARENA_EXPANSION: 'com.laststanddefense.arena_expansion',
  PREMIUM_BUNDLE: 'com.laststanddefense.premium_bundle',
  GEMS_100: 'com.laststanddefense.gems_100',
  GEMS_500: 'com.laststanddefense.gems_500',
  GEMS_1500: 'com.laststanddefense.gems_1500',
  GEMS_4000: 'com.laststanddefense.gems_4000',
};

// Saved tower state for game resume
export interface SavedTower {
  id: string;
  type: TowerType;
  position: { x: number; y: number };
  level: number;
  skin: string;
  targetingMode: TargetingMode;
  totalCostSpent: number;
  /** In-run specialization chosen at upgrade level 3. Missing on older saves. */
  path?: TowerPath;
}

// Full saved game state
export interface SavedGameState {
  // Wave/progress
  currentWave: number;
  waveInProgress: boolean;
  
  // Resources (in-game coins only - not persistent)
  coins: number;
  baseHealth: number;
  score: number;
  enemiesKilled: number;
  towersPlaced: number;
  
  // Placed towers
  towers: SavedTower[];
  
  // Tower purchase counts (for cost calculation)
  towerPurchaseCount: Record<TowerType, number>;
  
  // Grid config
  gridCols: number;
  gridRows: number;
  arenaExpansions: number;
  
  // Timestamp
  savedAt: number;

  /** Arena id for next run (see `src/constants/arenaMaps.ts`). */
  mapId?: string;
}

interface PlayerState {
  // Player identity
  playerId: string | null;
  deviceId: string;
  nickname: string;
  /** False until user submits name or synced profile loads */
  hasEnteredNameOnce: boolean;
  
  // Progression
  xp: number;
  level: number;
  gems: number;  // Persistent currency (earned from gameplay, IAP)
  
  // Stats
  totalWavesSurvived: number;
  gamesPlayed: number;
  bestWave: number;
  lifetimeEnemiesKilled: number;
  lifetimeFlyingKills: number;
  lifetimeArmoredKills: number;
  lifetimeBossKills: number;
  lifetimeTowersPlaced: number;
  /** Gems earned in the last completed run (run summary / UI). */
  lastRunGemsEarned: number;
  lastRunEnemiesKilled: number;
  
  // Tower unlocks (purchased in shop with gems)
  unlockedTowers: TowerType[];
  
  // Tower upgrades (purchased in shop with gems - permanent stat boosts)
  towerUpgradeLevels: Record<TowerType, number>;

  /** Permanent: bonus starting in-game coins each run (shop upgrade) */
  startingCoinUpgradeLevel: number;

  /** Permanent: +4%/level in-run coin from kills & wave bonus (gems shop) */
  coinIncomeUpgradeLevel: number;

  /** Permanent: +2 base HP per level. */
  fortifyUpgradeLevel: number;

  /** Permanent: +2% tower damage per level. */
  calibrationUpgradeLevel: number;

  /** Run ruleset. Older saves default to normal. */
  difficultyMode: DifficultyMode;
  
  // Speed unlocks (purchased in shop with gems)
  unlockedSpeeds: GameSpeed[];
  
  // Skins
  unlockedSkins: string[];
  equippedSkins: Record<string, string>;
  
  // Purchases
  premium: boolean;
  /** Highest arena size owned. Legacy saves stored this as the only size. */
  arenaExpansions: number;
  /** Free Play size actually used. Always 0..arenaExpansions. */
  selectedArenaSize: number;
  /** Store transaction ids already granted, so a retried consumable cannot stack. */
  processedIapTransactionIds: string[];
  
  // Settings
  soundEnabled: boolean;
  /** 1 after the one-time unmute migration. Missing on older saves. */
  audioPrefsRevision: number;
  /** 0–1; combined with soundEnabled in audio service */
  sfxVolume: number;
  musicEnabled: boolean;
  /** 0–1; for background music when implemented */
  musicVolume: number;
  hapticEnabled: boolean;
  performanceMode: boolean;
  vfxQuality: 0 | 1 | 2; // 0 low, 1 medium, 2 high
  autoStartWaves: boolean;
  
  // Tutorial
  tutorialCompleted: boolean;
  /** In-game three-step briefing. Veterans who finished the old cards skip it. */
  fieldBriefingSeen: boolean;

  // Progression systems
  dailyMissions: DailyMission[];
  /** Last calendar day (local `YYYY-MM-DD`) daily missions were refreshed for. */
  lastDailyMissionDayKey: string;
  lastDailyResetAt: number;
  weeklyMissions: WeeklyMission[];
  /** Monday anchor week id (local) when weekly missions last reset. */
  lastWeeklyMissionWeekKey: string;
  lastWeeklyResetAt: number;
  achievements: Achievement[];
  loginStreak: number;
  lastDailyBonusClaimAt: number | null;
  /** Cumulative enemies defeated this app session (all runs). */
  sessionEnemiesKilledTotal: number;
  /** Runs this session where enemies killed in that run ≥ SESSION_SLAUGHTER_WIN_KILLS. */
  sessionSlaughterTriumphs: number;
  dailyChallengeRunCombo: number;
  lastDailyChallengeRunAt: number | null;
  
  // SAVED GAME STATE - for resume functionality
  savedGame: SavedGameState | null;

  /** Next-run arena selection (persisted). */
  currentMapId: string;
  unlockedMapIds: string[];
  mapBestWaves: Record<string, number>;
  unlockedLogos: string[];
  selectedLogoId: string;
}

interface PlayerActions {
  // Identity
  setPlayer: (playerId: string, nickname: string) => void;
  setDeviceId: (deviceId: string) => void;
  setNickname: (nickname: string) => void;
  
  // Progression
  addXp: (amount: number) => void;
  setLevel: (level: number) => void;
  /** Mark the account ad-free/premium (Premium Bundle IAP or server sync). */
  setPremium: (premium: boolean) => void;
  setGems: (gems: number) => void;
  addGems: (amount: number) => void;
  
  // Stats
  registerRunStarted: () => void;
  recordGame: (
    wavesReached: number,
    enemiesKilled?: number,
    towersPlaced?: number,
    gemsEarnedThisRun?: number,
    extras?: {
      flying?: number;
      armored?: number;
      bosses?: number;
      difficulty?: DifficultyMode;
    }
  ) => void;
  setBestWave: (wave: number) => void;
  refreshDailyMissions: () => void;
  refreshWeeklyMissions: () => void;
  /** Award daily mission gems once; idempotent if already claimed or not complete. */
  claimDailyMission: (id: string) => void;
  canClaimDailyBonus: () => boolean;
  claimDailyBonus: () => { reward: number; streak: number; milestoneBonus: number };
  /** Call after each completed run with that run's kill count. */
  recordSessionRunStats: (enemiesKilledThisRun: number) => void;
  canClaimSessionQuest: () => boolean;
  claimSessionQuest: () => number;
  recordDailyChallengeRun: () => { combo: number; bonusGems: number };
  
  // Tower unlocks (gems)
  purchaseTower: (tower: TowerType) => boolean;
  isTowerUnlocked: (tower: TowerType) => boolean;
  getTowerUnlockPrice: (tower: TowerType) => number;
  
  // Tower upgrades (shop, gems)
  purchaseTowerUpgrade: (tower: TowerType) => boolean;
  getTowerUpgradeLevel: (tower: TowerType) => number;
  getTowerUpgradePrice: (tower: TowerType) => number;

  purchaseStartingCoinsUpgrade: () => boolean;
  purchaseCoinIncomeUpgrade: () => boolean;
  purchaseFortifyUpgrade: () => boolean;
  purchaseCalibrationUpgrade: () => boolean;
  setDifficultyMode: (mode: DifficultyMode) => void;
  completeFieldBriefing: () => void;

  // Speed unlocks (gems)
  purchaseSpeed: (speed: GameSpeed) => boolean;
  isSpeedUnlocked: (speed: GameSpeed) => boolean;
  getSpeedUnlockPrice: (speed: GameSpeed) => number;
  
  // Skins (gems)
  unlockSkin: (skinId: string) => void;
  purchaseCosmeticSkin: (skinId: string, price: number) => boolean;
  setUnlockedSkins: (skins: string[]) => void;
  equipSkin: (towerType: string, skinId: string) => void;
  equipSkinGlobally: (skinId: string) => void;
  
  // Arena expansion (real money)
  addArenaExpansion: () => void;
  unlockArenaTier: (tier: ArenaTier) => void;
  setSelectedArenaSize: (size: number) => void;
  restoreArenaProducts: (productIds: string[]) => number;
  hasProcessedIapTransaction: (transactionId: string) => boolean;
  rememberIapTransaction: (transactionId: string) => void;

  setCurrentMapId: (mapId: string) => void;
  isMapUnlocked: (mapId: string) => boolean;
  unlockMapWithGems: (mapId: string, cost: number) => boolean;
  unlockMapByProgress: (mapId: string) => void;
  syncMapUnlocksFromWaveProgress: () => void;
  recordMapBestWave: (mapId: string, wave: number) => void;
  getMapBestWave: (mapId: string) => number;
  purchaseLogo: (logoId: string, price: number) => boolean;
  equipLogo: (logoId: string) => void;
  isLogoUnlocked: (logoId: string) => boolean;
  
  // Settings
  toggleSound: () => void;
  toggleMusic: () => void;
  toggleHaptic: () => void;
  togglePerformanceMode: () => void;
  setVfxQuality: (quality: 0 | 1 | 2) => void;
  toggleAutoStartWaves: () => void;
  setSfxVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  
  // Tutorial
  completeTutorial: () => void;
  
  // SAVED GAME FUNCTIONS
  saveGame: (gameState: SavedGameState) => void;
  clearSavedGame: () => void;
  hasSavedGame: () => boolean;
  getSavedGame: () => SavedGameState | null;
  clearCurrentGameProgress: () => void;
  
  // Sync from server
  syncFromServer: (data: Partial<PlayerState>) => void;
  
  // Reset
  resetPlayer: () => void;
}

/** 2.3: gems granted per level-up so leveling is a visible payout. */
const LEVEL_UP_GEM_REWARD = 15;

// Slower progression curve (noticeably slower than fixed 100 XP levels)
const XP_LEVEL_BASE = 180;
const XP_LEVEL_STEP = 22;

export const getXpForNextLevel = (currentLevel: number): number =>
  XP_LEVEL_BASE + Math.max(0, currentLevel - 1) * XP_LEVEL_STEP;

const getTotalXpToReachLevel = (level: number): number => {
  const target = Math.max(1, Math.floor(level));
  if (target <= 1) return 0;
  let total = 0;
  for (let lv = 1; lv < target; lv++) total += getXpForNextLevel(lv);
  return total;
};

export const getLevelFromXp = (xp: number): number => {
  const clamped = Math.max(0, Math.floor(xp));
  let level = 1;
  let required = getXpForNextLevel(level);
  let remaining = clamped;
  while (remaining >= required) {
    remaining -= required;
    level += 1;
    required = getXpForNextLevel(level);
  }
  return level;
};

export const getXpProgress = (xp: number) => {
  const totalXp = Math.max(0, Math.floor(xp));
  const level = getLevelFromXp(totalXp);
  const levelStartXp = getTotalXpToReachLevel(level);
  const xpIntoLevel = totalXp - levelStartXp;
  const xpNeeded = getXpForNextLevel(level);
  return { level, xpIntoLevel, xpNeeded };
};

const initialState: PlayerState = {
  playerId: null,
  deviceId: '',
  nickname: 'Player',
  hasEnteredNameOnce: false,
  xp: 0,
  level: 1,
  gems: 0,  // Start with 0 gems - earn through gameplay
  totalWavesSurvived: 0,
  gamesPlayed: 0,
  bestWave: 0,
  lifetimeEnemiesKilled: 0,
  lifetimeFlyingKills: 0,
  lifetimeArmoredKills: 0,
  lifetimeBossKills: 0,
  lifetimeTowersPlaced: 0,
  lastRunGemsEarned: 0,
  lastRunEnemiesKilled: 0,
  unlockedTowers: ['machine_gun'],
  towerUpgradeLevels: mergeNumericRecord(undefined),
  startingCoinUpgradeLevel: 0,
  coinIncomeUpgradeLevel: 0,
  fortifyUpgradeLevel: 0,
  calibrationUpgradeLevel: 0,
  difficultyMode: 'normal',
  unlockedSpeeds: [1],  // 1x is free
  unlockedSkins: ['default'],
  equippedSkins: {},
  premium: false,
  arenaExpansions: 0,
  selectedArenaSize: 0,
  processedIapTransactionIds: [],
  soundEnabled: true,
  audioPrefsRevision: 1,
  sfxVolume: 0.9,
  musicEnabled: true,
  musicVolume: 0.65,
  hapticEnabled: true,
  performanceMode: false,
  vfxQuality: 2,
  autoStartWaves: false,
  tutorialCompleted: false,
  fieldBriefingSeen: false,
  dailyMissions: createDefaultDailyMissions(),
  lastDailyMissionDayKey: getLocalDayKey(Date.now()),
  lastDailyResetAt: Date.now(),
  weeklyMissions: createDefaultWeeklyMissions(),
  lastWeeklyMissionWeekKey: getLocalWeekAnchorDayKey(Date.now()),
  lastWeeklyResetAt: Date.now(),
  achievements: createDefaultAchievements(),
  loginStreak: 0,
  lastDailyBonusClaimAt: null,
  sessionEnemiesKilledTotal: 0,
  sessionSlaughterTriumphs: 0,
  dailyChallengeRunCombo: 0,
  lastDailyChallengeRunAt: null,
  savedGame: null,
  currentMapId: DEFAULT_MAP_ID,
  unlockedMapIds: [DEFAULT_MAP_ID],
  mapBestWaves: {},
  unlockedLogos: ['shadow_operative', 'tower_sentinel', 'drone_commander', 'fortification_expert', 'wave_breaker'],
  selectedLogoId: DEFAULT_PLAYER_LOGO_ID,
};

const playerPersistKeys = [
  'playerId',
  'deviceId',
  'nickname',
  'hasEnteredNameOnce',
  'xp',
  'level',
  'gems',
  'totalWavesSurvived',
  'gamesPlayed',
  'bestWave',
  'lifetimeEnemiesKilled',
  'lifetimeFlyingKills',
  'lifetimeArmoredKills',
  'lifetimeBossKills',
  'lifetimeTowersPlaced',
  'lastRunGemsEarned',
  'lastRunEnemiesKilled',
  'unlockedTowers',
  'towerUpgradeLevels',
  'startingCoinUpgradeLevel',
  'coinIncomeUpgradeLevel',
  'fortifyUpgradeLevel',
  'calibrationUpgradeLevel',
  'difficultyMode',
  'unlockedSpeeds',
  'unlockedSkins',
  'equippedSkins',
  'premium',
  'arenaExpansions',
  'selectedArenaSize',
  'processedIapTransactionIds',
  'soundEnabled',
  'audioPrefsRevision',
  'sfxVolume',
  'musicEnabled',
  'musicVolume',
  'hapticEnabled',
  'performanceMode',
  'vfxQuality',
  'autoStartWaves',
  'tutorialCompleted',
  'fieldBriefingSeen',
  'dailyMissions',
  'lastDailyMissionDayKey',
  'lastDailyResetAt',
  'weeklyMissions',
  'lastWeeklyMissionWeekKey',
  'lastWeeklyResetAt',
  'achievements',
  'loginStreak',
  'lastDailyBonusClaimAt',
  'sessionEnemiesKilledTotal',
  'sessionSlaughterTriumphs',
  'dailyChallengeRunCombo',
  'lastDailyChallengeRunAt',
  'savedGame',
  'currentMapId',
  'unlockedMapIds',
  'mapBestWaves',
  'unlockedLogos',
  'selectedLogoId',
] as const;

/** True when a resume save exists for an in-progress run (defer daily mission day rollover). */
const hasActiveSavedRun = (state: PlayerState): boolean => {
  const sg = state.savedGame;
  if (!sg) return false;
  return sg.currentWave > 0 || sg.waveInProgress === true;
};

/** Merge persisted daily missions with the current template; migrate saves before `claimed` existed. */
const mergeDailyMissionListForLoad = (
  stored: Array<Omit<DailyMission, 'claimed'> & { claimed?: boolean }> | undefined
): DailyMission[] => {
  const defaults = createDefaultDailyMissions();
  if (!stored?.length) return defaults;
  const map = new Map(stored.map((m) => [m.id, m]));
  return defaults.map((d) => {
    const s = map.get(d.id);
    if (!s) return { ...d };
    const progress = Math.min(d.target, Math.max(0, Math.floor(s.progress)));
    const completed = progress >= d.target;
    const hadClaimField = typeof s.claimed === 'boolean';
    const claimed: boolean = hadClaimField ? Boolean(s.claimed) : completed;
    return {
      ...d,
      progress,
      completed,
      claimed,
    };
  });
};

const maybeResetDailyMissions = (state: PlayerState): Partial<PlayerState> => {
  const today = getLocalDayKey(Date.now());
  const last =
    state.lastDailyMissionDayKey ??
    (typeof state.lastDailyResetAt === 'number'
      ? getLocalDayKey(state.lastDailyResetAt)
      : today);
  if (last === today) {
    if (!state.lastDailyMissionDayKey) {
      return { lastDailyMissionDayKey: today };
    }
    return {};
  }
  if (hasActiveSavedRun(state)) {
    return {};
  }
  return {
    dailyMissions: createDefaultDailyMissions(),
    lastDailyMissionDayKey: today,
    lastDailyResetAt: Date.now(),
  };
};

const maybeResetWeeklyMissions = (state: PlayerState): Partial<PlayerState> => {
  const anchor = getLocalWeekAnchorDayKey(Date.now());
  const last =
    state.lastWeeklyMissionWeekKey ??
    (typeof state.lastWeeklyResetAt === 'number'
      ? getLocalWeekAnchorDayKey(state.lastWeeklyResetAt)
      : anchor);
  if (last === anchor) {
    if (!state.lastWeeklyMissionWeekKey) {
      return { lastWeeklyMissionWeekKey: anchor };
    }
    return {};
  }
  return {
    weeklyMissions: createDefaultWeeklyMissions(),
    lastWeeklyMissionWeekKey: anchor,
    lastWeeklyResetAt: Date.now(),
  };
};

/** Daily mission progress only — gem rewards are granted via `claimDailyMission`. */
const applyMissionProgress = (
  missions: DailyMission[],
  id: DailyMission['id'],
  amount: number
): DailyMission[] => {
  if (amount <= 0) return missions;
  return missions.map((mission) => {
    if (mission.id !== id || mission.completed) return mission;
    const progress = Math.min(mission.target, mission.progress + amount);
    const completed = progress >= mission.target;
    return { ...mission, progress, completed, claimed: mission.claimed };
  });
};

const applyWeeklyMissionProgress = (
  missions: WeeklyMission[],
  id: WeeklyMission['id'],
  amount: number
): { missions: WeeklyMission[]; gemsEarned: number } => {
  if (amount <= 0) return { missions, gemsEarned: 0 };
  let gemsEarned = 0;
  const next = missions.map((mission) => {
    if (mission.id !== id || mission.completed) return mission;
    const progress = Math.min(mission.target, mission.progress + amount);
    const completed = progress >= mission.target;
    if (completed && !mission.completed) gemsEarned += mission.rewardGems;
    return { ...mission, progress, completed };
  });
  return { missions: next, gemsEarned };
};

const mergeAchievementLists = (stored: Achievement[] | undefined): Achievement[] =>
  mergeAchievementListsPure(createDefaultAchievements(), stored);

const unlockAchievement = (
  achievements: Achievement[],
  id: string
): { achievements: Achievement[]; gemsEarned: number } => {
  let gemsEarned = 0;
  const next = achievements.map((a) => {
    if (a.id !== id || a.unlocked) return a;
    gemsEarned += a.rewardGems;
    return { ...a, unlocked: true };
  });
  return { achievements: next, gemsEarned };
};

const getUtcDayKey = (ts: number): number => {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

export const usePlayerStore = create<PlayerState & PlayerActions>()(
  persist(
    (set, get) => ({
    ...initialState,

    // Identity
    setPlayer: (playerId, nickname) => set({ playerId, nickname, hasEnteredNameOnce: true }),
    setDeviceId: (deviceId) => set({ deviceId }),
    setNickname: (nickname) =>
      set((state) => {
        const n = nickname.trim();
        return {
          nickname: n,
          hasEnteredNameOnce:
            state.hasEnteredNameOnce || (n.length > 0 && n !== 'Player'),
        };
      }),

    // Progression
    addXp: (amount) => {
      set(state => {
        const gain = Math.max(0, Math.floor(amount));
        const newXp = state.xp + gain;
        const newLevel = getLevelFromXp(newXp);
        // 2.3: levels pay out — +15 gems per level gained so the XP bar is a goal, not decoration.
        const levelsGained = Math.max(0, newLevel - state.level);
        return { xp: newXp, level: newLevel, gems: state.gems + levelsGained * LEVEL_UP_GEM_REWARD };
      });
    },
    setLevel: (level) => set({ level }),
    setPremium: (premium) =>
      set((state) => ({
        premium,
        unlockedSkins:
          premium && !state.unlockedSkins.includes('gold')
            ? [...state.unlockedSkins, 'gold']
            : state.unlockedSkins,
      })),
    setGems: (gems) => set({ gems }),
    addGems: (amount) => set(state => ({ gems: state.gems + amount })),

    // Stats
    registerRunStarted: () => {
      set((state) => {
        const dailyResetPatch = maybeResetDailyMissions(state);
        const weeklyResetPatch = maybeResetWeeklyMissions(state);
        let missions = dailyResetPatch.dailyMissions ?? state.dailyMissions;
        let weeklyMissions = weeklyResetPatch.weeklyMissions ?? state.weeklyMissions;
        let gemsFromMissions = 0;
        let gemsFromAchievements = 0;
        const nextGamesPlayed = state.gamesPlayed + 1;

        const gamesMission = applyMissionProgress(missions, 'play_games', 1);
        missions = gamesMission;

        const weeklyGamesMission = applyWeeklyMissionProgress(weeklyMissions, 'play_games', 1);
        weeklyMissions = weeklyGamesMission.missions;
        gemsFromMissions += weeklyGamesMission.gemsEarned;

        let achievements = state.achievements;
        if (nextGamesPlayed >= 25) {
          const unlock = unlockAchievement(achievements, 'games_25');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }

        return {
          ...dailyResetPatch,
          ...weeklyResetPatch,
          gamesPlayed: nextGamesPlayed,
          dailyMissions: missions,
          weeklyMissions,
          gems: state.gems + gemsFromMissions + gemsFromAchievements,
          achievements,
        };
      });
    },

    recordGame: (wavesReached, enemiesKilled = 0, towersPlaced = 0, gemsEarnedThisRun, extras) => {
      set((state) => {
        const dailyResetPatch = maybeResetDailyMissions(state);
        const weeklyResetPatch = maybeResetWeeklyMissions(state);
        let missions = dailyResetPatch.dailyMissions ?? state.dailyMissions;
        let weeklyMissions = weeklyResetPatch.weeklyMissions ?? state.weeklyMissions;
        let gemsFromMissions = 0;
        let gemsFromAchievements = 0;

        const enemiesMission = applyMissionProgress(missions, 'kill_enemies', enemiesKilled);
        missions = enemiesMission;

        const wavesMission = applyMissionProgress(missions, 'survive_waves', wavesReached);
        missions = wavesMission;

        const weeklyEnemiesMission = applyWeeklyMissionProgress(weeklyMissions, 'kill_enemies', enemiesKilled);
        weeklyMissions = weeklyEnemiesMission.missions;
        gemsFromMissions += weeklyEnemiesMission.gemsEarned;

        const weeklyWavesMission = applyWeeklyMissionProgress(weeklyMissions, 'survive_waves', wavesReached);
        weeklyMissions = weeklyWavesMission.missions;
        gemsFromMissions += weeklyWavesMission.gemsEarned;

        const nextEnemiesKilled = state.lifetimeEnemiesKilled + enemiesKilled;
        const nextFlying = state.lifetimeFlyingKills + Math.max(0, extras?.flying ?? 0);
        const nextArmored = state.lifetimeArmoredKills + Math.max(0, extras?.armored ?? 0);
        const nextBosses = state.lifetimeBossKills + Math.max(0, extras?.bosses ?? 0);
        const nextTowersPlaced = state.lifetimeTowersPlaced + towersPlaced;
        const nextBestWave = Math.max(state.bestWave, wavesReached);
        let achievements = state.achievements;

        if (nextEnemiesKilled >= 1) {
          const unlock = unlockAchievement(achievements, 'first_blood');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (nextBestWave >= 10) {
          const unlock = unlockAchievement(achievements, 'wave_10');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (nextBestWave >= 25) {
          const unlock = unlockAchievement(achievements, 'wave_25');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (nextTowersPlaced >= 100) {
          const unlock = unlockAchievement(achievements, 'tower_architect');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (nextTowersPlaced >= 500) {
          const unlock = unlockAchievement(achievements, 'master_builder');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (nextBestWave >= 50) {
          const unlock = unlockAchievement(achievements, 'wave_50');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (nextBestWave >= 75) {
          const unlock = unlockAchievement(achievements, 'wave_75');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (nextEnemiesKilled >= 500) {
          const unlock = unlockAchievement(achievements, 'slayer_500');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (nextEnemiesKilled >= 5000) {
          const unlock = unlockAchievement(achievements, 'slayer_5000');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (state.gems >= 2500) {
          const unlock = unlockAchievement(achievements, 'gem_hoarder');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (nextFlying >= 30) {
          const unlock = unlockAchievement(achievements, 'wing_clipper');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (nextArmored >= 25) {
          const unlock = unlockAchievement(achievements, 'plate_breaker');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (nextBosses >= 3) {
          const unlock = unlockAchievement(achievements, 'boss_slayer');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if ((extras?.difficulty ?? state.difficultyMode) === 'last_stand' && wavesReached >= 12) {
          const unlock = unlockAchievement(achievements, 'last_stand_hold');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }

        const runSummaryPatch =
          gemsEarnedThisRun !== undefined
            ? {
                lastRunGemsEarned: gemsEarnedThisRun,
                lastRunEnemiesKilled: enemiesKilled,
              }
            : {};

        return {
          ...dailyResetPatch,
          ...weeklyResetPatch,
          totalWavesSurvived: state.totalWavesSurvived + wavesReached,
          bestWave: nextBestWave,
          lifetimeEnemiesKilled: nextEnemiesKilled,
          lifetimeFlyingKills: nextFlying,
          lifetimeArmoredKills: nextArmored,
          lifetimeBossKills: nextBosses,
          lifetimeTowersPlaced: nextTowersPlaced,
          dailyMissions: missions,
          weeklyMissions,
          gems: state.gems + gemsFromMissions + gemsFromAchievements,
          achievements,
          ...runSummaryPatch,
        };
      });
    },
    setBestWave: (wave) => set({ bestWave: wave }),
    refreshDailyMissions: () => {
      set((state) => ({ ...maybeResetDailyMissions(state) }));
    },
    refreshWeeklyMissions: () => {
      set((state) => ({ ...maybeResetWeeklyMissions(state) }));
    },
    claimDailyMission: (id) => {
      set((state) => {
        const dailyResetPatch = maybeResetDailyMissions(state);
        let missions = dailyResetPatch.dailyMissions ?? state.dailyMissions;
        const mission = missions.find((m) => m.id === id);
        if (!mission || !mission.completed || mission.claimed) {
          return { ...dailyResetPatch };
        }
        const next = missions.map((m) =>
          m.id === id ? { ...m, claimed: true } : m
        );
        return {
          ...dailyResetPatch,
          dailyMissions: next,
          gems: state.gems + mission.rewardGems,
        };
      });
    },
    canClaimDailyBonus: () => {
      const state = get();
      if (!state.lastDailyBonusClaimAt) return true;
      return getUtcDayKey(Date.now()) !== getUtcDayKey(state.lastDailyBonusClaimAt);
    },
    claimDailyBonus: () => {
      const state = get();
      const now = Date.now();
      if (!get().canClaimDailyBonus()) {
        return { reward: 0, streak: state.loginStreak, milestoneBonus: 0 };
      }

      let nextStreak = 1;
      if (state.lastDailyBonusClaimAt) {
        const lastDay = getUtcDayKey(state.lastDailyBonusClaimAt);
        const today = getUtcDayKey(now);
        const oneDay = 24 * 60 * 60 * 1000;
        if (today - lastDay === oneDay) {
          nextStreak = state.loginStreak + 1;
        } else if (today - lastDay === 2 * oneDay) {
          // 2.3: one grace day — missing a single day no longer wipes the streak.
          nextStreak = state.loginStreak + 1;
        } else if (today === lastDay) {
          nextStreak = state.loginStreak;
        }
      }

      const streakCap = Math.min(nextStreak, 7);
      const reward = 10 + (streakCap - 1) * 5;
      const milestoneBonus =
        streakCap % 7 === 0 ? 75 : streakCap % 3 === 0 ? 30 : 0;
      set({
        loginStreak: nextStreak,
        lastDailyBonusClaimAt: now,
        gems: state.gems + reward + milestoneBonus,
      });
      return { reward, streak: nextStreak, milestoneBonus };
    },
    recordSessionRunStats: (enemiesKilledThisRun) => {
      const k = Math.max(0, Math.floor(enemiesKilledThisRun));
      set((state) => {
        const triumphDelta =
          k >= SESSION_SLAUGHTER_WIN_KILLS ? 1 : 0;
        return {
          sessionEnemiesKilledTotal: state.sessionEnemiesKilledTotal + k,
          sessionSlaughterTriumphs: state.sessionSlaughterTriumphs + triumphDelta,
        };
      });
    },
    canClaimSessionQuest: () => {
      const state = get();
      return state.sessionSlaughterTriumphs >= SESSION_BOUNTY_TRIUMPHS_NEEDED;
    },
    claimSessionQuest: () => {
      const state = get();
      if (!get().canClaimSessionQuest()) return 0;
      const reward = 50;
      set({
        gems: state.gems + reward,
        sessionSlaughterTriumphs: Math.max(
          0,
          state.sessionSlaughterTriumphs - SESSION_BOUNTY_TRIUMPHS_NEEDED
        ),
      });
      return reward;
    },
    recordDailyChallengeRun: () => {
      const state = get();
      const now = Date.now();
      const today = getUtcDayKey(now);
      const lastDay = state.lastDailyChallengeRunAt
        ? getUtcDayKey(state.lastDailyChallengeRunAt)
        : null;

      const combo = lastDay === today ? state.dailyChallengeRunCombo + 1 : 1;
      const bonusGems = combo > 0 && combo % 3 === 0 ? COMBO_BONUS_GEMS : 0;

      set({
        dailyChallengeRunCombo: combo,
        lastDailyChallengeRunAt: now,
        gems: state.gems + bonusGems,
      });

      return { combo, bonusGems };
    },

    // Tower unlocks (gems)
    purchaseTower: (tower) => {
      const state = get();
      if (state.unlockedTowers.includes(tower)) return false;
      const price = TOWER_UNLOCK_PRICES[tower];
      if (state.gems < price) return false;
      set({
        gems: state.gems - price,
        unlockedTowers: [...state.unlockedTowers, tower],
      });
      return true;
    },
    
    isTowerUnlocked: (tower) => get().unlockedTowers.includes(tower),
    
    getTowerUnlockPrice: (tower) => TOWER_UNLOCK_PRICES[tower],
    
    // Tower upgrades (shop - permanent stat boosts, paid in gems)
    purchaseTowerUpgrade: (tower) => {
      const state = get();
      if (!state.unlockedTowers.includes(tower)) return false;
      const currentLevel = state.towerUpgradeLevels[tower];
      const price = getShopUpgradeCost(tower, currentLevel);
      if (state.gems < price) return false;
      set({
        gems: state.gems - price,
        towerUpgradeLevels: {
          ...state.towerUpgradeLevels,
          [tower]: currentLevel + 1,
        },
      });
      return true;
    },
    
    getTowerUpgradeLevel: (tower) => get().towerUpgradeLevels[tower] || 0,
    
    getTowerUpgradePrice: (tower) => {
      const currentLevel = get().towerUpgradeLevels[tower] || 0;
      return getShopUpgradeCost(tower, currentLevel);
    },

    purchaseStartingCoinsUpgrade: () => {
      const state = get();
      if (state.startingCoinUpgradeLevel >= STARTING_COINS_UPGRADE_MAX) return false;
      const price = getStartingCoinsUpgradePrice(state.startingCoinUpgradeLevel);
      if (state.gems < price) return false;
      set({
        gems: state.gems - price,
        startingCoinUpgradeLevel: state.startingCoinUpgradeLevel + 1,
      });
      return true;
    },

    purchaseCoinIncomeUpgrade: () => {
      const state = get();
      if (state.coinIncomeUpgradeLevel >= COIN_INCOME_UPGRADE_MAX) return false;
      const price = getCoinIncomeUpgradePrice(state.coinIncomeUpgradeLevel);
      if (state.gems < price) return false;
      set({
        gems: state.gems - price,
        coinIncomeUpgradeLevel: state.coinIncomeUpgradeLevel + 1,
      });
      return true;
    },

    purchaseFortifyUpgrade: () => {
      const state = get();
      if (state.fortifyUpgradeLevel >= FORTIFY_UPGRADE_MAX) return false;
      const price = getFortifyUpgradePrice(state.fortifyUpgradeLevel);
      if (state.gems < price) return false;
      set({
        gems: state.gems - price,
        fortifyUpgradeLevel: state.fortifyUpgradeLevel + 1,
      });
      return true;
    },

    purchaseCalibrationUpgrade: () => {
      const state = get();
      if (state.calibrationUpgradeLevel >= CALIBRATION_UPGRADE_MAX) return false;
      const price = getCalibrationUpgradePrice(state.calibrationUpgradeLevel);
      if (state.gems < price) return false;
      set({
        gems: state.gems - price,
        calibrationUpgradeLevel: state.calibrationUpgradeLevel + 1,
      });
      return true;
    },

    setDifficultyMode: (mode) => set({ difficultyMode: mode }),
    completeFieldBriefing: () => set({ fieldBriefingSeen: true }),
    
    // Speed unlocks (gems)
    purchaseSpeed: (speed) => {
      if (!isGameSpeed(speed)) return false;
      const state = get();
      if (state.unlockedSpeeds.includes(speed)) return false;
      const price = SPEED_UNLOCK_PRICES[speed];
      if (state.gems < price) return false;
      set({
        gems: state.gems - price,
        unlockedSpeeds: normalizeUnlockedSpeeds([...state.unlockedSpeeds, speed]),
      });
      return true;
    },
    
    isSpeedUnlocked: (speed) => get().unlockedSpeeds.includes(speed),
    
    getSpeedUnlockPrice: (speed) => SPEED_UNLOCK_PRICES[speed],

    // Skins
    unlockSkin: (skinId) => {
      set((state) => {
        if (state.unlockedSkins.includes(skinId)) return state;
        return { unlockedSkins: [...state.unlockedSkins, skinId] };
      });
    },
    purchaseCosmeticSkin: (skinId, price) => {
      const state = get();
      if (state.unlockedSkins.includes(skinId)) return false;
      if (price > 0 && state.gems < price) return false;
      set({
        gems: state.gems - price,
        unlockedSkins: [...state.unlockedSkins, skinId],
      });
      return true;
    },
    setUnlockedSkins: (skins) => set({ unlockedSkins: skins }),
    equipSkin: (towerType, skinId) => {
      set((state) => ({
        equippedSkins: { ...state.equippedSkins, [towerType]: skinId },
      }));
    },
    equipSkinGlobally: (skinId) => {
      const next: Record<string, string> = {};
      for (const t of Object.keys(TOWERS)) {
        next[t] = skinId;
      }
      set({ equippedSkins: next });
    },

    // Arena expansion (real money IAP)
    addArenaExpansion: () => {
      const ownedBefore = ownedArenaTier(get().arenaExpansions);
      const next = applyArenaProduct(get().arenaExpansions, 'com.laststanddefense.arena_expansion');
      if (next == null) return;
      set({
        arenaExpansions: next,
        selectedArenaSize: selectedAfterUnlock(get().selectedArenaSize, ownedBefore, next),
      });
    },
    unlockArenaTier: (tier) => {
      const ownedBefore = ownedArenaTier(get().arenaExpansions);
      const next = applyArenaProduct(get().arenaExpansions, arenaTierProductId(tier));
      if (next == null) return;
      set({
        arenaExpansions: next,
        selectedArenaSize: selectedAfterUnlock(get().selectedArenaSize, ownedBefore, next),
      });
    },
    setSelectedArenaSize: (size) => {
      const state = get();
      if (state.savedGame) {
        const next = changeArenaSizeDuringSavedRun(state.savedGame, size, state.arenaExpansions);
        set({ selectedArenaSize: next.selected, savedGame: next.saved });
        return;
      }
      set({ selectedArenaSize: clampSelectedArenaSize(size, state.arenaExpansions) });
    },
    restoreArenaProducts: (productIds) => {
      const owned = ownedAfterRestore(get().arenaExpansions, productIds);
      set((state) => ({
        arenaExpansions: owned,
        selectedArenaSize: clampSelectedArenaSize(state.selectedArenaSize, owned),
      }));
      return owned;
    },
    hasProcessedIapTransaction: (transactionId) => {
      const tx = transactionId.trim();
      if (!tx) return false;
      return get().processedIapTransactionIds.includes(tx);
    },
    rememberIapTransaction: (transactionId) => {
      const tx = transactionId.trim();
      if (!tx) return;
      set((state) => {
        if (state.processedIapTransactionIds.includes(tx)) return state;
        return { processedIapTransactionIds: [...state.processedIapTransactionIds, tx].slice(-40) };
      });
    },

    setCurrentMapId: (mapId) => set({ currentMapId: mapId }),
    isMapUnlocked: (mapId) => get().unlockedMapIds.includes(mapId),
    unlockMapWithGems: (mapId, cost) => {
      const s = get();
      if (s.unlockedMapIds.includes(mapId)) return true;
      if (cost > 0 && s.gems < cost) return false;
      set({
        gems: s.gems - Math.max(0, cost),
        unlockedMapIds: [...s.unlockedMapIds, mapId],
      });
      get().syncMapUnlocksFromWaveProgress();
      return true;
    },
    unlockMapByProgress: (mapId) => {
      const s = get();
      if (s.unlockedMapIds.includes(mapId)) return;
      set({ unlockedMapIds: [...s.unlockedMapIds, mapId] });
    },

    /** Merge wave gates + existing gem unlocks (call after best-wave updates or on rehydrate). */
    syncMapUnlocksFromWaveProgress: () => {
      set((s) => {
        const unlockedMapIds = mergeWaveProgressUnlocks(s.unlockedMapIds, s.mapBestWaves);
        if (unlockedMapIds.length === s.unlockedMapIds.length) {
          const a = [...s.unlockedMapIds].sort().join(',');
          const b = [...unlockedMapIds].sort().join(',');
          if (a === b) return s;
        }
        return { unlockedMapIds };
      });
    },

    recordMapBestWave: (mapId, wave) => {
      if (!mapId || !Number.isFinite(wave)) return;
      set((s) => {
        const prev = s.mapBestWaves[mapId] ?? 0;
        const nextBest = wave > prev ? { ...s.mapBestWaves, [mapId]: wave } : { ...s.mapBestWaves };
        const unlockedMapIds = mergeWaveProgressUnlocks(s.unlockedMapIds, nextBest);
        if (wave <= prev && unlockedMapIds.length === s.unlockedMapIds.length) {
          const same =
            [...unlockedMapIds].sort().join(',') === [...s.unlockedMapIds].sort().join(',');
          if (same) return s;
        }
        return { mapBestWaves: nextBest, unlockedMapIds };
      });
    },
    getMapBestWave: (mapId) => get().mapBestWaves[mapId] ?? 0,
    purchaseLogo: (logoId, price) => {
      const s = get();
      if (s.unlockedLogos.includes(logoId)) return true;
      if (price > 0 && s.gems < price) return false;
      set({
        gems: s.gems - Math.max(0, price),
        unlockedLogos: [...s.unlockedLogos, logoId],
      });
      return true;
    },
    equipLogo: (logoId) => {
      const s = get();
      if (!s.unlockedLogos.includes(logoId)) return;
      set({ selectedLogoId: logoId });
    },
    isLogoUnlocked: (logoId) => get().unlockedLogos.includes(logoId),

    // Settings
    toggleSound: () => set(state => ({ soundEnabled: !state.soundEnabled })),
    toggleMusic: () => set(state => ({ musicEnabled: !state.musicEnabled })),
    toggleHaptic: () => set(state => ({ hapticEnabled: !state.hapticEnabled })),
    togglePerformanceMode: () => set(state => ({ performanceMode: !state.performanceMode })),
    setVfxQuality: (quality) => set({ vfxQuality: quality }),
    toggleAutoStartWaves: () => set(state => ({ autoStartWaves: !state.autoStartWaves })),
    setSfxVolume: (v) =>
      set({ sfxVolume: Math.max(0, Math.min(1, v)) }),
    setMusicVolume: (v) =>
      set({ musicVolume: Math.max(0, Math.min(1, v)) }),

    // Tutorial
    completeTutorial: () => set({ tutorialCompleted: true }),

    // SAVED GAME FUNCTIONS
    saveGame: (gameState: SavedGameState) => {
      set({ savedGame: gameState });
      // Note: in-game coins are NOT synced to gems. They are separate.
    },
    
    clearSavedGame: () => {
      set((state) => ({
        savedGame: null,
        ...maybeResetDailyMissions({ ...state, savedGame: null }),
      }));
    },

    clearCurrentGameProgress: () => {
      set((state) => ({
        savedGame: null,
        ...maybeResetDailyMissions({ ...state, savedGame: null }),
      }));
    },
    
    hasSavedGame: () => {
      return get().savedGame !== null;
    },
    
    getSavedGame: () => {
      return get().savedGame;
    },

    // Sync from server
    syncFromServer: (data) => {
      set((state) => ({
        ...state,
        ...data,
        hasEnteredNameOnce: true,
        unlockedTowers: unionTowerUnlocks(
          state.unlockedTowers,
          data.unlockedTowers as string[] | undefined
        ),
        unlockedSpeeds: normalizeUnlockedSpeeds(data.unlockedSpeeds ?? state.unlockedSpeeds),
        unlockedLogos:
          Array.isArray(data.unlockedLogos) && data.unlockedLogos.length > 0
            ? data.unlockedLogos
            : state.unlockedLogos,
        selectedLogoId:
          typeof data.selectedLogoId === 'string' && data.selectedLogoId.trim().length > 0
            ? data.selectedLogoId
            : state.selectedLogoId,
        lifetimeEnemiesKilled:
          typeof data.lifetimeEnemiesKilled === 'number'
            ? data.lifetimeEnemiesKilled
            : state.lifetimeEnemiesKilled,
        arenaExpansions: Math.max(
          ownedArenaTier(state.arenaExpansions),
          ownedArenaTier(typeof data.arenaExpansions === 'number' ? data.arenaExpansions : 0)
        ),
        selectedArenaSize: clampSelectedArenaSize(
          state.selectedArenaSize,
          Math.max(
            ownedArenaTier(state.arenaExpansions),
            ownedArenaTier(typeof data.arenaExpansions === 'number' ? data.arenaExpansions : 0)
          )
        ),
      }));
    },

    // Reset
    resetPlayer: () => {
      usePlayerStore.persist.clearStorage();
      set(initialState);
    },
  }),
  {
    name: 'last-stand-player',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) =>
      Object.fromEntries(
        playerPersistKeys.map((key) => [key, state[key as keyof PlayerState]])
      ) as unknown as PlayerState,
    merge: (persisted, current) => {
      const p = persisted as Partial<PlayerState> | undefined;
      const savedName = p?.nickname?.trim();
      const hasCustomSavedName = !!savedName && savedName !== 'Player';
      /** Name modal only on first launch; any persisted custom name skips onboarding */
      const nameOnboardingDone =
        p?.hasEnteredNameOnce === true ||
        !!p?.playerId ||
        hasCustomSavedName;

      const audioPrefs = migrateAudioPrefs({
        soundEnabled: p?.soundEnabled,
        audioPrefsRevision: p?.audioPrefsRevision,
      });
      const merged: PlayerState = {
        ...current,
        ...p,
        achievements: mergeAchievementLists(p?.achievements),
        dailyMissions: mergeDailyMissionListForLoad(p?.dailyMissions),
        hasEnteredNameOnce: nameOnboardingDone,
        towerUpgradeLevels: mergeNumericRecord(p?.towerUpgradeLevels),
        unlockedTowers: unionTowerUnlocks(p?.unlockedTowers, undefined),
        startingCoinUpgradeLevel: p?.startingCoinUpgradeLevel ?? 0,
        fortifyUpgradeLevel:
          typeof p?.fortifyUpgradeLevel === 'number'
            ? Math.min(FORTIFY_UPGRADE_MAX, Math.max(0, Math.floor(p.fortifyUpgradeLevel)))
            : 0,
        calibrationUpgradeLevel:
          typeof p?.calibrationUpgradeLevel === 'number'
            ? Math.min(CALIBRATION_UPGRADE_MAX, Math.max(0, Math.floor(p.calibrationUpgradeLevel)))
            : 0,
        difficultyMode:
          p?.difficultyMode === 'casual' ||
          p?.difficultyMode === 'veteran' ||
          p?.difficultyMode === 'last_stand'
            ? p.difficultyMode
            : 'normal',
        fieldBriefingSeen: migrateFieldBriefing({
          tutorialCompleted: p?.tutorialCompleted,
          fieldBriefingSeen: p?.fieldBriefingSeen,
        }),
        lifetimeFlyingKills:
          typeof p?.lifetimeFlyingKills === 'number' ? Math.max(0, p.lifetimeFlyingKills) : 0,
        lifetimeArmoredKills:
          typeof p?.lifetimeArmoredKills === 'number' ? Math.max(0, p.lifetimeArmoredKills) : 0,
        lifetimeBossKills:
          typeof p?.lifetimeBossKills === 'number' ? Math.max(0, p.lifetimeBossKills) : 0,
        sfxVolume:
          typeof p?.sfxVolume === 'number' ? Math.max(0, Math.min(1, p.sfxVolume)) : 0.9,
        soundEnabled: audioPrefs.soundEnabled,
        audioPrefsRevision: audioPrefs.audioPrefsRevision,
        musicVolume:
          typeof p?.musicVolume === 'number' ? Math.max(0, Math.min(1, p.musicVolume)) : 0.65,
        coinIncomeUpgradeLevel:
          typeof p?.coinIncomeUpgradeLevel === 'number'
            ? Math.min(COIN_INCOME_UPGRADE_MAX, Math.max(0, p.coinIncomeUpgradeLevel))
            : 0,
        currentMapId: p?.currentMapId ?? DEFAULT_MAP_ID,
        arenaExpansions: ownedArenaTier(typeof p?.arenaExpansions === 'number' ? p.arenaExpansions : 0),
        selectedArenaSize: clampSelectedArenaSize(
          p?.selectedArenaSize,
          ownedArenaTier(typeof p?.arenaExpansions === 'number' ? p.arenaExpansions : 0)
        ),
        processedIapTransactionIds: Array.isArray(p?.processedIapTransactionIds)
          ? p.processedIapTransactionIds.filter((id) => typeof id === 'string' && id.length > 0).slice(-40)
          : [],
        unlockedMapIds:
          Array.isArray(p?.unlockedMapIds) && p.unlockedMapIds.length > 0
            ? Array.from(new Set([DEFAULT_MAP_ID, ...p.unlockedMapIds]))
            : [DEFAULT_MAP_ID],
        mapBestWaves:
          p?.mapBestWaves && typeof p.mapBestWaves === 'object' ? p.mapBestWaves : {},
        unlockedLogos:
          Array.isArray(p?.unlockedLogos) && p.unlockedLogos.length > 0
            ? Array.from(
                new Set([
                  'shadow_operative',
                  'tower_sentinel',
                  'drone_commander',
                  'fortification_expert',
                  'wave_breaker',
                  ...p.unlockedLogos,
                ])
              )
            : ['shadow_operative', 'tower_sentinel', 'drone_commander', 'fortification_expert', 'wave_breaker'],
        selectedLogoId:
          typeof p?.selectedLogoId === 'string' && p.selectedLogoId.trim().length > 0
            ? p.selectedLogoId
            : DEFAULT_PLAYER_LOGO_ID,
        sessionEnemiesKilledTotal:
          typeof p?.sessionEnemiesKilledTotal === 'number'
            ? Math.max(0, p.sessionEnemiesKilledTotal)
            : 0,
        sessionSlaughterTriumphs:
          typeof p?.sessionSlaughterTriumphs === 'number'
            ? Math.max(0, p.sessionSlaughterTriumphs)
            : 0,
        lastRunGemsEarned: typeof p?.lastRunGemsEarned === 'number' ? p.lastRunGemsEarned : 0,
        lastRunEnemiesKilled:
          typeof p?.lastRunEnemiesKilled === 'number' ? p.lastRunEnemiesKilled : 0,
      } as PlayerState;

      if (!p?.lastDailyMissionDayKey) {
        delete (merged as { lastDailyMissionDayKey?: string }).lastDailyMissionDayKey;
      }
      if (!p?.lastWeeklyMissionWeekKey) {
        delete (merged as { lastWeeklyMissionWeekKey?: string }).lastWeeklyMissionWeekKey;
      }

      const dailyPatch = maybeResetDailyMissions(merged);
      const afterDaily: PlayerState = { ...merged, ...dailyPatch };
      const weeklyPatch = maybeResetWeeklyMissions(afterDaily);
      const rehydrated: PlayerState = { ...afterDaily, ...weeklyPatch };
      const reconciledUnlocks = mergeWaveProgressUnlocks(
        rehydrated.unlockedMapIds,
        rehydrated.mapBestWaves
      );
      return {
        ...rehydrated,
        unlockedMapIds: reconciledUnlocks,
        unlockedSpeeds: normalizeUnlockedSpeeds(rehydrated.unlockedSpeeds),
      } as typeof current;
    },
  }
  )
);
