import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../src/stores/playerStore';
import { TacticalTheme } from '../src/theme/colors';
import { DailyMissionsModal } from '../src/components/DailyMissionsModal';
import { PlayerLogoBadge } from '../src/components/PlayerLogoBadge';

export default function ProgressionScreen() {
  const router = useRouter();
  const playerStore = usePlayerStore();
  const refreshDailyMissions = usePlayerStore((s) => s.refreshDailyMissions);
  const refreshWeeklyMissions = usePlayerStore((s) => s.refreshWeeklyMissions);
  const [showDailyMissions, setShowDailyMissions] = React.useState(false);

  useEffect(() => {
    refreshDailyMissions();
    refreshWeeklyMissions();
  }, [refreshDailyMissions, refreshWeeklyMissions]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        refreshDailyMissions();
        refreshWeeklyMissions();
      }
    });
    return () => sub.remove();
  }, [refreshDailyMissions, refreshWeeklyMissions]);

  const unlockedAchievements = playerStore.achievements.filter((a) => a.unlocked).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={TacticalTheme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progress</Text>
        <View style={styles.gemsBadge}>
          <PlayerLogoBadge logoId={playerStore.selectedLogoId} size={22} />
          <FontAwesome5 name="gem" size={14} color={TacticalTheme.accent} />
          <Text style={styles.gemsText}>{playerStore.gems}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Games</Text>
            <Text style={styles.summaryValue}>{playerStore.gamesPlayed}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Best Wave</Text>
            <Text style={styles.summaryValue}>{playerStore.bestWave}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Lifetime Kills</Text>
            <Text style={styles.summaryValue}>{playerStore.lifetimeEnemiesKilled}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Towers Placed</Text>
            <Text style={styles.summaryValue}>{playerStore.lifetimeTowersPlaced}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.dailyMissionsPrimaryButton}
          onPress={() => setShowDailyMissions(true)}
          activeOpacity={0.85}
        >
          <View>
            <Text style={styles.dailyMissionsPrimaryTitle}>Daily Missions</Text>
            <Text style={styles.dailyMissionsPrimarySub}>
              {playerStore.dailyMissions.filter((m) => m.completed).length}/{playerStore.dailyMissions.length} completed
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={TacticalTheme.white} />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Weekly Missions</Text>
        {playerStore.weeklyMissions.map((mission) => (
          <View key={`weekly-${mission.id}`} style={styles.missionCard}>
            <Text style={styles.missionLabel}>{mission.label}</Text>
            <Text style={styles.missionMeta}>
              {mission.completed ? 'Completed' : `${mission.progress}/${mission.target}`} • +{mission.rewardGems} gems
            </Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Achievements ({unlockedAchievements}/{playerStore.achievements.length})</Text>
        {playerStore.achievements.map((achievement) => (
          <View key={achievement.id} style={styles.achievementCard}>
            <View>
              <Text style={styles.achievementLabel}>{achievement.label}</Text>
              <Text style={styles.achievementDesc}>{achievement.description}</Text>
              <Text style={styles.achievementReward}>Reward: {achievement.rewardGems} gems</Text>
            </View>
            <Text style={[styles.achievementStatus, achievement.unlocked && styles.achievementUnlocked]}>
              {achievement.unlocked ? 'Unlocked' : 'Locked'}
            </Text>
          </View>
        ))}
      </ScrollView>

      <DailyMissionsModal
        visible={showDailyMissions}
        missions={playerStore.dailyMissions}
        onClose={() => setShowDailyMissions(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TacticalTheme.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: TacticalTheme.panel,
    borderBottomWidth: 1,
    borderBottomColor: TacticalTheme.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: TacticalTheme.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  gemsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gemsText: {
    color: TacticalTheme.text,
    fontWeight: 'bold',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: TacticalTheme.panel,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
  },
  summaryLabel: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    color: TacticalTheme.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  sectionTitle: {
    color: TacticalTheme.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  dailyMissionsPrimaryButton: {
    backgroundColor: TacticalTheme.accent,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TacticalTheme.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dailyMissionsPrimaryTitle: {
    color: TacticalTheme.white,
    fontSize: 16,
    fontWeight: '800',
  },
  dailyMissionsPrimarySub: {
    color: TacticalTheme.text,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  missionCard: {
    backgroundColor: TacticalTheme.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    padding: 12,
    marginBottom: 8,
  },
  missionLabel: {
    color: TacticalTheme.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  missionMeta: {
    color: TacticalTheme.accent,
    fontSize: 12,
  },
  achievementCard: {
    backgroundColor: TacticalTheme.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  achievementLabel: {
    color: TacticalTheme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  achievementDesc: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  achievementReward: {
    color: TacticalTheme.accent,
    fontSize: 12,
    marginTop: 2,
  },
  achievementStatus: {
    color: TacticalTheme.textSubtle,
    fontSize: 12,
    fontWeight: '700',
    alignSelf: 'center',
  },
  achievementUnlocked: {
    color: TacticalTheme.accent,
  },
});
