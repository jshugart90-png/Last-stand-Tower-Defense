// Native build: ads disabled — placeholders only (no Google Mobile Ads binary).

export const AD_UNIT_IDS = {
  REWARDED: 'ca-app-pub-9533265028371895/7614059534',
  BANNER: 'ca-app-pub-9533265028371895/3866386218',
  INTERSTITIAL: 'ca-app-pub-9533265028371895/2757585578',
};

export const isNativeAdsAvailable = (): boolean => false;

export const initializeAds = async (): Promise<boolean> => false;

export const loadRewardedAd = (): Promise<boolean> => Promise.resolve(false);

export const showRewardedAd = (): Promise<{ type: string; amount: number } | null> =>
  Promise.resolve(null);

export const isRewardedAdReady = (): boolean => false;

export const loadInterstitialAd = (): Promise<boolean> => Promise.resolve(false);

export const showInterstitialAd = (): Promise<boolean> => Promise.resolve(false);

export const isInterstitialAdReady = (): boolean => false;

export const getNativeBannerAd = () => null;
export const getNativeBannerAdSize = () => null;
export const getNativeTestIds = () => null;
export const isAdsInitialized = () => false;
