import { create } from 'zustand';
import { TowerType } from '../constants/game';

// Tower unlock prices (coins) - TRIPLED costs for slow progression
export const TOWER_PRICES: Record<TowerType, number> = {
  machine_gun: 0, // Free starter tower
  sniper: 1500, // Was 500, now 1500 (3x)
  splash: 2250, // Was 750, now 2250 (3x)
  freeze: 1800, // Was 600, now 1800 (3x)
  missile: 3600, // Was 1200, now 3600 (3x)
};

// Arena expansion is REAL MONEY - $2.99 per expansion (NOT COINS!)
export const ARENA_EXPANSION_PRICE_USD = 2.99;

// Product ID for in-app purchases (must match App Store / Google Play configuration)
export const IAP_PRODUCT_IDS = {
  ARENA_EXPANSION: 'arena_expansion_299',
  PREMIUM_UPGRADE: 'premium_upgrade_499',
};

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
  
  // Unlocks
  unlockedTowers: TowerType[];
  unlockedSkins: string[];
  equippedSkins: Record<string, string>;
  
  // Purchases
  premium: boolean;
  arenaExpansions: number; // Number of rows expanded (each adds 1 row on each side)
  
  // Settings
  soundEnabled: boolean;
  musicEnabled: boolean;
  hapticEnabled: boolean;
  
  // Ad tracking
  gamesPlayedSinceAd: number;
  
  // Tutorial
  tutorialCompleted: boolean;
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
  
  // Unlocks
  unlockTower: (tower: TowerType) => void;
  setUnlockedTowers: (towers: TowerType[]) => void;
  unlockSkin: (skinId: string) => void;
  setUnlockedSkins: (skins: string[]) => void;
  equipSkin: (towerType: string, skinId: string) => void;
  
  // Purchases
  setPremium: (premium: boolean) => void;
  addArenaExpansion: () => boolean; // Returns false if not enough coins
  getArenaExpansionPrice: () => number;
  
  // Tower purchases
  purchaseTower: (tower: TowerType) => boolean; // Returns false if not enough coins or already owned
  getTowerPrice: (tower: TowerType) => number;
  
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
  unlockedSkins: ['default'],
  equippedSkins: {},
  premium: false,
  arenaExpansions: 0,
  soundEnabled: true,
  musicEnabled: true,
  hapticEnabled: true,
  gamesPlayedSinceAd: 0,
  tutorialCompleted: false,
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

    // Unlocks
    unlockTower: (tower) => {
      set(state => {
        if (state.unlockedTowers.includes(tower)) return state;
        return { unlockedTowers: [...state.unlockedTowers, tower] };
      });
    },
    setUnlockedTowers: (towers) => set({ unlockedTowers: towers }),
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

    // Purchases
    setPremium: (premium) => set({ premium }),
    
    // Arena expansion is now REAL MONEY purchase via IAP
    // This method is only used if somehow coins are used (legacy)
    addArenaExpansion: () => {
      set(state => ({
        arenaExpansions: state.arenaExpansions + 1,
      }));
      return true;
    },
    
    getArenaExpansionPrice: () => {
      // Arena expansion is $2.99 real money, not coins
      return 0;
    },
    
    purchaseTower: (tower) => {
      const state = get();
      if (state.unlockedTowers.includes(tower)) return false;
      const price = TOWER_PRICES[tower];
      if (state.coins < price) return false;
      set({
        coins: state.coins - price,
        unlockedTowers: [...state.unlockedTowers, tower],
      });
      return true;
    },
    
    getTowerPrice: (tower) => TOWER_PRICES[tower],

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
      // Don't show ads for premium users
      if (state.premium) return false;
      // Show ad every 2-3 games
      return state.gamesPlayedSinceAd >= 2;
    },

    // Tutorial
    completeTutorial: () => set({ tutorialCompleted: true }),

    // Sync from server
    syncFromServer: (data) => {
      set(state => ({
        ...state,
        ...data,
        // Ensure unlocked towers are properly typed
        unlockedTowers: (data.unlockedTowers as TowerType[]) || state.unlockedTowers,
      }));
    },

    // Reset
    resetPlayer: () => set(initialState),
  })
);
