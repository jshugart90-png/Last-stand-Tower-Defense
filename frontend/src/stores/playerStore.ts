import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TowerType,
  GameSpeed,
  TOWER_UNLOCK_PRICES,
  SPEED_UNLOCK_PRICES,
  getShopUpgradeCost,
  TargetingMode,
  TOWERS,
  STARTING_COINS_UPGRADE_MAX,
  getStartingCoinsUpgradePrice,
} from '../constants/game';
import {
  Achievement,
  createDefaultAchievements,
  createDefaultDailyMissions,
  createDefaultWeeklyMissions,
  DailyMission,
  DAILY_RESET_HOURS,
  WeeklyMission,
  WEEKLY_RESET_DAYS,
} from '../constants/progression';

// Arena expansion is REAL MONEY - $2.99 per expansion
export const ARENA_EXPANSION_PRICE_USD = 2.99;

// Product ID for in-app purchases
export const IAP_PRODUCT_IDS = {
  ARENA_EXPANSION: 'com.laststanddefense.arena_expansion',
  REMOVE_ADS: 'com.laststanddefense.remove_ads',
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
  
  // Ad revive tracking
  adReviveUsed: boolean;
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
  gems: number;  // Persistent currency (earned from gameplay, IAP, ads)
  
  // Stats
  totalWavesSurvived: number;
  gamesPlayed: number;
  bestWave: number;
  lifetimeEnemiesKilled: number;
  lifetimeTowersPlaced: number;
  
  // Tower unlocks (purchased in shop with gems)
  unlockedTowers: TowerType[];
  
  // Tower upgrades (purchased in shop with gems - permanent stat boosts)
  towerUpgradeLevels: Record<TowerType, number>;

  /** Permanent: bonus starting in-game coins each run (shop upgrade) */
  startingCoinUpgradeLevel: number;
  
  // Speed unlocks (purchased in shop with gems)
  unlockedSpeeds: GameSpeed[];
  
  // Skins
  unlockedSkins: string[];
  equippedSkins: Record<string, string>;
  
  // Purchases
  premium: boolean;
  arenaExpansions: number;
  
  // Settings
  soundEnabled: boolean;
  musicEnabled: boolean;
  hapticEnabled: boolean;
  performanceMode: boolean;
  vfxQuality: 0 | 1 | 2; // 0 low, 1 medium, 2 high
  autoStartWaves: boolean;
  
  // Ad tracking
  gamesPlayedSinceAd: number;
  
  // Tutorial
  tutorialCompleted: boolean;

  // Progression systems
  dailyMissions: DailyMission[];
  lastDailyResetAt: number;
  weeklyMissions: WeeklyMission[];
  lastWeeklyResetAt: number;
  achievements: Achievement[];
  loginStreak: number;
  lastDailyBonusClaimAt: number | null;
  sessionWins: number;
  sessionQuestClaimed: boolean;
  dailyChallengeRunCombo: number;
  lastDailyChallengeRunAt: number | null;
  
  // SAVED GAME STATE - for resume functionality
  savedGame: SavedGameState | null;
}

interface PlayerActions {
  // Identity
  setPlayer: (playerId: string, nickname: string) => void;
  setDeviceId: (deviceId: string) => void;
  setNickname: (nickname: string) => void;
  
  // Progression
  addXp: (amount: number) => void;
  setLevel: (level: number) => void;
  setGems: (gems: number) => void;
  addGems: (amount: number) => void;
  
  // Stats
  recordGame: (wavesReached: number, enemiesKilled?: number, towersPlaced?: number) => void;
  setBestWave: (wave: number) => void;
  refreshDailyMissions: () => void;
  refreshWeeklyMissions: () => void;
  canClaimDailyBonus: () => boolean;
  claimDailyBonus: () => { reward: number; streak: number; milestoneBonus: number };
  recordSessionWin: () => void;
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
  
  // Settings
  toggleSound: () => void;
  toggleMusic: () => void;
  toggleHaptic: () => void;
  togglePerformanceMode: () => void;
  setVfxQuality: (quality: 0 | 1 | 2) => void;
  toggleAutoStartWaves: () => void;
  
