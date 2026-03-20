import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../src/stores/playerStore';
import { playerApi, analyticsApi } from '../src/hooks/useApi';
import * as Crypto from 'expo-crypto';
import BannerAdComponent from '../src/components/BannerAdComponent';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Tutorial overlay component
const TutorialOverlay = ({ onComplete }: { onComplete: () => void }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      icon: 'finger-print',
      title: 'Place Towers',
      description: 'Tap empty spots to place defensive towers',
    },
    {
      icon: 'shield-checkmark',
      title: 'Defend Your Base',
      description: 'Stop enemies from reaching your base',
    },
    {
      icon: 'trending-up',
      title: 'Upgrade & Survive',
      description: 'Earn coins to upgrade towers and survive longer',
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
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // Initialize player on mount
  useEffect(() => {
    initializePlayer();
  }, []);

  // Show splash screen for minimum 2.5 seconds
  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 2500); // 2.5 seconds minimum splash time

    return () => clearTimeout(splashTimer);
  }, []);

  const initializePlayer = async () => {
    try {
      // Generate or get device ID
      let deviceId = playerStore.deviceId;
      if (!deviceId) {
        try {
          deviceId = await Crypto.randomUUID();
        } catch (e) {
          // Fallback for web
          deviceId = 'web-' + Math.random().toString(36).substring(2, 15);
        }
        playerStore.setDeviceId(deviceId);
      }

      // If we already have a player ID in local storage, use that
      if (playerStore.playerId) {
        try {
          const response = await playerApi.getById(playerStore.playerId);
          if (response.data) {
            playerStore.syncFromServer({
              xp: response.data.xp,
              level: response.data.level,
              coins: response.data.coins,
              totalWavesSurvived: response.data.total_waves_survived,
              gamesPlayed: response.data.games_played,
              bestWave: response.data.best_wave,
              unlockedTowers: response.data.unlocked_towers,
              unlockedSkins: response.data.unlocked_skins,
              equippedSkins: response.data.equipped_skins,
              premium: response.data.premium,
              arenaExpansions: response.data.arena_expansions || 0,
            });
            setLoading(false);
            return;
          }
        } catch (e) {
          console.log('Stored player not found, checking by device ID...');
        }
      }

      // Try to get existing player from server by device ID
      try {
        const response = await playerApi.getByDevice(deviceId);
        if (response.data) {
          playerStore.setPlayer(response.data._id, response.data.nickname);
          playerStore.syncFromServer({
            xp: response.data.xp,
            level: response.data.level,
            coins: response.data.coins,
            totalWavesSurvived: response.data.total_waves_survived,
            gamesPlayed: response.data.games_played,
            bestWave: response.data.best_wave,
            unlockedTowers: response.data.unlocked_towers,
            unlockedSkins: response.data.unlocked_skins,
            equippedSkins: response.data.equipped_skins,
            premium: response.data.premium,
            arenaExpanded: response.data.arena_expanded,
          });
          setLoading(false);
          return;
        }
      } catch (e) {
        console.log('Player not found by device ID, showing nickname modal');
      }

      // Show nickname modal for new players
      setShowNicknameModal(true);
      setLoading(false);
    } catch (error) {
      console.error('Error initializing player:', error);
      // On error, still show nickname modal so user can proceed
      setShowNicknameModal(true);
      setLoading(false);
    }
  };

  const handleNicknameSubmit = async (nickname: string) => {
    try {
      setLoading(true);
      const response = await playerApi.create(nickname, playerStore.deviceId);
      if (response.data) {
        playerStore.setPlayer(response.data._id, response.data.nickname);
        playerStore.syncFromServer({
          xp: response.data.xp,
          level: response.data.level,
          coins: response.data.coins,
          unlockedTowers: response.data.unlocked_towers,
          unlockedSkins: response.data.unlocked_skins,
        });
      }
      setShowNicknameModal(false);
      setShowTutorial(true);
    } catch (error) {
      console.error('Error creating player:', error);
      Alert.alert('Error', 'Failed to create player. Please try again.');
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
          <FontAwesome5 name="coins" size={16} color="#FFD700" />
          <Text style={styles.currencyText}>{playerStore.coins}</Text>
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

        {/* Best wave */}
        {playerStore.bestWave > 0 && (
          <View style={styles.bestWaveContainer}>
            <MaterialCommunityIcons name="trophy" size={24} color="#FFD700" />
            <Text style={styles.bestWaveText}>Best: Wave {playerStore.bestWave}</Text>
          </View>
        )}

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
        </View>
      </View>

      {/* Banner Ad */}
      <BannerAdComponent isPremium={playerStore.premium} />

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
    marginBottom: 24,
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
