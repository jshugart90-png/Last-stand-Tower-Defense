import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../src/stores/playerStore';

export default function SettingsScreen() {
  const router = useRouter();
  const playerStore = usePlayerStore();

  const handleRestorePurchases = () => {
    Alert.alert(
      'Restore Purchases',
      'This will restore any previous purchases made with your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => {
            // Simulate restore
            Alert.alert('Restored', 'Your purchases have been restored.');
          },
        },
      ]
    );
  };

  const handlePrivacyPolicy = () => {
    // Placeholder - would link to actual privacy policy
    Alert.alert(
      'Privacy Policy',
      'Last Stand Defense respects your privacy. We collect minimal data required for gameplay and leaderboards. For full details, visit our website.',
      [{ text: 'OK' }]
    );
  };

  const handleTermsOfService = () => {
    Alert.alert(
      'Terms of Service',
      'By playing Last Stand Defense, you agree to our terms of service. Play responsibly and have fun!',
      [{ text: 'OK' }]
    );
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
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
              <Ionicons name="volume-high" size={24} color="#4A90D9" />
              <Text style={styles.settingLabel}>Sound Effects</Text>
            </View>
            <Switch
              value={playerStore.soundEnabled}
              onValueChange={playerStore.toggleSound}
              trackColor={{ false: '#333', true: '#4A90D9' }}
              thumbColor={playerStore.soundEnabled ? '#fff' : '#666'}
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
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Player ID</Text>
            <Text style={styles.infoValue}>{playerStore.playerId?.slice(0, 8)}...</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nickname</Text>
            <Text style={styles.infoValue}>{playerStore.nickname}</Text>
          </View>

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
            <Ionicons name="refresh" size={24} color="#4A90D9" />
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

          <TouchableOpacity style={styles.actionButton} onPress={handleTermsOfService}>
            <Ionicons name="document-text" size={24} color="#F39C12" />
            <Text style={styles.actionButtonText}>Terms of Service</Text>
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
          <Text style={styles.versionText}>Last Stand Defense v1.0.0</Text>
          <Text style={styles.copyrightText}>Made with Emergent</Text>
        </View>
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
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
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
    borderBottomColor: '#2a2a4e',
  },
  sectionTitle: {
    color: '#4A90D9',
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
    color: '#fff',
    fontSize: 16,
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
