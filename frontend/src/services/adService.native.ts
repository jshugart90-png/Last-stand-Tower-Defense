import { Platform } from 'react-native';
import Constants from 'expo-constants';
import mobileAds, {
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
  MaxAdContentRating,
} from 'react-native-google-mobile-ads';
import { setGameplaySfxArmed, isGameplaySfxArmed } from './audioService';
import { usePlayerStore } from '../stores/playerStore';

type AdExtra = {
  EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID?: string;
  EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS?: string;
  EXPO_PUBLIC_ADMOB_REWARDED_ANDROID?: string;
  EXPO_PUBLIC_ADMOB_REWARDED_IOS?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as AdExtra;

/** Replace with production unit IDs via app.json `extra` (same keys). */
export const AD_UNIT_IDS = {
  REWARDED:
    Platform.OS === 'ios'
      ? extra.EXPO_PUBLIC_ADMOB_REWARDED_IOS ?? TestIds.REWARDED
      : extra.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID ?? TestIds.REWARDED,
  INTERSTITIAL:
    Platform.OS === 'ios'
      ? extra.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS ?? TestIds.INTERSTITIAL
      : extra.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID ?? TestIds.INTERSTITIAL,
  BANNER: 'ca-app-pub-9533265028371895/3866386218',
};

export const isNativeAdsAvailable = (): boolean =>
  Platform.OS === 'android' || Platform.OS === 'ios';

let sdkInitialized = false;
let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;
let rewarded: RewardedAd | null = null;
let rewardedLoaded = false;

let prevGameplaySfxArmed: boolean | undefined;

function beginFullscreenAdPresentation(): void {
  try {
    prevGameplaySfxArmed = isGameplaySfxArmed();
    setGameplaySfxArmed(false);
    const muteAdAudio = !usePlayerStore.getState().soundEnabled;
    mobileAds().setAppMuted(muteAdAudio);
  } catch {
    /* never block ads */
  }
}

function endFullscreenAdPresentation(): void {
  try {
    if (typeof prevGameplaySfxArmed === 'boolean') {
      setGameplaySfxArmed(prevGameplaySfxArmed);
      prevGameplaySfxArmed = undefined;
    }
    mobileAds().setAppMuted(false);
  } catch {
    /* never block */
  }
}

function ensureInterstitial(): InterstitialAd {
  if (!interstitial) {
    interstitial = InterstitialAd.createForAdRequest(AD_UNIT_IDS.INTERSTITIAL);
    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      interstitialLoaded = true;
    });
    interstitial.addAdEventListener(AdEventType.ERROR, () => {
      interstitialLoaded = false;
    });
    interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      interstitialLoaded = false;
      setTimeout(() => {
        try {
          interstitial?.load();
        } catch {
          /* ignore */
        }
      }, 0);
    });
  }
  return interstitial;
}

function ensureRewarded(): RewardedAd {
  if (!rewarded) {
    rewarded = RewardedAd.createForAdRequest(AD_UNIT_IDS.REWARDED);
    rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      rewardedLoaded = true;
    });
    rewarded.addAdEventListener(AdEventType.ERROR, () => {
      rewardedLoaded = false;
    });
    rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      rewardedLoaded = false;
      setTimeout(() => {
        try {
          rewarded?.load();
        } catch {
          /* ignore */
        }
      }, 0);
    });
  }
  return rewarded;
}

export const isAdsInitialized = (): boolean => sdkInitialized;

export const initializeAds = async (): Promise<boolean> => {
  if (sdkInitialized) return true;
  try {
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();
    sdkInitialized = true;
    return true;
  } catch {
    sdkInitialized = false;
    return false;
  }
};

export const loadInterstitialAd = async (): Promise<boolean> => {
  if (!sdkInitialized) return false;
  try {
    const ad = ensureInterstitial();
    if (interstitialLoaded) return true;
    ad.load();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (interstitialLoaded) return true;
      await new Promise((r) => setTimeout(r, 140));
    }
    return interstitialLoaded;
  } catch {
    return false;
  }
};

export const isInterstitialAdReady = (): boolean => interstitialLoaded;

export const showInterstitialAd = async (): Promise<boolean> => {
  if (!sdkInitialized || !interstitialLoaded) return false;
  beginFullscreenAdPresentation();
  try {
    await ensureInterstitial().show();
    return true;
  } catch {
    return false;
  } finally {
    endFullscreenAdPresentation();
  }
};

export const loadRewardedAd = async (): Promise<boolean> => {
  if (!sdkInitialized) return false;
  try {
    const ad = ensureRewarded();
    if (rewardedLoaded) return true;
    ad.load();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (rewardedLoaded) return true;
      await new Promise((r) => setTimeout(r, 140));
    }
    return rewardedLoaded;
  } catch {
    return false;
  }
};

export const isRewardedAdReady = (): boolean => rewardedLoaded;

export const showRewardedAd = async (): Promise<{ type: string; amount: number } | null> => {
  if (!sdkInitialized) return null;
  beginFullscreenAdPresentation();
  try {
    const ad = ensureRewarded();
    if (!rewardedLoaded) {
      const ok = await loadRewardedAd();
      if (!ok) return null;
    }

    return await new Promise<{ type: string; amount: number } | null>((resolve) => {
      let settled = false;
      let unsubClosed: () => void = () => {};

      const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (r) => {
        if (settled) return;
        settled = true;
        unsubEarned();
        unsubClosed();
        resolve({
          type: String(r.type),
          amount: Number(r.amount),
        });
      });

      unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        if (settled) return;
        settled = true;
        unsubEarned();
        unsubClosed();
        resolve(null);
      });

      ad.show().catch(() => {
        if (settled) return;
        settled = true;
        unsubEarned();
        unsubClosed();
        resolve(null);
      });
    });
  } catch {
    return null;
  } finally {
    endFullscreenAdPresentation();
  }
};

export const getNativeBannerAd = () => null;
export const getNativeBannerAdSize = () => null;
export const getNativeTestIds = () => TestIds;
