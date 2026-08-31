import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REWARDED_ADS_PER_DAY, REWARDED_AD_COOLDOWN_MS, REWARDED_AD_GEMS } from '../constants/ads';
import { showRewardedAd, useAdsStatus } from '../services/adsService';
import { usePlayerStore } from '../stores/playerStore';
import { isBackendConfigured, isServerBackedPlayerId, rewardApi } from './useApi';

let lastGrantAt = 0;

// ---- Daily cap (per device) -------------------------------------------------
const DAILY_KEY = 'rewarded_gems_daily_v1';
const todayKey = () => new Date().toISOString().slice(0, 10);
let dailyCount = 0;
let dailyDay = '';
let dailyLoaded = false;

const loadDaily = async () => {
  if (dailyLoaded) return;
  dailyLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(DAILY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { day?: string; count?: number };
      if (parsed.day === todayKey()) {
        dailyDay = parsed.day;
        dailyCount = Math.max(0, Math.floor(parsed.count ?? 0));
      }
    }
  } catch {
    // best-effort; cap still enforced in-session
  }
};

const recordDailyWatch = () => {
  const day = todayKey();
  if (dailyDay !== day) { dailyDay = day; dailyCount = 0; }
  dailyCount += 1;
  void AsyncStorage.setItem(DAILY_KEY, JSON.stringify({ day: dailyDay, count: dailyCount })).catch(() => {});
};

const dailyRemaining = () => {
  if (dailyDay !== todayKey()) return REWARDED_ADS_PER_DAY;
  return Math.max(0, REWARDED_ADS_PER_DAY - dailyCount);
};

/**
 * "Watch a video → +gems" flow shared by the Shop and the Game Over screen.
 *
 * - Shows the preloaded rewarded ad.
 * - Grants gems ONLY when AdMob reports the reward was earned.
 * - Server-backed players are credited through /rewards/claim (server enforces
 *   the cooldown and the amount); local/guest players are credited on-device.
 */
export const useRewardedGems = () => {
  const rewardedReady = useAdsStatus((s) => s.rewardedReady);
  const adsReady = useAdsStatus((s) => s.ready);
  const [busy, setBusy] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [remainingToday, setRemainingToday] = useState(REWARDED_ADS_PER_DAY);

  useEffect(() => {
    void loadDaily().then(() => setRemainingToday(dailyRemaining()));
  }, []);

  // Tick the visible cooldown once per second while it's active.
  useEffect(() => {
    const update = () => setCooldownMs(Math.max(0, lastGrantAt + REWARDED_AD_COOLDOWN_MS - Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const available = adsReady && rewardedReady && !busy && cooldownMs <= 0 && remainingToday > 0;

  const watch = useCallback(async (): Promise<'granted' | 'not_earned' | 'unavailable' | 'error'> => {
    if (busy) return 'unavailable';
    if (dailyRemaining() <= 0) {
      Alert.alert('Daily limit reached', 'Come back tomorrow for more free gems.');
      setRemainingToday(0);
      return 'unavailable';
    }
    setBusy(true);
    try {
      const result = await showRewardedAd();
      if (result === 'unavailable') {
        Alert.alert('No video available', 'Try again in a moment.');
        return 'unavailable';
      }
      if (result !== 'earned') return 'not_earned';

      const store = usePlayerStore.getState();
      const playerId = store.playerId;

      if (isBackendConfigured() && isServerBackedPlayerId(playerId)) {
        try {
          const res = await rewardApi.claim({
            player_id: playerId as string,
            reward_type: 'gems',
            ad_type: 'rewarded',
          });
          const newBalance = res.data?.new_gem_balance;
          if (typeof newBalance === 'number') {
            store.setGems(newBalance);
          } else {
            store.addGems(res.data?.gems_granted ?? REWARDED_AD_GEMS);
          }
          lastGrantAt = Date.now();
          setCooldownMs(REWARDED_AD_COOLDOWN_MS);
          recordDailyWatch();
          setRemainingToday(dailyRemaining());
          Alert.alert('Reward earned', `+${res.data?.gems_granted ?? REWARDED_AD_GEMS} gems added.`);
          return 'granted';
        } catch (e: any) {
          const status = e?.response?.status;
          const detail = e?.response?.data?.detail;
          if (status === 429) {
            // Server-side cooldown still running (e.g. app relaunched within 30 s of a claim).
            Alert.alert('Cooldown active', typeof detail === 'string' ? detail : 'Try again shortly.');
            return 'error';
          }
          // Network hiccup after a fully-watched ad: credit locally so the player isn't stiffed.
          // (If the request did reach the server, the next profile sync reconciles the balance.)
          store.addGems(REWARDED_AD_GEMS);
          lastGrantAt = Date.now();
          setCooldownMs(REWARDED_AD_COOLDOWN_MS);
          recordDailyWatch();
          setRemainingToday(dailyRemaining());
          Alert.alert('Reward earned', `+${REWARDED_AD_GEMS} gems added.`);
          return 'granted';
        }
      }

      // Local / guest profile.
      store.addGems(REWARDED_AD_GEMS);
      lastGrantAt = Date.now();
      setCooldownMs(REWARDED_AD_COOLDOWN_MS);
      recordDailyWatch();
      setRemainingToday(dailyRemaining());
      Alert.alert('Reward earned', `+${REWARDED_AD_GEMS} gems added.`);
      return 'granted';
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return {
    /** Ad is loaded, cooldown over, daily cap not hit, not currently showing. */
    available,
    /** Rewarded videos left today (device-local). */
    remainingToday,
    /** SDK is up at all (used to decide whether to render the button). */
    adsReady,
    busy,
    cooldownSeconds: Math.ceil(cooldownMs / 1000),
    gemsPerAd: REWARDED_AD_GEMS,
    watch,
  };
};
