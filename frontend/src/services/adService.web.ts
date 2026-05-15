// Web-safe ad service - no native modules

export const AD_UNIT_IDS = {
  REWARDED: 'ca-app-pub-9533265028371895/7614059534',
  BANNER: 'ca-app-pub-9533265028371895/3866386218',
  INTERSTITIAL: 'ca-app-pub-9533265028371895/2757585578',
};

export const isNativeAdsAvailable = (): boolean => false;

export const initializeAds = async (): Promise<boolean> => {
  return false;
};

export const loadRewardedAd = (): Promise<boolean> => {
  return Promise.resolve(false);
};

export const showRewardedAd = (): Promise<{ type: string; amount: number } | null> => {
  return Promise.resolve(null);
};

export const isRewardedAdReady = (): boolean => false;

// Interstitial stubs
export const loadInterstitialAd = (): Promise<boolean> => {
  return Promise.resolve(false);
};

export const showInterstitialAd = (): Promise<boolean> => {
  return Promise.resolve(false);
};

export const isInterstitialAdReady = (): boolean => false;

export const getNativeBannerAd = () => null;
export const getNativeBannerAdSize = () => null;
export const getNativeTestIds = () => null;
export const isAdsInitialized = () => false;
