// Web-safe ad service - no native modules
import { Platform } from 'react-native';

export const AD_UNIT_IDS = {
  REWARDED: 'ca-app-pub-9533265028371895/6436541362',
  BANNER: 'ca-app-pub-9533265028371895/5352492157',
};

export const isNativeAdsAvailable = (): boolean => false;

export const initializeAds = async (): Promise<boolean> => {
  console.log('AdMob not available on web');
  return false;
};

export const loadRewardedAd = (): Promise<boolean> => {
  return Promise.resolve(false);
};

export const showRewardedAd = (): Promise<{ type: string; amount: number } | null> => {
  return Promise.resolve(null);
};

export const isRewardedAdReady = (): boolean => false;

export const getNativeBannerAd = () => null;
export const getNativeBannerAdSize = () => null;
export const getNativeTestIds = () => null;
export const isAdsInitialized = () => false;
