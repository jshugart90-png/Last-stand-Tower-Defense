import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableScreens } from 'react-native-screens';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, usePathname } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { useFonts } from 'expo-font';
import { initializeAudio, playMusic, refreshAudioModeOnForeground } from '../src/services/audioService';
import { RootErrorBoundary } from '../src/components/RootErrorBoundary';
import { TacticalTheme } from '../src/theme/colors';

enableScreens(true);

void SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

export default function RootLayout() {
  const pathname = usePathname();
  const [fontsLoaded, fontError] = useFonts({
    Display: require('../assets/kenney/font/KenneyFuture.ttf'),
    DisplayNarrow: require('../assets/kenney/font/KenneyFutureNarrow.ttf'),
  });
  useEffect(() => {
    if (pathname === '/game') return;
    void playMusic('menu');
  }, [pathname]);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          await initializeAudio();
          await playMusic('menu');
        } catch {
          // audio is optional; never crash launch
        }
        try {
          const { initializeIAP, setPendingPurchaseHandler } = await import('../src/services/iapService');
          setPendingPurchaseHandler((purchase) => {
            void import('../src/services/arenaPurchase').then((mod) => mod.grantPendingArenaPurchase(purchase));
          });
          await initializeIAP();
        } catch {
          // IAP optional; never crash launch
        }
      })();
    });
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refreshAudioModeOnForeground();
      }
    });
    return () => {
      task.cancel();
      appStateSub.remove();
    };
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: TacticalTheme.bg },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="map-selection" />
              <Stack.Screen name="game" options={{ gestureEnabled: false }} />
              <Stack.Screen name="shop" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="progression" />
              <Stack.Screen name="run-results" />
            </Stack>
          </SafeAreaProvider>
        </QueryClientProvider>
      </RootErrorBoundary>
    </GestureHandlerRootView>
  );
}