  // Ad tracking
  incrementGamesPlayedSinceAd: () => void;
  resetGamesPlayedSinceAd: () => void;
  shouldShowInterstitialAd: () => boolean;
  
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
  lifetimeTowersPlaced: 0,
  unlockedTowers: ['machine_gun'],
  towerUpgradeLevels: {
    machine_gun: 0,
    sniper: 0,
    splash: 0,
    freeze: 0,
    missile: 0,
    laser: 0,
  },
  startingCoinUpgradeLevel: 0,
  unlockedSpeeds: [1],  // 1x is free
  unlockedSkins: ['default'],
  equippedSkins: {},
  premium: false,
  arenaExpansions: 0,
  soundEnabled: true,
  musicEnabled: true,
  hapticEnabled: true,
  performanceMode: false,
  vfxQuality: 2,
  autoStartWaves: false,
  gamesPlayedSinceAd: 0,
  tutorialCompleted: false,
  dailyMissions: createDefaultDailyMissions(),
  lastDailyResetAt: Date.now(),
  weeklyMissions: createDefaultWeeklyMissions(),
  lastWeeklyResetAt: Date.now(),
  achievements: createDefaultAchievements(),
  loginStreak: 0,
  lastDailyBonusClaimAt: null,
  sessionWins: 0,
  sessionQuestClaimed: false,
  dailyChallengeRunCombo: 0,
  lastDailyChallengeRunAt: null,
  savedGame: null,
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
  'lifetimeTowersPlaced',
  'unlockedTowers',
  'towerUpgradeLevels',
  'startingCoinUpgradeLevel',
  'unlockedSpeeds',
  'unlockedSkins',
  'equippedSkins',
  'premium',
  'arenaExpansions',
  'soundEnabled',
  'musicEnabled',
  'hapticEnabled',
  'performanceMode',
  'vfxQuality',
  'autoStartWaves',
  'gamesPlayedSinceAd',
  'tutorialCompleted',
  'dailyMissions',
  'lastDailyResetAt',
  'weeklyMissions',
  'lastWeeklyResetAt',
  'achievements',
  'loginStreak',
  'lastDailyBonusClaimAt',
  'sessionWins',
  'sessionQuestClaimed',
  'dailyChallengeRunCombo',
  'lastDailyChallengeRunAt',
  'savedGame',
] as const;

const maybeResetDailyMissions = (state: PlayerState): Partial<PlayerState> => {
  const elapsed = Date.now() - state.lastDailyResetAt;
  const resetMs = DAILY_RESET_HOURS * 60 * 60 * 1000;
  if (elapsed < resetMs) return {};
  return {
    dailyMissions: createDefaultDailyMissions(),
    lastDailyResetAt: Date.now(),
  };
};

const maybeResetWeeklyMissions = (state: PlayerState): Partial<PlayerState> => {
  const elapsed = Date.now() - state.lastWeeklyResetAt;
  const resetMs = WEEKLY_RESET_DAYS * 24 * 60 * 60 * 1000;
  if (elapsed < resetMs) return {};
  return {
    weeklyMissions: createDefaultWeeklyMissions(),
    lastWeeklyResetAt: Date.now(),
  };
};

