import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { initializeAds, loadRewardedAd } from '../src/services/adService';
import { initializeIAP } from '../src/services/iapService';

const queryClient = new QueryClient();

export default function RootLayout() {
  useEffect(() => {
    // Initialize ads and IAP on app launch
    const init = async () => {
      try {
        const adsReady = await initializeAds();
        if (adsReady) {
          // Pre-load a rewarded ad
          await loadRewardedAd();
        }
      } catch (e) {
        console.log('Ads init skipped:', e);
      }

      try {
        await initializeIAP();
      } catch (e) {
        console.log('IAP init skipped:', e);
      }
    };

    init();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#1a1a2e' },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="game" options={{ gestureEnabled: false }} />
          <Stack.Screen name="leaderboard" />
          <Stack.Screen name="shop" />
          <Stack.Screen name="settings" />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
