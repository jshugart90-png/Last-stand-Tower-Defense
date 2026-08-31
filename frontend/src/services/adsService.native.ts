/**
 * Google AdMob service (native only — see adsService.web.ts for the no-op twin).
 *
 * Responsibilities:
 *  - Request App Tracking Transparency (iOS) and UMP consent (EEA/UK) before init.
 *  - Initialize the Mobile Ads SDK once (retried on next foreground if consent
 *    could not be fetched, e.g. first launch offline).
 *  - Keep ONE interstitial and ONE rewarded ad instance, preloaded, and reload
 *    the same instance after use (the library keeps a native listener per
 *    instance, so creating new instances on every reload would leak).
 *  - Enforce interstitial frequency caps and the premium/ad-free flag.
 *
 * Everything here is fail-soft: any missing native module or SDK error just
 * disables ads for the session — it must never crash the game.
 */
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import {
  ADS_SUPPORTED,
  INTERSTITIAL_MIN_INTERVAL_MS,
  INTERSTITIAL_SKIP_FIRST_GAME_OVERS,
  USE_TEST_ADS,
  getAdUnitId,
} from '../constants/ads';
import { usePlayerStore } from '../stores/playerStore';

// ---- Reactive status for UI -------------------------------------------------

interface AdsStatus {
  /** SDK initialized and allowed to request ads. */
  ready: boolean;
  /** A rewarded video is loaded and can be shown right now. */
  rewardedReady: boolean;
  /** An interstitial is loaded. */
  interstitialReady: boolean;
  /** Ads permanently off for this session (no native module / SDK init threw). */
  disabled: boolean;
  /** True when the user can be shown a privacy-options (consent) form. */
  privacyOptionsAvailable: boolean;
  set: (patch: Partial<Omit<AdsStatus, 'set'>>) => void;
}

export const useAdsStatus = create<AdsStatus>((set) => ({
  ready: false,
  rewardedReady: false,
  interstitialReady: false,
  disabled: !ADS_SUPPORTED,
  privacyOptionsAvailable: false,
  set: (patch) => set(patch),
}));

// ---- Lazy native module -----------------------------------------------------

type GMA = typeof import('react-native-google-mobile-ads');
type InterstitialAd = import('react-native-google-mobile-ads').InterstitialAd;
type RewardedAd = import('react-native-google-mobile-ads').RewardedAd;

let gma: GMA | null = null;

const loadModule = (): GMA | null => {
  if (gma) return gma;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    gma = require('react-native-google-mobile-ads') as GMA;
    return gma;
  } catch (e) {
    if (__DEV__) console.warn('[ads] react-native-google-mobile-ads not available:', e);
    useAdsStatus.getState().set({ disabled: true });
    return null;
  }
};

// ---- Helpers ----------------------------------------------------------------

/** Players flagged premium (server-side purchase) never see banners or interstitials. */
export const isAdFree = (): boolean => Boolean(usePlayerStore.getState().premium);

export const adsEnabled = (): boolean => {
  const s = useAdsStatus.getState();
  return ADS_SUPPORTED && !s.disabled && s.ready;
};

/** Should a banner render on menu screens right now? */
export const shouldShowBanner = (): boolean => adsEnabled() && !isAdFree();

/** How long we wait for OPENED after show() before assuming the ad never presented. */
const PRESENT_TIMEOUT_MS = 15_000;

// ---- Init -------------------------------------------------------------------

let initPromise: Promise<boolean> | null = null;

const requestTrackingPermission = async (): Promise<void> => {
  if (Platform.OS !== 'ios') return;
  try {
    const att = await import('expo-tracking-transparency');
    const current = await att.getTrackingPermissionsAsync();
    if (current.status === 'undetermined') {
      await att.requestTrackingPermissionsAsync();
    }
  } catch {
    // ATT is best-effort; ads still serve (non-personalized) without it.
  }
};

/** Returns true when ads may be requested. Throws are swallowed → false (caller retries later). */
const gatherConsent = async (mod: GMA): Promise<boolean> => {
  try {
    const info = await mod.AdsConsent.gatherConsent();
    useAdsStatus.getState().set({
      privacyOptionsAvailable:
        info.privacyOptionsRequirementStatus === mod.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
    });
    return info.canRequestAds;
  } catch (e) {
    if (__DEV__) console.warn('[ads] consent gathering failed (will retry on foreground):', e);
    try {
      const info = await mod.AdsConsent.getConsentInfo();
      return info.canRequestAds;
    } catch {
      return false;
    }
  }
};

/**
 * Initialize ads. Safe to call multiple times; concurrent calls share one attempt.
 * If consent could not be gathered (offline), the attempt is NOT memoized so the
 * next call (foreground / next launch of a screen) retries.
 */
