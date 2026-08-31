/**
 * AdMob configuration.
 *
 * Real ad unit IDs come from EXPO_PUBLIC_ADMOB_* env vars (frontend/.env locally,
 * EAS environment variables for production builds). When a var is missing, or in
 * __DEV__, Google's official test IDs are used so nothing ever serves live ads
 * from a debug build (serving live ads to yourself risks an AdMob policy strike).
 *
 * The AdMob *App* IDs live in frontend/app.json under the
 * "react-native-google-mobile-ads" plugin — they must match the app registered
 * in AdMob or the native SDK will crash on launch.
 */
import { Platform } from 'react-native';

// Google's public test ad unit IDs (safe to click, never pay out).
const TEST_IDS = {
  ios: {
    banner: 'ca-app-pub-3940256099942544/2934735716',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
  android: {
    banner: 'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
} as const;

const env = (key: string): string | undefined => {
  const v = (process.env as Record<string, string | undefined>)[key];
  return v && v.trim().length > 0 ? v.trim() : undefined;
};

const PROD_IDS = {
  ios: {
    banner: env('EXPO_PUBLIC_ADMOB_IOS_BANNER'),
    interstitial: env('EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL'),
    rewarded: env('EXPO_PUBLIC_ADMOB_IOS_REWARDED'),
  },
  android: {
    banner: env('EXPO_PUBLIC_ADMOB_ANDROID_BANNER'),
    interstitial: env('EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL'),
    rewarded: env('EXPO_PUBLIC_ADMOB_ANDROID_REWARDED'),
  },
} as const;

type AdKind = 'banner' | 'interstitial' | 'rewarded';

const platformKey: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios';

/** Force test ads even in a release build by setting EXPO_PUBLIC_ADMOB_TEST_ADS=1. */
export const USE_TEST_ADS: boolean = __DEV__ || env('EXPO_PUBLIC_ADMOB_TEST_ADS') === '1';

export const getAdUnitId = (kind: AdKind): string => {
  if (!USE_TEST_ADS) {
    const real = PROD_IDS[platformKey][kind];
    if (real) return real;
  }
  return TEST_IDS[platformKey][kind];
};

/** True when at least one production unit ID is configured for this platform. */
export const hasProductionAdIds = (): boolean =>
  Boolean(
    PROD_IDS[platformKey].banner ||
      PROD_IDS[platformKey].interstitial ||
      PROD_IDS[platformKey].rewarded,
  );

/** Ads only run on native. Web builds never load the SDK. */
export const ADS_SUPPORTED: boolean = Platform.OS === 'ios' || Platform.OS === 'android';

/** Gems granted per rewarded video. Mirrors backend /rewards/claim ("gems" => 10). */
export const REWARDED_AD_GEMS = 10;

/** Minimum gap between interstitials, and how many game-overs to skip first. */
export const INTERSTITIAL_MIN_INTERVAL_MS = 3 * 60 * 1000;
export const INTERSTITIAL_SKIP_FIRST_GAME_OVERS = 1;

/** Rewarded ad cooldown shown in UI; backend enforces 30s for "gems". */
export const REWARDED_AD_COOLDOWN_MS = 30 * 1000;