const applyMissionProgress = (
  missions: DailyMission[],
  id: DailyMission['id'],
  amount: number
): { missions: DailyMission[]; gemsEarned: number } => {
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

const mergeAchievementLists = (stored: Achievement[] | undefined): Achievement[] => {
  const defaults = createDefaultAchievements();
  if (!stored?.length) return defaults;
  const map = new Map(stored.map((a) => [a.id, a]));
  return defaults.map((d) => {
    const s = map.get(d.id);
    return { ...d, unlocked: s?.unlocked ?? false };
  });
};

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
    setNickname: (nickname) => set({ nickname }),

    // Progression
    addXp: (amount) => {
      set(state => {
        const newXp = state.xp + amount;
        const newLevel = Math.floor(newXp / 100) + 1;
        return { xp: newXp, level: newLevel };
      });
    },
    setLevel: (level) => set({ level }),
    setGems: (gems) => set({ gems }),
    addGems: (amount) => set(state => ({ gems: state.gems + amount })),

    // Stats
    recordGame: (wavesReached, enemiesKilled = 0, towersPlaced = 0) => {
      set((state) => {
        const dailyResetPatch = maybeResetDailyMissions(state);
        const weeklyResetPatch = maybeResetWeeklyMissions(state);
        let missions = dailyResetPatch.dailyMissions ?? state.dailyMissions;
        let weeklyMissions = weeklyResetPatch.weeklyMissions ?? state.weeklyMissions;
        let gemsFromMissions = 0;
        let gemsFromAchievements = 0;

        const gamesMission = applyMissionProgress(missions, 'play_games', 1);
        missions = gamesMission.missions;
        gemsFromMissions += gamesMission.gemsEarned;

        const enemiesMission = applyMissionProgress(missions, 'kill_enemies', enemiesKilled);
        missions = enemiesMission.missions;
        gemsFromMissions += enemiesMission.gemsEarned;

        const wavesMission = applyMissionProgress(missions, 'survive_waves', wavesReached);
        missions = wavesMission.missions;
        gemsFromMissions += wavesMission.gemsEarned;

        const weeklyGamesMission = applyWeeklyMissionProgress(weeklyMissions, 'play_games', 1);
        weeklyMissions = weeklyGamesMission.missions;
        gemsFromMissions += weeklyGamesMission.gemsEarned;

        const weeklyEnemiesMission = applyWeeklyMissionProgress(weeklyMissions, 'kill_enemies', enemiesKilled);
        weeklyMissions = weeklyEnemiesMission.missions;
        gemsFromMissions += weeklyEnemiesMission.gemsEarned;

        const weeklyWavesMission = applyWeeklyMissionProgress(weeklyMissions, 'survive_waves', wavesReached);
        weeklyMissions = weeklyWavesMission.missions;
        gemsFromMissions += weeklyWavesMission.gemsEarned;

        const nextEnemiesKilled = state.lifetimeEnemiesKilled + enemiesKilled;
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
        const nextGamesPlayed = state.gamesPlayed + 1;
        if (nextGamesPlayed >= 25) {
          const unlock = unlockAchievement(achievements, 'games_25');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }
        if (state.gems >= 2500) {
          const unlock = unlockAchievement(achievements, 'gem_hoarder');
          achievements = unlock.achievements;
          gemsFromAchievements += unlock.gemsEarned;
        }

        return {
          ...dailyResetPatch,
          ...weeklyResetPatch,
          totalWavesSurvived: state.totalWavesSurvived + wavesReached,
          gamesPlayed: nextGamesPlayed,
          bestWave: nextBestWave,
          lifetimeEnemiesKilled: nextEnemiesKilled,
          lifetimeTowersPlaced: nextTowersPlaced,
          dailyMissions: missions,
          weeklyMissions,
          gems: state.gems + gemsFromMissions + gemsFromAchievements,
          achievements,
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
    recordSessionWin: () => {
      set((state) => ({ sessionWins: state.sessionWins + 1 }));
    },
    canClaimSessionQuest: () => {
      const state = get();
      return state.sessionWins >= 2 && !state.sessionQuestClaimed;
    },
    claimSessionQuest: () => {
      const state = get();
      if (!get().canClaimSessionQuest()) return 0;
      const reward = 50;
      set({
        gems: state.gems + reward,
        sessionQuestClaimed: true,
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
      const bonusGems = combo > 0 && combo % 3 === 0 ? 20 : 0;

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
    
    // Speed unlocks (gems)
    purchaseSpeed: (speed) => {
      const state = get();
      if (state.unlockedSpeeds.includes(speed)) return false;
      const price = SPEED_UNLOCK_PRICES[speed];
      if (state.gems < price) return false;
      set({
        gems: state.gems - price,
        unlockedSpeeds: [...state.unlockedSpeeds, speed].sort((a, b) => a - b) as GameSpeed[],
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
      set(state => ({
        arenaExpansions: state.arenaExpansions + 1,
      }));
    },

    // Settings
    toggleSound: () => set(state => ({ soundEnabled: !state.soundEnabled })),
    toggleMusic: () => set(state => ({ musicEnabled: !state.musicEnabled })),
    toggleHaptic: () => set(state => ({ hapticEnabled: !state.hapticEnabled })),
    togglePerformanceMode: () => set(state => ({ performanceMode: !state.performanceMode })),
    setVfxQuality: (quality) => set({ vfxQuality: quality }),
    toggleAutoStartWaves: () => set(state => ({ autoStartWaves: !state.autoStartWaves })),

    // Ad tracking
    incrementGamesPlayedSinceAd: () => {
      set(state => ({ gamesPlayedSinceAd: state.gamesPlayedSinceAd + 1 }));
    },
    resetGamesPlayedSinceAd: () => set({ gamesPlayedSinceAd: 0 }),
    shouldShowInterstitialAd: () => {
      const state = get();
      if (state.premium) return false;
      return state.gamesPlayedSinceAd >= 2;
    },

    // Tutorial
    completeTutorial: () => set({ tutorialCompleted: true }),

    // SAVED GAME FUNCTIONS
    saveGame: (gameState: SavedGameState) => {
      set({ savedGame: gameState });
      // Note: in-game coins are NOT synced to gems. They are separate.
    },
    
    clearSavedGame: () => {
      set({ savedGame: null });
    },
    
    clearCurrentGameProgress: () => {
      set({ savedGame: null });
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
        unlockedTowers: (data.unlockedTowers as TowerType[]) || state.unlockedTowers,
        unlockedSpeeds: (data.unlockedSpeeds as GameSpeed[]) || state.unlockedSpeeds,
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
      return {
        ...current,
        ...p,
        achievements: mergeAchievementLists(p?.achievements),
        hasEnteredNameOnce: p?.hasEnteredNameOnce ?? !!p?.playerId,
        startingCoinUpgradeLevel: p?.startingCoinUpgradeLevel ?? 0,
      };
    },
  }
  )
);
