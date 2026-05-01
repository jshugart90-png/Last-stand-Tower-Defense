import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { isBackendConfigured } from '../src/hooks/useApi';
import { initializeAudio } from '../src/services/audioService';

const queryClient = new QueryClient();

export default function RootLayout() {
  useEffect(() => {
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
        } catch (e) {
          console.log('IAP init skipped:', e);
        }
      })();
    });
    return () => task.cancel();
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
          <Stack.Screen name="progression" />
          <Stack.Screen name="run-results" />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
