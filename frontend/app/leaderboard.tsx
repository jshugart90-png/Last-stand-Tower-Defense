import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../src/stores/playerStore';
import { leaderboardApi } from '../src/hooks/useApi';

interface LeaderboardEntry {
  _id: string;
  player_id: string;
  nickname: string;
  best_wave: number;
  total_waves_survived: number;
  games_played: number;
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const playerStore = usePlayerStore();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      const [leaderboardRes, rankRes] = await Promise.all([
        leaderboardApi.getGlobal(100),
        playerStore.playerId ? leaderboardApi.getPlayerRank(playerStore.playerId) : null,
      ]);

      setEntries(leaderboardRes.data);
      if (rankRes?.data) {
        setPlayerRank(rankRes.data.rank);
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadLeaderboard();
  };

  const renderItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isCurrentPlayer = item.player_id === playerStore.playerId;
    const rank = index + 1;

    return (
      <View style={[styles.entryContainer, isCurrentPlayer && styles.currentPlayerEntry]}>
        <View style={styles.rankContainer}>
          {rank <= 3 ? (
            <MaterialCommunityIcons
              name="trophy"
              size={24}
              color={rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : '#CD7F32'}
            />
          ) : (
            <Text style={styles.rankText}>{rank}</Text>
          )}
        </View>
        
        <View style={styles.playerInfo}>
          <Text style={[styles.nickname, isCurrentPlayer && styles.currentPlayerText]}>
            {item.nickname}
            {isCurrentPlayer && ' (You)'}
          </Text>
          <Text style={styles.stats}>
            Games: {item.games_played} | Total Waves: {item.total_waves_survived}
          </Text>
        </View>
        
        <View style={styles.scoreContainer}>
          <MaterialCommunityIcons name="waves" size={20} color="#4A90D9" />
          <Text style={styles.scoreText}>{item.best_wave}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Leaderboard</Text>
        <View style={styles.backButton} />
      </View>

      {/* Player rank banner */}
      {playerRank && (
        <View style={styles.rankBanner}>
          <Text style={styles.rankBannerText}>Your Rank: #{playerRank}</Text>
          <Text style={styles.rankBannerSubtext}>Best Wave: {playerStore.bestWave}</Text>
        </View>
      )}

      {/* Leaderboard list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90D9" />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4A90D9"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="trophy-outline" size={64} color="#333" />
              <Text style={styles.emptyText}>No entries yet</Text>
              <Text style={styles.emptySubtext}>Be the first to set a record!</Text>
            </View>
          }
        />
      )}
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
  rankBanner: {
    backgroundColor: '#16213e',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  rankBannerText: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: 'bold',
  },
  rankBannerSubtext: {
    color: '#4A90D9',
    fontSize: 16,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  entryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  currentPlayerEntry: {
    borderWidth: 2,
    borderColor: '#4A90D9',
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  rankText: {
    color: '#666',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nickname: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  currentPlayerText: {
    color: '#4A90D9',
  },
  stats: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    color: '#4A90D9',
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: '#666',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#444',
    fontSize: 14,
    marginTop: 8,
  },
});
