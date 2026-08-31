import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { REWARDED_AD_COOLDOWN_MS, REWARDED_AD_GEMS } from '../constants/ads';
import { showRewardedAd, useAdsStatus } from '../services/adsService';
import { usePlayerStore } from '../stores/playerStore';
import { isBackendConfigured, isServerBackedPlayerId, rewardApi } from './useApi';

let lastGrantAt = 0;

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

  // Tick the visible cooldown once per second while it's active.
  useEffect(() => {
    const update = () => setCooldownMs(Math.max(0, lastGrantAt + REWARDED_AD_COOLDOWN_MS - Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const available = adsReady && rewardedReady && !busy && cooldownMs <= 0;

  const watch = useCallback(async (): Promise<'granted' | 'not_earned' | 'unavailable' | 'error'> => {
    if (busy) return 'unavailable';
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
          Alert.alert('Reward earned', `+${REWARDED_AD_GEMS} gems added.`);
          return 'granted';
        }
      }

      // Local / guest profile.
      store.addGems(REWARDED_AD_GEMS);
      lastGrantAt = Date.now();
      setCooldownMs(REWARDED_AD_COOLDOWN_MS);
      Alert.alert('Reward earned', `+${REWARDED_AD_GEMS} gems added.`);
      return 'granted';
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return {
    /** Ad is loaded, cooldown over, not currently showing. */
    available,
    /** SDK is up at all (used to decide whether to render the button). */
    adsReady,
    busy,
    cooldownSeconds: Math.ceil(cooldownMs / 1000),
    gemsPerAd: REWARDED_AD_GEMS,
    watch,
  };
};
