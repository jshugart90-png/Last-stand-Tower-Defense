/**
 * Web / no-op twin of adsService.native.ts. Keeps the same exports so screens
 * can import '../src/services/adsService' without platform checks.
 */
import { create } from 'zustand';

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

export type RewardedResult = 'earned' | 'dismissed' | 'unavailable';

export const isAdFree = (): boolean => true;
export const adsEnabled = (): boolean => false;
export const shouldShowBanner = (): boolean => false;
export const initializeAds = async (): Promise<boolean> => false;
export const showPrivacyOptions = async (): Promise<void> => {};
export const showGameOverInterstitial = async (): Promise<boolean> => false;
export const showRewardedAd = async (): Promise<RewardedResult> => 'unavailable';
