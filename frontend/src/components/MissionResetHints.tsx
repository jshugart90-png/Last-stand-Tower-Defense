import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  msUntilNextLocalMidnight,
  msUntilNextWeeklyReset,
  formatMissionResetCountdown,
  formatNextDailyResetClock,
} from '../utils/missionReset';
import { TacticalTheme } from '../theme/colors';

const TICK_MS = 30_000;

export function MissionResetHints() {
  const [dailyMs, setDailyMs] = useState(() => msUntilNextLocalMidnight());
  const [weeklyMs, setWeeklyMs] = useState(() => msUntilNextWeeklyReset());

  useEffect(() => {
    const tick = () => {
      setDailyMs(msUntilNextLocalMidnight());
      setWeeklyMs(msUntilNextWeeklyReset());
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.line}>
        <Text style={styles.label}>Daily missions:</Text> resets in{' '}
        <Text style={styles.em}>{formatMissionResetCountdown(dailyMs)}</Text>
        <Text style={styles.meta}> (next day at {formatNextDailyResetClock()})</Text>
      </Text>
      <Text style={styles.line}>
        <Text style={styles.label}>Weekly missions:</Text> resets in{' '}
        <Text style={styles.em}>{formatMissionResetCountdown(weeklyMs)}</Text>
        <Text style={styles.meta}> (each Monday 12:00 AM local)</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
    gap: 6,
  },
  line: {
    color: TacticalTheme.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  label: {
    color: TacticalTheme.text,
    fontWeight: '700',
  },
  em: {
    color: TacticalTheme.accent,
    fontWeight: '800',
  },
  meta: {
    color: TacticalTheme.textSubtle,
    fontWeight: '500',
  },
});
