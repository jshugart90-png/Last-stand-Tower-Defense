import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Catches render errors in release so a JS exception surfaces as a screen
 * instead of an instant TestFlight quit (when the red box is unavailable).
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* production: no console */
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.box}>
          <Text style={styles.title}>Couldn&apos;t start the app</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.mono}>{this.state.error.message}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    padding: 24,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  scroll: { maxHeight: '60%' },
  mono: { color: '#f88', fontSize: 12 },
});
