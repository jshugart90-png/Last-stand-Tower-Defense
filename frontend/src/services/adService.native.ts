import { Platform } from 'react-native';
import mobileAds, {
  RewardedAd,
  RewardedAdEventType,
  InterstitialAd,
  AdEventType,
  BannerAd as NativeBannerAd,
  BannerAdSize as NativeBannerAdSize,
  TestIds as NativeTestIds,
} from 'react-native-google-mobile-ads';

// Ad Unit IDs
export const AD_UNIT_IDS = {
  REWARDED: 'ca-app-pub-9533265028371895/7614059534',
  BANNER: 'ca-app-pub-9533265028371895/3866386218',
  INTERSTITIAL: 'ca-app-pub-9533265028371895/2757585578',
};

export const isNativeAdsAvailable = (): boolean => true;

let adsInitialized = false;
let rewardedAd: any = null;
let rewardedAdLoaded = false;
let interstitialAd: any = null;
let interstitialAdLoaded = false;

// Initialize Mobile Ads SDK
export const initializeAds = async (): Promise<boolean> => {
  if (adsInitialized) return true;

  try {
    // Request tracking transparency on iOS
    if (Platform.OS === 'ios') {
      try {
        const { requestTrackingPermissionsAsync } = require('expo-tracking-transparency');
        await requestTrackingPermissionsAsync();
      } catch (e) {
        console.log('Tracking transparency not available:', e);
      }
    }

    await mobileAds().initialize();
    adsInitialized = true;
    console.log('AdMob initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize AdMob:', error);
    return false;
  }
};

// ==================== REWARDED ADS ====================

export const loadRewardedAd = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!adsInitialized) {
      resolve(false);
      return;
    }

    try {
      rewardedAd = RewardedAd.createForAdRequest(AD_UNIT_IDS.REWARDED);
      rewardedAdLoaded = false;

      rewardedAd.addAdEventListener(
        RewardedAdEventType.LOADED,
        () => {
          rewardedAdLoaded = true;
          resolve(true);
        }
      );

      rewardedAd.addAdEventListener(
        'error',
        (error: any) => {
          console.error('Rewarded ad failed to load:', error);
          rewardedAdLoaded = false;
          resolve(false);
        }
      );

      rewardedAd.load();

      setTimeout(() => {
        if (!rewardedAdLoaded) {
          resolve(false);
        }
      }, 10000);
    } catch (error) {
      console.error('Error loading rewarded ad:', error);
      resolve(false);
    }
  });
};

export const showRewardedAd = (): Promise<{ type: string; amount: number } | null> => {
  return new Promise((resolve) => {
    if (!rewardedAd || !rewardedAdLoaded) {
      resolve(null);
      return;
    }

    try {
      let rewarded = false;

      rewardedAd.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        (reward: { type: string; amount: number }) => {
          rewarded = true;
          rewardedAdLoaded = false;
          resolve(reward);
        }
      );

      rewardedAd.addAdEventListener(
        'closed',
        () => {
          rewardedAdLoaded = false;
          if (!rewarded) {
            resolve(null);
          }
          loadRewardedAd();
        }
      );

      rewardedAd.show();
    } catch (error) {
      console.error('Error showing rewarded ad:', error);
      rewardedAdLoaded = false;
      resolve(null);
    }
  });
};

export const isRewardedAdReady = (): boolean => rewardedAdLoaded;

// ==================== INTERSTITIAL ADS ====================

export const loadInterstitialAd = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!adsInitialized) {
      resolve(false);
      return;
    }

    try {
      interstitialAd = InterstitialAd.createForAdRequest(AD_UNIT_IDS.INTERSTITIAL);
      interstitialAdLoaded = false;

      interstitialAd.addAdEventListener(
        AdEventType.LOADED,
        () => {
          interstitialAdLoaded = true;
          resolve(true);
        }
      );

      interstitialAd.addAdEventListener(
        'error',
        (error: any) => {
          console.error('Interstitial ad failed to load:', error);
          interstitialAdLoaded = false;
          resolve(false);
        }
      );

      interstitialAd.load();

      setTimeout(() => {
        if (!interstitialAdLoaded) {
          resolve(false);
        }
      }, 10000);
    } catch (error) {
      console.error('Error loading interstitial ad:', error);
      resolve(false);
    }
  });
};

export const showInterstitialAd = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!interstitialAd || !interstitialAdLoaded) {
      resolve(false);
      return;
    }

    try {
      interstitialAd.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          interstitialAdLoaded = false;
          resolve(true);
          // Pre-load next interstitial
          loadInterstitialAd();
        }
      );

      interstitialAd.show();
    } catch (error) {
      console.error('Error showing interstitial ad:', error);
      interstitialAdLoaded = false;
      resolve(false);
    }
  });
};

export const isInterstitialAdReady = (): boolean => interstitialAdLoaded;

// ==================== BANNER & UTILS ====================

export const getNativeBannerAd = () => NativeBannerAd;
export const getNativeBannerAdSize = () => NativeBannerAdSize;
export const getNativeTestIds = () => NativeTestIds;
export const isAdsInitialized = () => adsInitialized;
