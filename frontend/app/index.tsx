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
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { getXpProgress, usePlayerStore } from '../src/stores/playerStore';
import { isBackendConfigured, isServerBackedPlayerId, playerApi } from '../src/hooks/useApi';
import * as Crypto from 'expo-crypto';
import { playSfx, canPlayUiSfx } from '../src/services/audioService';
import { DailyMissionsModal } from '../src/components/DailyMissionsModal';
import { PlayerLogoBadge } from '../src/components/PlayerLogoBadge';
import {
  SESSION_SLAUGHTER_WIN_KILLS,
  SESSION_BOUNTY_TRIUMPHS_NEEDED,
} from '../src/constants/sessionProgress';
import { TacticalTheme } from '../src/theme/colors';

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
            color={TacticalTheme.accent}
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
    backgroundColor: TacticalTheme.surfaceDeep,
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
    color: TacticalTheme.white,
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    color: TacticalTheme.textSubtle,
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
    backgroundColor: TacticalTheme.accent,
  },
  button: {
    backgroundColor: TacticalTheme.accent,
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
    backgroundColor: TacticalTheme.surfaceDeep,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    maxWidth: 350,
  },
  title: {
    color: TacticalTheme.white,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  input: {
    backgroundColor: TacticalTheme.bg,
    borderRadius: 12,
    padding: 16,
    color: TacticalTheme.white,
    fontSize: 18,
    width: '100%',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: TacticalTheme.accent,
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
  const claimDailyMission = usePlayerStore((s) => s.claimDailyMission);
  const [loading, setLoading] = useState(true);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showDailyMissionsModal, setShowDailyMissionsModal] = useState(false);
  const completedDailyMissions = playerStore.dailyMissions.filter((m) => m.completed).length;
  const xpProgress = getXpProgress(playerStore.xp);
  const xpPercent = Math.min(100, Math.max(0, (xpProgress.xpIntoLevel / xpProgress.xpNeeded) * 100));

  useEffect(() => {
    if (!loading) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

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
      }

      setLoading(false);
    } catch {
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
      } catch {
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
    } catch {
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
      router.push('/map-selection');
    }
  }, [router, playerStore.hapticEnabled, playerStore.tutorialCompleted]);

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
      if (canPlayUiSfx()) playSfx('chest');
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
      if (canPlayUiSfx()) playSfx('chest');
      Alert.alert('Session Quest Complete', `Bonus chest opened: +${reward} gems!`);
    } else {
      Alert.alert(
        'Session Quest',
        `Earn ${SESSION_BOUNTY_TRIUMPHS_NEEDED} slaughter stars by getting ${SESSION_SLAUGHTER_WIN_KILLS}+ kills in a single run (each counts once). Open the chest when ready.`
      );
    }
  }, [claimSessionQuest]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.splashContainer}>
          <MaterialCommunityIcons name="shield-sword" size={100} color={TacticalTheme.accent} />
          <Text style={styles.splashTitle}>LAST STAND</Text>
          <Text style={styles.splashSubtitle}>DEFENSE</Text>
          <View style={styles.splashLoader}>
            <ActivityIndicator size="large" color={TacticalTheme.accent} />
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
          <View style={styles.playerNameRow}>
            <PlayerLogoBadge logoId={playerStore.selectedLogoId} size={22} />
            <Text style={styles.playerName}>{playerStore.nickname}</Text>
          </View>
          <Text style={styles.playerLevel}>Level {playerStore.level}</Text>
        </View>
        <View style={styles.currencyContainer}>
          <FontAwesome5 name="gem" size={16} color={TacticalTheme.gem} />
          <Text style={styles.currencyText}>{playerStore.gems}</Text>
        </View>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Game title */}
        <View style={styles.titleContainer}>
          <MaterialCommunityIcons name="shield-sword" size={64} color={TacticalTheme.accent} />
          <Text style={styles.title}>LAST STAND</Text>
          <Text style={styles.subtitle}>DEFENSE</Text>
        </View>

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

        <TouchableOpacity
          style={styles.dailyMissionsPrimaryButton}
          onPress={() => setShowDailyMissionsModal(true)}
          activeOpacity={0.85}
        >
          <View>
            <Text style={styles.dailyMissionsPrimaryTitle}>Daily Missions</Text>
            <Text style={styles.dailyMissionsPrimarySub}>
              {completedDailyMissions}/{playerStore.dailyMissions.length} completed
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={TacticalTheme.white} />
        </TouchableOpacity>

        {/* Play button */}
        <TouchableOpacity
          style={styles.playButton}
          onPress={handlePlayPress}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={32} color="#fff" />
          <Text style={styles.playButtonText}>PLAY</Text>
        </TouchableOpacity>

        {/* Quick actions */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleShopPress} activeOpacity={0.85}>
            <Ionicons name="cart-outline" size={20} color={TacticalTheme.accent} />
            <Text style={styles.quickActionText}>Shop</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleSettingsPress} activeOpacity={0.85}>
            <Ionicons name="settings-outline" size={20} color={TacticalTheme.accent} />
            <Text style={styles.quickActionText}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleProgressPress} activeOpacity={0.85}>
            <Ionicons name="stats-chart-outline" size={20} color={TacticalTheme.accent} />
            <Text style={styles.quickActionText}>Progress</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* XP Progress bar */}
      <View style={styles.xpContainer}>
        <View style={styles.xpBar}>
          <View
            style={[
              styles.xpFill,
              { width: `${xpPercent}%` }
            ]}
          />
        </View>
        <Text style={styles.xpText}>
          XP: {xpProgress.xpIntoLevel}/{xpProgress.xpNeeded} to Level {xpProgress.level + 1}
        </Text>
      </View>

      {/* Nickname modal */}
      <NicknameModal
        visible={showNicknameModal}
        onSubmit={handleNicknameSubmit}
      />

      <DailyMissionsModal
        visible={showDailyMissionsModal}
        missions={playerStore.dailyMissions}
        onClose={() => setShowDailyMissionsModal(false)}
        onClaim={(id) => {
          claimDailyMission(id);
          if (canPlayUiSfx()) playSfx('chest');
        }}
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
    backgroundColor: TacticalTheme.bg,
  },
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: TacticalTheme.bg,
  },
  splashTitle: {
    color: TacticalTheme.text,
    fontSize: 48,
    fontWeight: 'bold',
    letterSpacing: 4,
    marginTop: 16,
  },
  splashSubtitle: {
    color: TacticalTheme.accent,
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 8,
    marginBottom: 48,
  },
  splashLoader: {
    alignItems: 'center',
  },
  splashLoadingText: {
    color: TacticalTheme.textMuted,
    marginTop: 12,
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: TacticalTheme.text,
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
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerLevel: {
    color: TacticalTheme.accent,
    fontSize: 14,
  },
  currencyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TacticalTheme.panel,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  currencyText: {
    color: TacticalTheme.text,
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
    color: TacticalTheme.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    width: '100%',
  },
  arenaSectionHint: {
    alignSelf: 'flex-start',
    color: TacticalTheme.textMuted,
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
    borderColor: TacticalTheme.accent,
    backgroundColor: TacticalTheme.panel,
    shadowColor: TacticalTheme.accent,
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
    color: TacticalTheme.textMuted,
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
    color: TacticalTheme.accent,
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 8,
  },
  dailyBonusCard: {
    width: '100%',
    backgroundColor: TacticalTheme.surfaceDeep,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dailyBonusTitle: {
    color: TacticalTheme.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  dailyBonusSub: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  dailyBonusButton: {
    backgroundColor: TacticalTheme.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  dailyBonusButtonDisabled: {
    backgroundColor: TacticalTheme.panelAlt,
  },
  dailyBonusButtonText: {
    color: TacticalTheme.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  dailyMissionsPrimaryButton: {
    width: '100%',
    backgroundColor: TacticalTheme.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: TacticalTheme.borderStrong,
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
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TacticalTheme.accent,
    paddingVertical: 20,
    paddingHorizontal: 64,
    borderRadius: 16,
    gap: 12,
    marginBottom: 48,
    shadowColor: TacticalTheme.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  playButtonText: {
    color: TacticalTheme.white,
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  quickActionsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  quickActionBtn: {
    flex: 1,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    backgroundColor: TacticalTheme.panel,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  quickActionText: {
    color: TacticalTheme.text,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  xpContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: TacticalTheme.border,
    backgroundColor: TacticalTheme.bgElevated,
  },
  xpBar: {
    height: 8,
    backgroundColor: TacticalTheme.panel,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  xpFill: {
    height: '100%',
    backgroundColor: TacticalTheme.accent,
    borderRadius: 4,
  },
  xpText: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
});
