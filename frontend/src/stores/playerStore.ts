import { create } from 'zustand';
import { TowerType, GameSpeed, TOWER_UNLOCK_PRICES, SPEED_UNLOCK_PRICES, getShopUpgradeCost, TargetingMode } from '../constants/game';

// Arena expansion is REAL MONEY - $2.99 per expansion
export const ARENA_EXPANSION_PRICE_USD = 2.99;

// Product ID for in-app purchases - import from iapService for consistency
export const IAP_PRODUCT_IDS = {
  ARENA_EXPANSION: 'com.laststanddefense.arena_expansion',
  REMOVE_ADS: 'com.laststanddefense.remove_ads',
  PREMIUM_BUNDLE: 'com.laststanddefense.premium_bundle',
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
  
  // Resources
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
  
  // Progression
  xp: number;
  level: number;
  coins: number;
  
  // Stats
  totalWavesSurvived: number;
  gamesPlayed: number;
  bestWave: number;
  
  // Tower unlocks (purchased in shop)
  unlockedTowers: TowerType[];
  
  // Tower upgrades (purchased in shop - permanent stat boosts)
  towerUpgradeLevels: Record<TowerType, number>;
  
  // Speed unlocks (purchased in shop)
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
  
  // Ad tracking
  gamesPlayedSinceAd: number;
  
  // Tutorial
  tutorialCompleted: boolean;
  
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
  setCoins: (coins: number) => void;
  addCoins: (amount: number) => void;
  
  // Stats
  recordGame: (wavesReached: number) => void;
  setBestWave: (wave: number) => void;
  
  // Tower unlocks
  purchaseTower: (tower: TowerType) => boolean;
  isTowerUnlocked: (tower: TowerType) => boolean;
  getTowerUnlockPrice: (tower: TowerType) => number;
  
  // Tower upgrades (shop)
  purchaseTowerUpgrade: (tower: TowerType) => boolean;
  getTowerUpgradeLevel: (tower: TowerType) => number;
  getTowerUpgradePrice: (tower: TowerType) => number;
  
  // Speed unlocks
  purchaseSpeed: (speed: GameSpeed) => boolean;
  isSpeedUnlocked: (speed: GameSpeed) => boolean;
  getSpeedUnlockPrice: (speed: GameSpeed) => number;
  
  // Skins
  unlockSkin: (skinId: string) => void;
  setUnlockedSkins: (skins: string[]) => void;
  equipSkin: (towerType: string, skinId: string) => void;
  
  // Arena expansion (real money)
  addArenaExpansion: () => void;
  
  // Settings
  toggleSound: () => void;
  toggleMusic: () => void;
  toggleHaptic: () => void;
  
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
  
  // Sync from server
  syncFromServer: (data: Partial<PlayerState>) => void;
  
  // Reset
  resetPlayer: () => void;
}

const initialState: PlayerState = {
  playerId: null,
  deviceId: '',
  nickname: 'Player',
  xp: 0,
  level: 1,
  coins: 100,
  totalWavesSurvived: 0,
  gamesPlayed: 0,
  bestWave: 0,
  unlockedTowers: ['machine_gun'],
  towerUpgradeLevels: {
    machine_gun: 0,
    sniper: 0,
    splash: 0,
    freeze: 0,
    missile: 0,
    laser: 0,
  },
  unlockedSpeeds: [1],  // 1x is free
  unlockedSkins: ['default'],
  equippedSkins: {},
  premium: false,
  arenaExpansions: 0,
  soundEnabled: true,
  musicEnabled: true,
  hapticEnabled: true,
  gamesPlayedSinceAd: 0,
  tutorialCompleted: false,
  savedGame: null,  // No saved game initially
};

export const usePlayerStore = create<PlayerState & PlayerActions>()(
  (set, get) => ({
    ...initialState,

    // Identity
    setPlayer: (playerId, nickname) => set({ playerId, nickname }),
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
    setCoins: (coins) => set({ coins }),
    addCoins: (amount) => set(state => ({ coins: state.coins + amount })),

    // Stats
    recordGame: (wavesReached) => {
      set(state => ({
        totalWavesSurvived: state.totalWavesSurvived + wavesReached,
        gamesPlayed: state.gamesPlayed + 1,
        bestWave: Math.max(state.bestWave, wavesReached),
      }));
    },
    setBestWave: (wave) => set({ bestWave: wave }),

    // Tower unlocks
    purchaseTower: (tower) => {
      const state = get();
      if (state.unlockedTowers.includes(tower)) return false;
      const price = TOWER_UNLOCK_PRICES[tower];
      if (state.coins < price) return false;
      set({
        coins: state.coins - price,
        unlockedTowers: [...state.unlockedTowers, tower],
      });
      return true;
    },
    
    isTowerUnlocked: (tower) => get().unlockedTowers.includes(tower),
    
    getTowerUnlockPrice: (tower) => TOWER_UNLOCK_PRICES[tower],
    
    // Tower upgrades (shop - permanent stat boosts)
    purchaseTowerUpgrade: (tower) => {
      const state = get();
      if (!state.unlockedTowers.includes(tower)) return false;
      const currentLevel = state.towerUpgradeLevels[tower];
      const price = getShopUpgradeCost(tower, currentLevel);
      if (state.coins < price) return false;
      set({
        coins: state.coins - price,
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
    
    // Speed unlocks
    purchaseSpeed: (speed) => {
      const state = get();
      if (state.unlockedSpeeds.includes(speed)) return false;
      const price = SPEED_UNLOCK_PRICES[speed];
      if (state.coins < price) return false;
      set({
        coins: state.coins - price,
        unlockedSpeeds: [...state.unlockedSpeeds, speed].sort((a, b) => a - b) as GameSpeed[],
      });
      return true;
    },
    
    isSpeedUnlocked: (speed) => get().unlockedSpeeds.includes(speed),
    
    getSpeedUnlockPrice: (speed) => SPEED_UNLOCK_PRICES[speed],

    // Skins
    unlockSkin: (skinId) => {
      set(state => {
        if (state.unlockedSkins.includes(skinId)) return state;
        return { unlockedSkins: [...state.unlockedSkins, skinId] };
      });
    },
    setUnlockedSkins: (skins) => set({ unlockedSkins: skins }),
    equipSkin: (towerType, skinId) => {
      set(state => ({
        equippedSkins: { ...state.equippedSkins, [towerType]: skinId },
      }));
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
      set({ 
        savedGame: gameState,
        coins: gameState.coins, // Update player coins to match saved game
      });
    },
    
    clearSavedGame: () => {
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
      set(state => ({
        ...state,
        ...data,
        unlockedTowers: (data.unlockedTowers as TowerType[]) || state.unlockedTowers,
        unlockedSpeeds: (data.unlockedSpeeds as GameSpeed[]) || state.unlockedSpeeds,
      }));
    },

    // Reset
    resetPlayer: () => set(initialState),
  })
);
