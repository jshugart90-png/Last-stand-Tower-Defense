import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { AD_UNIT_IDS, getNativeBannerAd, getNativeBannerAdSize, isAdsInitialized } from '../services/adService';

interface BannerAdComponentProps {
  isPremium?: boolean;
}

const BannerAdComponent: React.FC<BannerAdComponentProps> = ({ isPremium = false }) => {
  const [adError, setAdError] = useState(false);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    // Check if we're in a native environment with ads initialized
    const nativeAvailable = (Platform.OS === 'ios' || Platform.OS === 'android') && isAdsInitialized();
    setIsNative(nativeAvailable);
  }, []);

  // Don't show ads for premium users
  if (isPremium) return null;

  // In native environment with ads available
  if (isNative) {
    const NativeBannerAd = getNativeBannerAd();
    const NativeBannerAdSize = getNativeBannerAdSize();

    if (NativeBannerAd && NativeBannerAdSize && !adError) {
      return (
        <View style={styles.container}>
          <NativeBannerAd
            unitId={AD_UNIT_IDS.BANNER}
            size={NativeBannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{
              requestNonPersonalizedAdsOnly: true,
            }}
            onAdFailedToLoad={(error: any) => {
              console.log('Banner ad failed to load:', error);
              setAdError(true);
            }}
          />
        </View>
      );
    }
  }

  // Fallback placeholder for web/Expo Go/error
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Ad Space</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#16213e',
  },
  placeholder: {
    height: 50,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  placeholderText: {
    color: '#444',
    fontSize: 12,
  },
});

export default BannerAdComponent;
