import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../src/stores/playerStore';
import { MissionResetHints } from '../src/components/MissionResetHints';

export default function ProgressionScreen() {
  const router = useRouter();
  const playerStore = usePlayerStore();
  const refreshDailyMissions = usePlayerStore((s) => s.refreshDailyMissions);
  const refreshWeeklyMissions = usePlayerStore((s) => s.refreshWeeklyMissions);

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
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progress</Text>
        <View style={styles.gemsBadge}>
          <FontAwesome5 name="gem" size={14} color="#4A90D9" />
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

        <Text style={styles.sectionTitle}>Daily Missions</Text>
        <MissionResetHints />
        {playerStore.dailyMissions.map((mission) => (
          <View key={`daily-${mission.id}`} style={styles.missionCard}>
            <Text style={styles.missionLabel}>{mission.label}</Text>
            <Text style={styles.missionMeta}>
              {mission.completed ? 'Completed' : `${mission.progress}/${mission.target}`} • +{mission.rewardGems} gems
            </Text>
          </View>
        ))}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  gemsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gemsText: {
    color: '#FFD700',
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
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  summaryLabel: {
    color: '#8aa0bf',
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  missionCard: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    padding: 12,
    marginBottom: 8,
  },
  missionLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  missionMeta: {
    color: '#4A90D9',
    fontSize: 12,
  },
  achievementCard: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  achievementLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  achievementDesc: {
    color: '#b4bfd1',
    fontSize: 12,
    marginTop: 2,
  },
  achievementReward: {
    color: '#FFD700',
    fontSize: 12,
    marginTop: 2,
  },
  achievementStatus: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    alignSelf: 'center',
  },
  achievementUnlocked: {
    color: '#2ECC71',
  },
});
