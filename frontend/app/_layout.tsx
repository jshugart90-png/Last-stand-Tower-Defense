import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableScreens } from 'react-native-screens';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { isBackendConfigured } from '../src/hooks/useApi';
import { initializeAudio, refreshAudioModeOnForeground } from '../src/services/audioService';
import { RootErrorBoundary } from './RootErrorBoundary';
import { TacticalTheme } from '../src/theme/colors';

enableScreens(true);

void SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});

    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          await initializeAudio();
        } catch {
          // audio is optional; never crash launch
        }
        if (!isBackendConfigured()) return;
        try {
          const { initializeIAP } = await import('../src/services/iapService');
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
