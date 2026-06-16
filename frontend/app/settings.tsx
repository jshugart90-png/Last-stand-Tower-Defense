import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../src/stores/playerStore';
import { PRIVACY_POLICY_URL, SUPPORT_URL } from '../src/constants/legal';
import { TOWERS } from '../src/constants/game';
import {
  isBackendConfigured,
  isServerBackedPlayerId,
  playerApi,
} from '../src/hooks/useApi';
import { TacticalTheme } from '../src/theme/colors';
import { PlayerLogoBadge } from '../src/components/PlayerLogoBadge';

const appVersionLabel =
  Constants.expoConfig?.version != null && String(Constants.expoConfig.version).length > 0
    ? `Last Stand Tower Defense v${Constants.expoConfig.version}`
    : 'Last Stand Tower Defense';

export default function SettingsScreen() {
  const router = useRouter();
  const playerStore = usePlayerStore();
  const [changeNameOpen, setChangeNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const openChangeName = () => {
    setNameDraft(playerStore.nickname || '');
    setChangeNameOpen(true);
  };

  const saveDisplayName = async () => {
    const name = nameDraft.trim();
    if (!name) {
      Alert.alert('Name required', 'Please enter a display name.');
      return;
    }
    if (name.length > 15) {
      Alert.alert('Too long', 'Use at most 15 characters.');
      return;
    }
    if (isBackendConfigured() && playerStore.playerId && isServerBackedPlayerId(playerStore.playerId)) {
      try {
        await playerApi.update(playerStore.playerId, { nickname: name });
      } catch {
        Alert.alert(
          'Server sync',
          'Could not update the name on the server. It was saved on this device only.',
          [{ text: 'OK' }]
        );
      }
    }
    playerStore.setNickname(name);
    setChangeNameOpen(false);
  };

  const handleRestorePurchases = () => {
    router.push('/shop');
  };

  const handlePrivacyPolicy = () => {
    void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL);
  };

  const handleSupport = () => {
    void WebBrowser.openBrowserAsync(SUPPORT_URL);
  };

  const handleResetProgress = () => {
    Alert.alert(
      'Reset Progress',
      'This will reset all your progress, including levels, unlocks, and stats. This cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            playerStore.resetPlayer();
            Alert.alert('Reset Complete', 'Your progress has been reset.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={changeNameOpen} transparent animationType="fade">
        <View style={styles.nameModalOverlay}>
          <View style={styles.nameModalCard}>
            <Text style={styles.nameModalTitle}>Change display name</Text>
            <TextInput
              style={styles.nameModalInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Your name"
              placeholderTextColor="#666"
              maxLength={15}
              autoFocus
              autoCapitalize="words"
            />
            <View style={styles.nameModalButtons}>
              <TouchableOpacity
                style={[styles.nameModalBtn, styles.nameModalBtnGhost]}
                onPress={() => setChangeNameOpen(false)}
              >
                <Text style={styles.nameModalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nameModalBtn, styles.nameModalBtnPrimary]}
                onPress={() => void saveDisplayName()}
                disabled={!nameDraft.trim()}
              >
                <Text style={styles.nameModalBtnPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={TacticalTheme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content}>
        {/* Audio Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audio</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="volume-high" size={24} color={TacticalTheme.accent} />
              <Text style={styles.settingLabel}>Sound Effects</Text>
            </View>
            <Switch
              value={playerStore.soundEnabled}
              onValueChange={playerStore.toggleSound}
              trackColor={{ false: '#333', true: TacticalTheme.accent }}
              thumbColor={playerStore.soundEnabled ? '#fff' : '#666'}
            />
          </View>
          <Text style={styles.settingHint}>
            When enabled, SFX follow your volume slider and will still play if the iPhone silent switch is on.
          </Text>

          <View style={styles.volumeBlock}>
            <View style={styles.volumeHeader}>
              <Text style={styles.volumeLabel}>SFX volume</Text>
              <Text style={styles.volumePct}>{Math.round(playerStore.sfxVolume * 100)}%</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              value={playerStore.sfxVolume}
              onValueChange={playerStore.setSfxVolume}
              minimumTrackTintColor={TacticalTheme.accent}
              maximumTrackTintColor="#2a2a4e"
              thumbTintColor={playerStore.soundEnabled ? '#fff' : '#555'}
              disabled={!playerStore.soundEnabled}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="musical-notes" size={24} color="#9B59B6" />
              <Text style={styles.settingLabel}>Background Music</Text>
            </View>
            <Switch
              value={playerStore.musicEnabled}
              onValueChange={playerStore.toggleMusic}
              trackColor={{ false: '#333', true: '#9B59B6' }}
              thumbColor={playerStore.musicEnabled ? '#fff' : '#666'}
            />
          </View>

          <View style={styles.volumeBlock}>
            <View style={styles.volumeHeader}>
              <Text style={styles.volumeLabel}>Music volume</Text>
              <Text style={styles.volumePct}>{Math.round(playerStore.musicVolume * 100)}%</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              value={playerStore.musicVolume}
              onValueChange={playerStore.setMusicVolume}
              minimumTrackTintColor="#9B59B6"
              maximumTrackTintColor="#2a2a4e"
              thumbTintColor={playerStore.musicEnabled ? '#fff' : '#555'}
              disabled={!playerStore.musicEnabled}
            />
          </View>
        </View>

        {/* Feedback Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feedback</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialCommunityIcons name="vibrate" size={24} color="#E74C3C" />
              <Text style={styles.settingLabel}>Haptic Feedback</Text>
            </View>
            <Switch
              value={playerStore.hapticEnabled}
              onValueChange={playerStore.toggleHaptic}
              trackColor={{ false: '#333', true: '#E74C3C' }}
              thumbColor={playerStore.hapticEnabled ? '#fff' : '#666'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialCommunityIcons name="speedometer" size={24} color="#2ECC71" />
              <Text style={styles.settingLabel}>Performance Mode</Text>
            </View>
            <Switch
              value={playerStore.performanceMode}
              onValueChange={playerStore.togglePerformanceMode}
              trackColor={{ false: '#333', true: '#2ECC71' }}
              thumbColor={playerStore.performanceMode ? '#fff' : '#666'}
            />
          </View>
          <Text style={styles.settingHint}>
            Reduces visual effects in large waves for smoother combat.
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="sparkles-outline" size={24} color="#FFD700" />
              <Text style={styles.settingLabel}>VFX Quality</Text>
            </View>
            <View style={styles.vfxSegment}>
              {[0, 1, 2].map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[styles.vfxButton, playerStore.vfxQuality === q && styles.vfxButtonActive]}
                  onPress={() => playerStore.setVfxQuality(q as 0 | 1 | 2)}
                >
                  <Text style={[styles.vfxButtonText, playerStore.vfxQuality === q && styles.vfxButtonTextActive]}>
                    {q === 0 ? 'Low' : q === 1 ? 'Med' : 'High'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="play-forward" size={24} color={TacticalTheme.accent} />
              <Text style={styles.settingLabel}>Auto-Start Waves</Text>
            </View>
            <Switch
              value={playerStore.autoStartWaves}
              onValueChange={playerStore.toggleAutoStartWaves}
              trackColor={{ false: '#333', true: TacticalTheme.accent }}
              thumbColor={playerStore.autoStartWaves ? '#fff' : '#666'}
            />
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Player ID</Text>
            <Text style={styles.infoValue}>{playerStore.playerId?.slice(0, 8)}...</Text>
          </View>

          <TouchableOpacity
            style={styles.nameChangeRow}
            onPress={openChangeName}
            activeOpacity={0.7}
          >
            <View>
              <Text style={styles.infoLabel}>Display name</Text>
              <View style={styles.nameValueRow}>
                <PlayerLogoBadge logoId={playerStore.selectedLogoId} size={18} />
                <Text style={styles.infoValue}>{playerStore.nickname}</Text>
              </View>
            </View>
            <View style={styles.nameChangeChevron}>
              <Text style={styles.nameChangeHint}>Change</Text>
              <Ionicons name="chevron-forward" size={18} color="#666" />
            </View>
          </TouchableOpacity>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Level</Text>
            <Text style={styles.infoValue}>{playerStore.level}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Premium</Text>
            <Text style={[styles.infoValue, playerStore.premium && styles.premiumText]}>
              {playerStore.premium ? 'Yes' : 'No'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Arena Expansions</Text>
            <Text style={styles.infoValue}>{playerStore.arenaExpansions}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Unlocked Towers</Text>
            <Text style={styles.infoValue}>{playerStore.unlockedTowers.length}/{Object.keys(TOWERS).length}</Text>
          </View>
        </View>

        {/* Stats Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistics</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Best Wave</Text>
            <Text style={styles.infoValue}>{playerStore.bestWave}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Games Played</Text>
            <Text style={styles.infoValue}>{playerStore.gamesPlayed}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total Waves Survived</Text>
            <Text style={styles.infoValue}>{playerStore.totalWavesSurvived}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total XP</Text>
            <Text style={styles.infoValue}>{playerStore.xp}</Text>
          </View>
        </View>

        {/* Purchases Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Purchases</Text>

          <TouchableOpacity style={styles.actionButton} onPress={handleRestorePurchases}>
            <Ionicons name="refresh" size={24} color={TacticalTheme.accent} />
            <Text style={styles.actionButtonText}>Restore Purchases</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          
          <TouchableOpacity style={styles.actionButton} onPress={handlePrivacyPolicy}>
            <Ionicons name="shield-checkmark" size={24} color="#2ECC71" />
            <Text style={styles.actionButtonText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleSupport}>
            <Ionicons name="help-circle" size={24} color="#F39C12" />
            <Text style={styles.actionButtonText}>Support</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.dangerButton]} 
            onPress={handleResetProgress}
          >
            <Ionicons name="trash" size={24} color="#E74C3C" />
            <Text style={[styles.actionButtonText, styles.dangerText]}>Reset Progress</Text>
            <Ionicons name="chevron-forward" size={20} color="#E74C3C" />
          </TouchableOpacity>
        </View>

        {/* Version */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>{appVersionLabel}</Text>
          <Text style={styles.copyrightText}>Last Stand Tower Defense</Text>
        </View>
      </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: TacticalTheme.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: TacticalTheme.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: TacticalTheme.border,
  },
  sectionTitle: {
    color: TacticalTheme.accent,
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    color: TacticalTheme.text,
    fontSize: 16,
  },
  settingHint: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    marginTop: -4,
    marginBottom: 12,
    marginLeft: 4,
    lineHeight: 17,
  },
  volumeBlock: {
    marginBottom: 16,
  },
  volumeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  volumeLabel: {
    color: TacticalTheme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  volumePct: {
    color: TacticalTheme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  slider: {
    width: '100%',
    height: 36,
  },
  vfxSegment: {
    flexDirection: 'row',
    backgroundColor: TacticalTheme.bgElevated,
    borderRadius: 8,
    overflow: 'hidden',
  },
  vfxButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  vfxButtonActive: {
    backgroundColor: TacticalTheme.accent,
  },
  vfxButtonText: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  vfxButtonTextActive: {
    color: TacticalTheme.text,
  },
  nameModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  nameModalCard: {
    backgroundColor: TacticalTheme.surfaceDeep,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
  },
  nameModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  nameModalInput: {
    backgroundColor: '#0f0f23',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 17,
    marginBottom: 20,
  },
  nameModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  nameModalBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  nameModalBtnGhost: {
    backgroundColor: 'transparent',
  },
  nameModalBtnGhostText: {
    color: TacticalTheme.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  nameModalBtnPrimary: {
    backgroundColor: TacticalTheme.accent,
  },
  nameModalBtnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  nameChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  nameChangeChevron: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nameChangeHint: {
    color: TacticalTheme.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  infoLabel: {
    color: '#666',
    fontSize: 14,
  },
  infoValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  nameValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  premiumText: {
    color: '#FFD700',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  actionButtonText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  dangerTitle: {
    color: '#E74C3C',
  },
  dangerButton: {
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    marginHorizontal: -16,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  dangerText: {
    color: '#E74C3C',
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  versionText: {
    color: '#444',
    fontSize: 12,
  },
  copyrightText: {
    color: '#333',
    fontSize: 10,
    marginTop: 4,
  },
});
