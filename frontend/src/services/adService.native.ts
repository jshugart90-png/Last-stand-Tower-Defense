import { Platform } from 'react-native';
import mobileAds, {
  RewardedAd,
  RewardedAdEventType,
  BannerAd as NativeBannerAd,
  BannerAdSize as NativeBannerAdSize,
  TestIds as NativeTestIds,
} from 'react-native-google-mobile-ads';

// Ad Unit IDs
export const AD_UNIT_IDS = {
  REWARDED: 'ca-app-pub-9533265028371895/6436541362',
  BANNER: 'ca-app-pub-9533265028371895/5352492157',
};

export const isNativeAdsAvailable = (): boolean => true;

let adsInitialized = false;
let rewardedAd: any = null;
let rewardedAdLoaded = false;

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

// Load a rewarded ad
export const loadRewardedAd = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!adsInitialized) {
      resolve(false);
      return;
    }

    try {
      rewardedAd = RewardedAd.createForAdRequest(AD_UNIT_IDS.REWARDED);
      rewardedAdLoaded = false;

      const unsubscribeLoaded = rewardedAd.addAdEventListener(
        RewardedAdEventType.LOADED,
        () => {
          rewardedAdLoaded = true;
          resolve(true);
        }
      );

      const unsubscribeError = rewardedAd.addAdEventListener(
        'error',
        (error: any) => {
          console.error('Rewarded ad failed to load:', error);
          rewardedAdLoaded = false;
          resolve(false);
        }
      );

      rewardedAd.load();

      // Timeout after 10 seconds
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

// Show a rewarded ad
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

export const getNativeBannerAd = () => NativeBannerAd;
export const getNativeBannerAdSize = () => NativeBannerAdSize;
export const getNativeTestIds = () => NativeTestIds;
export const isAdsInitialized = () => adsInitialized;
