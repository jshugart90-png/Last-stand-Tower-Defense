import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { usePlayerStore } from '../src/stores/playerStore';
import { TOWERS, TOWER_UNLOCK_PRICES, TowerType } from '../src/constants/game';
import { playSfx, canPlayUiSfx } from '../src/services/audioService';
import { TacticalTheme } from '../src/theme/colors';

const toNum = (v: string | string[] | undefined, fallback = 0): number => {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

export default function RunResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const playerStore = usePlayerStore();

  const wave = toNum(params.wave);
  const score = toNum(params.score);
  const kills = toNum(params.kills);
  const towers = toNum(params.towers);
  const xp = toNum(params.xp);
  const gems = toNum(params.gems);
  const bestDelta = toNum(params.bestDelta);
  const comboBonus = toNum(params.comboBonus);
  const comboCount = toNum(params.comboCount);
  const oneMoreRun = String(Array.isArray(params.oneMoreRun) ? params.oneMoreRun[0] : params.oneMoreRun || '0') === '1';
  const challenge = String(Array.isArray(params.challenge) ? params.challenge[0] : params.challenge || 'Daily Challenge');
  React.useEffect(() => {
    if (!canPlayUiSfx()) return;
    if (bestDelta > 0) {
      playSfx('record');
    } else if (comboBonus > 0) {
      playSfx('combo');
    }
  }, [bestDelta, comboBonus]);
  const nextUnlock = React.useMemo(() => {
    const locked = (Object.keys(TOWER_UNLOCK_PRICES) as TowerType[])
      .filter((t) => !playerStore.unlockedTowers.includes(t))
      .sort((a, b) => TOWER_UNLOCK_PRICES[a] - TOWER_UNLOCK_PRICES[b]);
    if (locked.length === 0) return null;
    const tower = locked[0];
    const cost = TOWER_UNLOCK_PRICES[tower];
    return {
      tower,
      name: TOWERS[tower].name,
      cost,
      remaining: Math.max(0, cost - playerStore.gems),
    };
  }, [playerStore.unlockedTowers, playerStore.gems]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace('/')}
          style={styles.homeHeaderButton}
          accessibilityRole="button"
          accessibilityLabel="Home"
        >
          <Ionicons name="home" size={22} color="#fff" />
          <Text style={styles.homeHeaderText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Run Results</Text>
        <View style={styles.closeButton} />
      </View>

      <View style={styles.challengeCard}>
        <Text style={styles.challengeLabel}>Challenge</Text>
        <Text style={styles.challengeName}>{challenge}</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.card}>
          <MaterialCommunityIcons name="waves" size={20} color={TacticalTheme.accent} />
          <Text style={styles.label}>Wave</Text>
          <Text style={styles.value}>{wave}</Text>
        </View>
        <View style={styles.card}>
          <Ionicons name="trophy-outline" size={20} color="#FFD700" />
          <Text style={styles.label}>Score</Text>
          <Text style={styles.value}>{score}</Text>
        </View>
        <View style={styles.card}>
          <Ionicons name="skull-outline" size={20} color="#E74C3C" />
          <Text style={styles.label}>Enemies defeated</Text>
          <Text style={styles.value}>{kills}</Text>
        </View>
        <View style={styles.card}>
          <Ionicons name="hardware-chip-outline" size={20} color="#9B59B6" />
          <Text style={styles.label}>Towers</Text>
          <Text style={styles.value}>{towers}</Text>
        </View>
      </View>

      <View style={styles.rewardCard}>
        <Text style={styles.rewardTitle}>Rewards</Text>
        <View style={styles.rewardRow}>
          <Text style={styles.rewardText}>XP Earned</Text>
          <Text style={styles.rewardValue}>+{xp}</Text>
        </View>
        <View style={styles.rewardRow}>
          <Text style={styles.rewardText}>Gems Earned</Text>
          <Text style={styles.rewardValue}>+{gems}</Text>
        </View>
        {comboBonus > 0 && (
          <View style={styles.rewardRow}>
            <Text style={styles.rewardText}>Combo Bonus (Run {comboCount})</Text>
            <Text style={styles.rewardValue}>+{comboBonus}</Text>
          </View>
        )}
        <View style={styles.rewardRow}>
          <Text style={styles.rewardText}>Personal Best Delta</Text>
          <Text style={styles.rewardValue}>{bestDelta > 0 ? `+${bestDelta} waves` : 'No new record'}</Text>
        </View>
      </View>

      {nextUnlock && (
        <View style={styles.nextUnlockCard}>
          <Text style={styles.nextUnlockTitle}>Next Unlock</Text>
          <Text style={styles.nextUnlockName}>{nextUnlock.name}</Text>
          <Text style={styles.nextUnlockText}>
            Cost: {nextUnlock.cost} gems
            {nextUnlock.remaining > 0 ? ` • ${nextUnlock.remaining} to go` : ' • Ready to unlock'}
          </Text>
          <TouchableOpacity
            style={styles.unlockCta}
            onPress={() =>
              router.push({
                pathname: '/shop',
                params: {
                  highlightTower: nextUnlock.tower,
                },
              })
            }
          >
            <Text style={styles.unlockCtaText}>
              {nextUnlock.remaining > 0 ? 'Go to Shop' : `Unlock ${nextUnlock.name}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.ctaHome} onPress={() => router.replace('/')}>
        <Ionicons name="home" size={20} color="#fff" />
        <Text style={styles.ctaText}>Back to home</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cta} onPress={() => router.replace('/game')}>
        <FontAwesome5 name="redo" size={16} color="#fff" />
        <Text style={styles.ctaText}>Play again</Text>
      </TouchableOpacity>
      <Text style={styles.ctaHint}>
        {oneMoreRun
          ? 'You are very close to a mission payout. One more run could finish it.'
          : 'One more run today can complete missions and boost rank.'}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TacticalTheme.bgElevated, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  homeHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2ECC71',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  homeHeaderText: { color: TacticalTheme.white, fontSize: 14, fontWeight: '700' },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: TacticalTheme.white, fontSize: 24, fontWeight: 'bold' },
  challengeCard: {
    backgroundColor: TacticalTheme.surfaceDeep,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    padding: 12,
    marginBottom: 12,
  },
  challengeLabel: { color: TacticalTheme.textMuted, fontSize: 12 },
  challengeName: { color: TacticalTheme.white, fontSize: 18, fontWeight: '700', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  card: {
    width: '48%',
    backgroundColor: TacticalTheme.surfaceDeep,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    padding: 12,
  },
  label: { color: TacticalTheme.textMuted, fontSize: 12, marginTop: 6 },
  value: { color: TacticalTheme.white, fontSize: 22, fontWeight: 'bold' },
  rewardCard: {
    backgroundColor: TacticalTheme.surfaceDeep,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    padding: 14,
    marginBottom: 14,
  },
  rewardTitle: { color: TacticalTheme.white, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rewardText: { color: TacticalTheme.textMuted },
  rewardValue: { color: '#2ECC71', fontWeight: '700' },
  nextUnlockCard: {
    backgroundColor: TacticalTheme.surfaceDeep,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    padding: 14,
    marginBottom: 14,
  },
  nextUnlockTitle: { color: TacticalTheme.white, fontSize: 16, fontWeight: '700' },
  nextUnlockName: { color: TacticalTheme.accent, fontSize: 15, marginTop: 4, fontWeight: '700' },
  nextUnlockText: { color: TacticalTheme.textMuted, marginTop: 4, fontSize: 12 },
  unlockCta: { marginTop: 10, backgroundColor: '#2ECC71', borderRadius: 8, alignItems: 'center', paddingVertical: 10 },
  unlockCtaText: { color: TacticalTheme.white, fontSize: 13, fontWeight: '700' },
  ctaHome: {
    marginTop: 8,
    backgroundColor: '#2ECC71',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  cta: {
    marginTop: 10,
    backgroundColor: TacticalTheme.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  ctaText: { color: TacticalTheme.white, fontSize: 16, fontWeight: 'bold' },
  ctaHint: { color: TacticalTheme.textMuted, textAlign: 'center', fontSize: 12, marginTop: 8 },
});