export const initializeAds = async (): Promise<boolean> => {
  if (!ADS_SUPPORTED) return false;
  if (useAdsStatus.getState().ready) return true;
  if (useAdsStatus.getState().disabled) return false;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const mod = loadModule();
    if (!mod) return false;

    try {
      // ATT first so the SDK can read the IDFA decision, then UMP consent.
      await requestTrackingPermission();
      const canRequestAds = await gatherConsent(mod);
      if (!canRequestAds) {
        // Transient (offline) or user declined in the EEA form. Retry later; don't hard-disable.
        return false;
      }

      await mod.default().setRequestConfiguration({
        maxAdContentRating: mod.MaxAdContentRating.T,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
      });
      await mod.default().initialize();

      useAdsStatus.getState().set({ ready: true });
      if (__DEV__ || USE_TEST_ADS) console.log('[ads] initialized (test ads:', USE_TEST_ADS, ')');

      ensureInterstitial();
      ensureRewarded();
      return true;
    } catch (e) {
      // SDK itself failed — treat as a hard failure for this session.
      if (__DEV__) console.warn('[ads] init failed:', e);
      useAdsStatus.getState().set({ disabled: true });
      return false;
    } finally {
      // Allow a retry unless we're ready or hard-disabled.
      initPromise = null;
    }
  })();

  return initPromise;
};

/** Let users revisit their consent choice (Settings screen). */
export const showPrivacyOptions = async (): Promise<void> => {
  const mod = loadModule();
  if (!mod) return;
  try {
    await mod.AdsConsent.showPrivacyOptionsForm();
  } catch {
    // Form not required / not available — nothing to do.
  }
};

// ---- Retry scheduling -------------------------------------------------------

const RELOAD_AFTER_CLOSE_MS = 500;
const RELOAD_AFTER_ERROR_MS = 60_000;

let interstitialRetry: ReturnType<typeof setTimeout> | null = null;
let rewardedRetry: ReturnType<typeof setTimeout> | null = null;

const schedule = (
  slot: 'interstitial' | 'rewarded',
  fn: () => void,
  delayMs: number,
) => {
  const current = slot === 'interstitial' ? interstitialRetry : rewardedRetry;
  if (current) clearTimeout(current);
  const handle = setTimeout(() => {
    if (slot === 'interstitial') interstitialRetry = null;
    else rewardedRetry = null;
    fn();
  }, delayMs);
  if (slot === 'interstitial') interstitialRetry = handle;
  else rewardedRetry = handle;
};

// ---- Interstitial -----------------------------------------------------------

let interstitial: InterstitialAd | null = null;
let interstitialShowing = false;
let lastInterstitialAt = 0;
let gameOversSeen = 0;

/** Create the single interstitial instance (once) and make sure a load is in flight. */
const ensureInterstitial = () => {
  const mod = loadModule();
  if (!mod || !adsEnabled() || isAdFree()) return;

  if (!interstitial) {
    const ad = mod.InterstitialAd.createForAdRequest(getAdUnitId('interstitial'), {
      requestNonPersonalizedAdsOnly: false,
    });
    interstitial = ad;
    // Persistent listener for the lifetime of the instance.
    ad.addAdEventsListener(({ type, payload }) => {
      if (type === mod.AdEventType.LOADED) {
        useAdsStatus.getState().set({ interstitialReady: true });
      } else if (type === mod.AdEventType.CLOSED) {
        useAdsStatus.getState().set({ interstitialReady: false });
        schedule('interstitial', ensureInterstitial, RELOAD_AFTER_CLOSE_MS);
      } else if (type === mod.AdEventType.ERROR) {
        useAdsStatus.getState().set({ interstitialReady: false });
        if (__DEV__) console.warn('[ads] interstitial error:', payload);
        schedule('interstitial', ensureInterstitial, RELOAD_AFTER_ERROR_MS);
      }
    });
  }
  // load() is a no-op if already loaded or a load is in flight.
  if (!interstitialShowing) interstitial.load();
};

/**
 * Show an interstitial after a game over, respecting caps.
 * Resolves when the ad is closed (or immediately if nothing was shown).
 */
