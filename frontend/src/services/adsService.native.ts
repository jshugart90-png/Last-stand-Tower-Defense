/**
 * Ads are permanently off. The AdMob account was rejected and monetization is
 * in-app purchases only. This module must not load a native ads SDK.
 */
import { create } from 'zustand';

export type RewardedResult = 'earned' | 'unavailable' | 'closed';

interface AdsStatus {
  ready: boolean;
  rewardedReady: boolean;
  interstitialReady: boolean;
  disabled: boolean;
  privacyOptionsAvailable: boolean;
  set: (patch: Partial<Omit<AdsStatus, 'set'>>) => void;
}

export const useAdsStatus = create<AdsStatus>((set) => ({
  ready: false,
  rewardedReady: false,
  interstitialReady: false,
  disabled: true,
  privacyOptionsAvailable: false,
  set: (patch) => set(patch),
}));

export const isAdFree = (): boolean => true;
export const adsEnabled = (): boolean => false;
export const shouldShowBanner = (): boolean => false;
export const initializeAds = async (): Promise<boolean> => false;
export const showPrivacyOptions = async (): Promise<void> => {};
export const showGameOverInterstitial = async (): Promise<boolean> => false;
export const showRewardedAd = async (): Promise<RewardedResult> => 'unavailable';
