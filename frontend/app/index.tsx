import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../src/stores/playerStore';
import { isBackendConfigured, isServerBackedPlayerId, playerApi } from '../src/hooks/useApi';
import * as Crypto from 'expo-crypto';
import { playSfx } from '../src/services/audioService';
import { ARENA_MAP_LIST } from '../src/constants/arenaMaps';
import { MissionResetHints } from '../src/components/MissionResetHints';
import {
  SESSION_SLAUGHTER_WIN_KILLS,
  SESSION_BOUNTY_TRIUMPHS_NEEDED,
} from '../src/constants/sessionProgress';

// Tutorial overlay component
const TutorialOverlay = ({ onComplete }: { onComplete: () => void }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      icon: 'finger-print',
      title: 'Place Towers',
      description: 'Select a tower, then tap or drag on the field to place it',
    },
    {
      icon: 'shield-checkmark',
      title: 'Defend Your Base',
      description: 'Stop enemies from reaching your base',
    },
    {
      icon: 'trending-up',
      title: 'Upgrade & Survive',
      description: 'Earn gems to upgrade towers and survive longer',
    },
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={tutorialStyles.overlay}>
        <View style={tutorialStyles.card}>
          <Ionicons
            name={steps[step].icon as any}
            size={64}
            color="#4A90D9"
            style={tutorialStyles.icon}
          />
          <Text style={tutorialStyles.title}>{steps[step].title}</Text>
          <Text style={tutorialStyles.description}>{steps[step].description}</Text>
          
          <View style={tutorialStyles.dots}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[tutorialStyles.dot, i === step && tutorialStyles.dotActive]}
              />
            ))}
          </View>
          
          <TouchableOpacity style={tutorialStyles.button} onPress={handleNext}>
            <Text style={tutorialStyles.buttonText}>
              {step < steps.length - 1 ? 'Next' : 'Start Playing!'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const tutorialStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    maxWidth: 350,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    color: '#aaa',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#333',
  },
  dotActive: {
    backgroundColor: '#4A90D9',
  },
  button: {
    backgroundColor: '#4A90D9',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

// Nickname input modal
const NicknameModal = ({ visible, onSubmit }: { visible: boolean; onSubmit: (name: string) => void }) => {
  const [name, setName] = useState('');

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={nicknameStyles.overlay}>
        <View style={nicknameStyles.card}>
          <Text style={nicknameStyles.title}>Enter Your Name</Text>
          <TextInput
            style={nicknameStyles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your nickname"
            placeholderTextColor="#666"
            maxLength={15}
            autoFocus
          />
          <TouchableOpacity
            style={[nicknameStyles.button, !name.trim() && nicknameStyles.buttonDisabled]}
            onPress={() => name.trim() && onSubmit(name.trim())}
            disabled={!name.trim()}
          >
            <Text style={nicknameStyles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

/** Sync in-memory flag when storage already has a non-default name */
function finalizePersistedNameProfile(): void {
  const s = usePlayerStore.getState();
  const n = s.nickname?.trim();
  if (n && n !== 'Player' && !s.hasEnteredNameOnce) {
    usePlayerStore.setState({ hasEnteredNameOnce: true });
  }
}

const nicknameStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    maxWidth: 350,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#0f0f23',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 18,
    width: '100%',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#4A90D9',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default function HomeScreen() {
  const router = useRouter();
  const playerStore = usePlayerStore();
  const refreshDailyMissions = usePlayerStore((s) => s.refreshDailyMissions);
  const refreshWeeklyMissions = usePlayerStore((s) => s.refreshWeeklyMissions);
  const canClaimDailyBonus = usePlayerStore((s) => s.canClaimDailyBonus);
  const claimDailyBonus = usePlayerStore((s) => s.claimDailyBonus);
  const canClaimSessionQuest = usePlayerStore((s) => s.canClaimSessionQuest);
  const claimSessionQuest = usePlayerStore((s) => s.claimSessionQuest);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const completedDailyMissions = playerStore.dailyMissions.filter((m) => m.completed).length;
  const unlockedAchievements = playerStore.achievements.filter((a) => a.unlocked).length;

  // Show splash screen for minimum 2.5 seconds
  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 2500); // 2.5 seconds minimum splash time

    return () => clearTimeout(splashTimer);
  }, []);

  const initializePlayer = useCallback(async () => {
    try {
      let store = usePlayerStore.getState();
      // Legacy / partial persist: had nickname but no id — attach a stable local id
      if (!store.playerId && store.nickname?.trim() && store.nickname !== 'Player') {
        let id = `local_${Date.now()}`;
        try {
          id = `local_${await Crypto.randomUUID()}`;
        } catch {
          /* keep fallback */
        }
        store.setPlayer(id, store.nickname.trim());
        store = usePlayerStore.getState();
      }

      // Generate or get device ID
      let deviceId = store.deviceId;
      if (!deviceId) {
        try {
          deviceId = await Crypto.randomUUID();
        } catch {
          // Fallback for web
          deviceId = 'web-' + Math.random().toString(36).substring(2, 15);
        }
        store.setDeviceId(deviceId);
      }

      // If we already have a local-only profile, skip the server
      if (store.playerId && !isServerBackedPlayerId(store.playerId)) {
        setLoading(false);
        return;
      }

      // Had a server account in memory but no API URL (misconfig) — keep session without re-fetching
      if (store.playerId && isServerBackedPlayerId(store.playerId) && !isBackendConfigured()) {
        setLoading(false);
        return;
      }

      // If we already have a player ID in local storage, use that
      if (store.playerId && isBackendConfigured()) {
        try {
          const response = await playerApi.getById(store.playerId);
          if (response.data) {
            store.syncFromServer({
              xp: response.data.xp,
              level: response.data.level,
              gems: response.data.gems,
              totalWavesSurvived: response.data.total_waves_survived,
              gamesPlayed: response.data.games_played,
              bestWave: response.data.best_wave,
              lifetimeEnemiesKilled:
                typeof response.data.lifetime_enemies_killed === 'number'
                  ? response.data.lifetime_enemies_killed
                  : undefined,
              unlockedTowers: response.data.unlocked_towers,
              unlockedSkins: response.data.unlocked_skins,
              equippedSkins: response.data.equipped_skins,
              premium: response.data.premium,
              arenaExpansions: response.data.arena_expansions || 0,
            });
            setLoading(false);
            return;
          }
        } catch {
          console.log('Stored player not found, checking by device ID...');
        }
      }

      if (!isBackendConfigured()) {
        setLoading(false);
        return;
      }

      try {
        const response = await playerApi.getByDevice(deviceId);
        if (response.data) {
          store.setPlayer(response.data._id, response.data.nickname);
          store.syncFromServer({
            xp: response.data.xp,
            level: response.data.level,
            gems: response.data.gems ?? 0,
            totalWavesSurvived: response.data.total_waves_survived,
            gamesPlayed: response.data.games_played,
            bestWave: response.data.best_wave,
            lifetimeEnemiesKilled:
              typeof response.data.lifetime_enemies_killed === 'number'
                ? response.data.lifetime_enemies_killed
                : undefined,
            unlockedTowers: response.data.unlocked_towers,
            unlockedSkins: response.data.unlocked_skins,
            equippedSkins: response.data.equipped_skins,
            premium: response.data.premium,
            arenaExpansions: response.data.arena_expansions || 0,
          });
          setLoading(false);
          return;
        }
      } catch {
        console.log('Player not found by device ID, showing nickname modal');
      }

      setLoading(false);
    } catch (error) {
      console.error('Error initializing player:', error);
      setLoading(false);
    }
  }, []);

  // Initialize player on mount
  useEffect(() => {
    refreshDailyMissions();
    refreshWeeklyMissions();
    void (async () => {
      await initializePlayer();
      finalizePersistedNameProfile();
      const st = usePlayerStore.getState();
      const needsNameModal =
        !st.hasEnteredNameOnce &&
        (!st.nickname?.trim() || st.nickname === 'Player');
      if (needsNameModal) {
        setShowNicknameModal(true);
      }
    })();
  }, [initializePlayer, refreshDailyMissions, refreshWeeklyMissions]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        refreshDailyMissions();
        refreshWeeklyMissions();
      }
    });
    return () => sub.remove();
  }, [refreshDailyMissions, refreshWeeklyMissions]);

  const registerLocalPlayer = async (nickname: string) => {
    let id = `local_${Date.now()}`;
    try {
      id = `local_${await Crypto.randomUUID()}`;
    } catch {
      // keep fallback id
    }
    playerStore.setPlayer(id, nickname);
  };

  const handleNicknameSubmit = async (nickname: string) => {
    try {
      setLoading(true);

      if (!isBackendConfigured()) {
        await registerLocalPlayer(nickname);
        setShowNicknameModal(false);
        if (!usePlayerStore.getState().tutorialCompleted) {
          setShowTutorial(true);
        }
        return;
      }

      try {
        const response = await playerApi.create(nickname, playerStore.deviceId);
        if (response.data?._id) {
          playerStore.setPlayer(response.data._id, response.data.nickname);
          playerStore.syncFromServer({
            xp: response.data.xp,
            level: response.data.level,
            gems: response.data.gems ?? 0,
            unlockedTowers: response.data.unlocked_towers,
            unlockedSkins: response.data.unlocked_skins,
          });
        } else {
          await registerLocalPlayer(nickname);
        }
      } catch (error) {
        console.error('Error creating player:', error);
        await registerLocalPlayer(nickname);
        Alert.alert(
          'Offline mode',
          'Could not reach the game server. You can still play; progress is stored on this device only.',
          [{ text: 'OK' }]
        );
      }

      setShowNicknameModal(false);
      if (!usePlayerStore.getState().tutorialCompleted) {
        setShowTutorial(true);
      }
    } catch (error) {
      console.error('Error registering player:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTutorialComplete = () => {
    playerStore.completeTutorial();
    setShowTutorial(false);
  };

  const handlePlayPress = useCallback(() => {
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    // Show tutorial for first-time players
    if (!playerStore.tutorialCompleted) {
      setShowTutorial(true);
    } else {
      router.push('/game');
    }
  }, [router, playerStore.hapticEnabled, playerStore.tutorialCompleted]);

  const handleLeaderboardPress = useCallback(() => {
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/leaderboard');
  }, [router, playerStore.hapticEnabled]);

  const handleShopPress = useCallback(() => {
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/shop');
  }, [router, playerStore.hapticEnabled]);

  const handleSettingsPress = useCallback(() => {
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/settings');
  }, [router, playerStore.hapticEnabled]);

  const handleProgressPress = useCallback(() => {
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/progression');
  }, [router, playerStore.hapticEnabled]);

  const handleClaimDailyBonus = useCallback(() => {
    const result = claimDailyBonus();
    if (result.reward > 0) {
      playSfx('chest');
      const milestoneText =
        result.milestoneBonus > 0 ? `\nMilestone chest: +${result.milestoneBonus} gems!` : '';
      Alert.alert(
        'Daily Bonus Claimed',
        `+${result.reward} gems${milestoneText}\nStreak: ${result.streak} day(s)`
      );
    } else {
      Alert.alert('Already Claimed', 'Come back tomorrow for your next daily bonus.');
    }
  }, [claimDailyBonus]);

  const handleClaimSessionQuest = useCallback(() => {
    const reward = claimSessionQuest();
    if (reward > 0) {
      playSfx('chest');
      Alert.alert('Session Quest Complete', `Bonus chest opened: +${reward} gems!`);
    } else {
      Alert.alert(
        'Session Quest',
        `Earn ${SESSION_BOUNTY_TRIUMPHS_NEEDED} slaughter stars by getting ${SESSION_SLAUGHTER_WIN_KILLS}+ kills in a single run (each counts once). Open the chest when ready.`
      );
    }
  }, [claimSessionQuest]);

  // Show splash screen while loading OR during minimum splash time
  if (loading || showSplash) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.splashContainer}>
          <MaterialCommunityIcons name="shield-sword" size={100} color="#4A90D9" />
          <Text style={styles.splashTitle}>LAST STAND</Text>
          <Text style={styles.splashSubtitle}>DEFENSE</Text>
          <View style={styles.splashLoader}>
            <ActivityIndicator size="large" color="#4A90D9" />
            <Text style={styles.splashLoadingText}>Loading...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header with player stats */}
      <View style={styles.header}>
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>{playerStore.nickname}</Text>
          <Text style={styles.playerLevel}>Level {playerStore.level}</Text>
        </View>
        <View style={styles.currencyContainer}>
          <FontAwesome5 name="gem" size={16} color="#4A90D9" />
          <Text style={styles.currencyText}>{playerStore.gems}</Text>
        </View>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Game title */}
        <View style={styles.titleContainer}>
          <MaterialCommunityIcons name="shield-sword" size={64} color="#4A90D9" />
          <Text style={styles.title}>LAST STAND</Text>
          <Text style={styles.subtitle}>DEFENSE</Text>
        </View>

        <Text style={styles.arenaSectionLabel}>Battlefield</Text>
        <Text style={styles.arenaSectionHint}>Each route is fixed — build beside the path</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.arenaScroll}
        >
          {ARENA_MAP_LIST.map((m) => {
            const selected = playerStore.currentMapId === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.arenaCard, selected && styles.arenaCardSelected]}
                onPress={() => {
                  if (playerStore.hapticEnabled) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  playerStore.setCurrentMapId(m.id);
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.arenaSwatch, { backgroundColor: m.theme.path }]} />
                <Text style={styles.arenaName} numberOfLines={2}>
                  {m.name}
                </Text>
                <Text style={styles.arenaDesc} numberOfLines={3}>
                  {m.description}
                </Text>
                <Text style={styles.arenaMeta}>
                  {m.gridCols}×{m.gridRows} • {m.route.length} steps
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.dailyBonusCard}>
          <View>
            <Text style={styles.dailyBonusTitle}>Daily Login Bonus</Text>
            <Text style={styles.dailyBonusSub}>
              Streak: {playerStore.loginStreak} day{playerStore.loginStreak === 1 ? '' : 's'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.dailyBonusButton, !canClaimDailyBonus() && styles.dailyBonusButtonDisabled]}
            onPress={handleClaimDailyBonus}
            disabled={!canClaimDailyBonus()}
          >
            <Text style={styles.dailyBonusButtonText}>{canClaimDailyBonus() ? 'Claim' : 'Claimed'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dailyBonusCard}>
          <View>
            <Text style={styles.dailyBonusTitle}>Session Quest Chest</Text>
            <Text style={styles.dailyBonusSub}>
              Kills this session: {playerStore.sessionEnemiesKilledTotal} • Slaughter stars{' '}
              {playerStore.sessionSlaughterTriumphs}/{SESSION_BOUNTY_TRIUMPHS_NEEDED} (
              {SESSION_SLAUGHTER_WIN_KILLS}+ kills / run)
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.dailyBonusButton, !canClaimSessionQuest() && styles.dailyBonusButtonDisabled]}
            onPress={handleClaimSessionQuest}
            disabled={!canClaimSessionQuest()}
          >
            <Text style={styles.dailyBonusButtonText}>{canClaimSessionQuest() ? 'Open' : 'Locked'}</Text>
          </TouchableOpacity>
        </View>

        {/* Best wave */}
        {playerStore.bestWave > 0 && (
          <View style={styles.bestWaveContainer}>
            <MaterialCommunityIcons name="trophy" size={24} color="#FFD700" />
            <Text style={styles.bestWaveText}>Best: Wave {playerStore.bestWave}</Text>
          </View>
        )}

        <View style={styles.progressionCard}>
          <Text style={styles.progressionTitle}>Daily Missions</Text>
          <MissionResetHints />
          {playerStore.dailyMissions.map((mission) => (
            <View key={mission.id} style={styles.missionRow}>
              <Text style={styles.missionLabel}>{mission.label}</Text>
              <Text style={styles.missionValue}>
                {mission.completed ? 'Done' : `${mission.progress}/${mission.target}`} (+{mission.rewardGems})
              </Text>
            </View>
          ))}
          <Text style={styles.progressionFooter}>
            {completedDailyMissions}/{playerStore.dailyMissions.length} done • Achievements {unlockedAchievements}/{playerStore.achievements.length}
          </Text>
        </View>

        {/* Play button */}
        <TouchableOpacity
          style={styles.playButton}
          onPress={handlePlayPress}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={32} color="#fff" />
          <Text style={styles.playButtonText}>PLAY</Text>
        </TouchableOpacity>

        {/* Menu buttons */}
        <View style={styles.menuButtons}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={handleLeaderboardPress}
          >
            <Ionicons name="trophy-outline" size={28} color="#FFD700" />
            <Text style={styles.menuButtonText}>Leaderboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={handleShopPress}
          >
            <Ionicons name="cart-outline" size={28} color="#9B59B6" />
            <Text style={styles.menuButtonText}>Shop</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={handleSettingsPress}
          >
            <Ionicons name="settings-outline" size={28} color="#4A90D9" />
            <Text style={styles.menuButtonText}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={handleProgressPress}
          >
            <Ionicons name="stats-chart-outline" size={28} color="#2ECC71" />
            <Text style={styles.menuButtonText}>Progress</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* XP Progress bar */}
      <View style={styles.xpContainer}>
        <View style={styles.xpBar}>
          <View
            style={[
              styles.xpFill,
              { width: `${(playerStore.xp % 100)}%` }
            ]}
          />
        </View>
        <Text style={styles.xpText}>
          XP: {playerStore.xp % 100}/100 to Level {playerStore.level + 1}
        </Text>
      </View>

      {/* Nickname modal */}
      <NicknameModal
        visible={showNicknameModal}
        onSubmit={handleNicknameSubmit}
      />

      {/* Tutorial overlay */}
      {showTutorial && (
        <TutorialOverlay onComplete={handleTutorialComplete} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  splashTitle: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
    letterSpacing: 4,
    marginTop: 16,
  },
  splashSubtitle: {
    color: '#4A90D9',
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 8,
    marginBottom: 48,
  },
  splashLoader: {
    alignItems: 'center',
  },
  splashLoadingText: {
    color: '#666',
    marginTop: 12,
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerLevel: {
    color: '#4A90D9',
    fontSize: 14,
  },
  currencyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  currencyText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  arenaSectionLabel: {
    alignSelf: 'flex-start',
    color: '#e8eef8',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    width: '100%',
  },
  arenaSectionHint: {
    alignSelf: 'flex-start',
    color: '#7a8aa6',
    fontSize: 12,
    marginBottom: 10,
    width: '100%',
  },
  arenaScroll: {
    paddingVertical: 4,
    paddingBottom: 12,
    gap: 10,
  },
  arenaCard: {
    width: 148,
    backgroundColor: '#121826',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#2a3548',
  },
  arenaCardSelected: {
    borderColor: '#4A90D9',
    backgroundColor: '#16213e',
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  arenaSwatch: {
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
    opacity: 0.95,
  },
  arenaName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
    minHeight: 34,
  },
  arenaDesc: {
    color: '#8fa4c4',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
    minHeight: 48,
  },
  arenaMeta: {
    color: '#5d6d85',
    fontSize: 10,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 42,
    fontWeight: 'bold',
    letterSpacing: 4,
    marginTop: 8,
  },
  subtitle: {
    color: '#4A90D9',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 8,
  },
  bestWaveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  bestWaveText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  dailyBonusCard: {
    width: '100%',
    backgroundColor: '#16213e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dailyBonusTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  dailyBonusSub: {
    color: '#9bb0cc',
    fontSize: 12,
    marginTop: 2,
  },
  dailyBonusButton: {
    backgroundColor: '#2ECC71',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  dailyBonusButtonDisabled: {
    backgroundColor: '#2a2a4e',
  },
  dailyBonusButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressionCard: {
    width: '100%',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  progressionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  missionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  missionLabel: {
    color: '#d7d7d7',
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  missionValue: {
    color: '#4A90D9',
    fontSize: 12,
    fontWeight: '600',
  },
  progressionFooter: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A90D9',
    paddingVertical: 20,
    paddingHorizontal: 64,
    borderRadius: 16,
    gap: 12,
    marginBottom: 48,
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  menuButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  menuButton: {
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 100,
  },
  menuButtonText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 8,
  },
  xpContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  xpBar: {
    height: 8,
    backgroundColor: '#16213e',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  xpFill: {
    height: '100%',
    backgroundColor: '#4A90D9',
    borderRadius: 4,
  },
  xpText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },
});