export const showGameOverInterstitial = async (): Promise<boolean> => {
  gameOversSeen += 1;
  if (!adsEnabled() || isAdFree()) return false;
  if (gameOversSeen <= INTERSTITIAL_SKIP_FIRST_GAME_OVERS) return false;
  if (Date.now() - lastInterstitialAt < INTERSTITIAL_MIN_INTERVAL_MS) return false;
  if (interstitialShowing) return false;

  const mod = loadModule();
  if (!mod) return false;
  const ad = interstitial;
  if (!ad || !ad.loaded) {
    ensureInterstitial();
    return false;
  }

  interstitialShowing = true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let opened = false;
    let presentGuard: ReturnType<typeof setTimeout> | null = null;

    const done = (shown: boolean) => {
      if (settled) return;
      settled = true;
      if (presentGuard) clearTimeout(presentGuard);
      unsub();
      interstitialShowing = false;
      resolve(shown);
    };
    const unsub = ad.addAdEventsListener(({ type }) => {
      if (type === mod.AdEventType.OPENED) {
        opened = true;
        if (presentGuard) clearTimeout(presentGuard);
      } else if (type === mod.AdEventType.CLOSED) {
        done(true);
      } else if (type === mod.AdEventType.ERROR) {
        done(false);
      }
    });

    lastInterstitialAt = Date.now();
    ad.show().catch(() => done(false));
    // Only guards against "never presented"; once OPENED we wait for CLOSED however long it takes.
    presentGuard = setTimeout(() => {
      if (!opened) done(false);
    }, PRESENT_TIMEOUT_MS);
  });
};

// ---- Rewarded ---------------------------------------------------------------

let rewarded: RewardedAd | null = null;
let rewardedShowing = false;

const ensureRewarded = () => {
  const mod = loadModule();
  if (!mod || !adsEnabled()) return;

  if (!rewarded) {
    const ad = mod.RewardedAd.createForAdRequest(getAdUnitId('rewarded'), {
      requestNonPersonalizedAdsOnly: false,
    });
    rewarded = ad;
    ad.addAdEventsListener(({ type, payload }) => {
      if (type === mod.RewardedAdEventType.LOADED) {
        useAdsStatus.getState().set({ rewardedReady: true });
      } else if (type === mod.AdEventType.CLOSED) {
        useAdsStatus.getState().set({ rewardedReady: false });
        schedule('rewarded', ensureRewarded, RELOAD_AFTER_CLOSE_MS);
      } else if (type === mod.AdEventType.ERROR) {
        useAdsStatus.getState().set({ rewardedReady: false });
        if (__DEV__) console.warn('[ads] rewarded error:', payload);
        schedule('rewarded', ensureRewarded, RELOAD_AFTER_ERROR_MS);
      }
    });
  }
  if (!rewardedShowing) rewarded.load();
};

export type RewardedResult = 'earned' | 'dismissed' | 'unavailable';

/**
 * Show the preloaded rewarded video.
 * Resolves 'earned' only after AdMob fires EARNED_REWARD (user watched to completion).
 * A second call while one is showing resolves 'unavailable' (prevents double grants).
 */
export const showRewardedAd = async (): Promise<RewardedResult> => {
  if (!adsEnabled()) return 'unavailable';
  if (rewardedShowing) return 'unavailable';
  const mod = loadModule();
  if (!mod) return 'unavailable';
  const ad = rewarded;
  if (!ad || !ad.loaded) {
    ensureRewarded();
    return 'unavailable';
  }

  rewardedShowing = true;
  return new Promise<RewardedResult>((resolve) => {
    let earned = false;
    let opened = false;
    let settled = false;
    let presentGuard: ReturnType<typeof setTimeout> | null = null;

    const done = (result: RewardedResult) => {
      if (settled) return;
      settled = true;
      if (presentGuard) clearTimeout(presentGuard);
      unsub();
      rewardedShowing = false;
      resolve(result);
    };
    const unsub = ad.addAdEventsListener(({ type }) => {
      if (type === mod.AdEventType.OPENED) {
        opened = true;
        if (presentGuard) clearTimeout(presentGuard);
      } else if (type === mod.RewardedAdEventType.EARNED_REWARD) {
        earned = true;
      } else if (type === mod.AdEventType.CLOSED) {
        done(earned ? 'earned' : 'dismissed');
      } else if (type === mod.AdEventType.ERROR) {
        done(earned ? 'earned' : 'unavailable');
      }
    });

    ad.show().catch(() => done('unavailable'));
    presentGuard = setTimeout(() => {
      if (!opened) done('unavailable');
    }, PRESENT_TIMEOUT_MS);
  });
};

// ---- Foreground housekeeping -----------------------------------------------

AppState.addEventListener('change', (next) => {
  if (next !== 'active' || !ADS_SUPPORTED) return;
  if (!useAdsStatus.getState().ready) {
    // Consent may have failed offline on first launch — try again now.
    void initializeAds();
    return;
  }
  if (!rewardedShowing && !rewarded?.loaded) ensureRewarded();
  if (!interstitialShowing && !interstitial?.loaded && !isAdFree()) ensureInterstitial();
});
