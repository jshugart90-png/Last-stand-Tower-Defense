import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { getAdUnitId } from '../constants/ads';
import { useAdsStatus } from '../services/adsService';
import { usePlayerStore } from '../stores/playerStore';

const RETRY_AFTER_NO_FILL_MS = 60_000;

/**
 * Anchored adaptive banner for menu screens (home, shop).
 * Renders nothing until the SDK is ready, and never for premium (ad-free) players.
 * On no-fill it collapses to zero height (no layout jump) and retries after a minute.
 */
export const AdBanner: React.FC<{ placement?: 'home' | 'shop' }> = () => {
  const ready = useAdsStatus((s) => s.ready);
  const disabled = useAdsStatus((s) => s.disabled);
  const premium = usePlayerStore((s) => s.premium);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []);

  if (!ready || disabled || premium) return null;

  const handleFailed = () => {
    setFailed(true);
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      setFailed(false);
      setAttempt((n) => n + 1); // new key → fresh BannerAd → new request
    }, RETRY_AFTER_NO_FILL_MS);
  };

  if (failed) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <BannerAd
        key={attempt}
        unitId={getAdUnitId('banner')}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdFailedToLoad={handleFailed}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AdBanner;
