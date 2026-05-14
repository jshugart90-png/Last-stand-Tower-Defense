import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { useFocusEffect, useRouter } from 'expo-router';
import { isAxiosError } from 'axios';
import { usePlayerStore, type PlayerState } from '../src/stores/playerStore';
import { isBackendConfigured, isServerBackedPlayerId, leaderboardApi } from '../src/hooks/useApi';
import { TacticalTheme } from '../src/theme/colors';
import { PlayerLogoBadge } from '../src/components/PlayerLogoBadge';

export interface LeaderboardEntry {
  _id: string;
  player_id: string;
  nickname: string;
  best_wave: number;
  total_waves_survived: number;
  games_played: number;
  lifetime_enemies_killed: number;
  last_run_gems: number;
  last_run_enemies_killed?: number;
  leaderboard_score?: number;
  logo_id?: string;
}

function sortKey(e: Pick<LeaderboardEntry, 'lifetime_enemies_killed' | 'last_run_gems'>): [number, number, number] {
  const lk = e.lifetime_enemies_killed ?? 0;
  const g = e.last_run_gems ?? 0;
  const score = lk + g;
  return [score, lk, g];
}

function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < 3; i++) {
    if (ka[i] !== kb[i]) return kb[i] - ka[i];
  }
  return 0;
}

function entryFromPlayerStore(p: PlayerState): LeaderboardEntry {
  const pid = p.playerId || 'local';
  return {
    _id: `local_${pid}`,
    player_id: pid,
    nickname: p.nickname || 'Player',
    best_wave: p.bestWave,
    total_waves_survived: p.totalWavesSurvived,
    games_played: p.gamesPlayed,
    lifetime_enemies_killed: p.lifetimeEnemiesKilled,
    last_run_gems: p.lastRunGemsEarned,
    last_run_enemies_killed: p.lastRunEnemiesKilled,
    leaderboard_score: p.lifetimeEnemiesKilled + p.lastRunGemsEarned,
    logo_id: p.selectedLogoId,
  };
}

function normalizeRemoteRow(raw: Record<string, unknown>): LeaderboardEntry {
  const lk =
    typeof raw.lifetime_enemies_killed === 'number'
      ? raw.lifetime_enemies_killed
      : Number(raw.lifetime_enemies_killed) || 0;
  const lr =
    typeof raw.last_run_gems === 'number' ? raw.last_run_gems : Number(raw.last_run_gems) || 0;
  return {
    _id: String(raw._id ?? raw.id ?? ''),
    player_id: String(raw.player_id ?? ''),
    nickname: String(raw.nickname ?? 'Player'),
    best_wave: Number(raw.best_wave) || 0,
    total_waves_survived: Number(raw.total_waves_survived) || 0,
    games_played: Number(raw.games_played) || 0,
    lifetime_enemies_killed: lk,
    last_run_gems: lr,
    last_run_enemies_killed:
      typeof raw.last_run_enemies_killed === 'number'
        ? raw.last_run_enemies_killed
        : Number(raw.last_run_enemies_killed) || 0,
    leaderboard_score: typeof raw.leaderboard_score === 'number' ? raw.leaderboard_score : lk + lr,
    logo_id: typeof raw.logo_id === 'string' ? raw.logo_id : undefined,
  };
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);

  const lastLbUpdate = usePlayerStore((s) => s.lastLeaderboardUpdateAt);
  const playerId = usePlayerStore((s) => s.playerId);
  const nickname = usePlayerStore((s) => s.nickname);
  const lifetimeEnemiesKilled = usePlayerStore((s) => s.lifetimeEnemiesKilled);
  const lastRunGemsEarned = usePlayerStore((s) => s.lastRunGemsEarned);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [dailyEntries, setDailyEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'global' | 'daily'>('global');
  const prevLbRef = useRef(0);
  const lbMountRef = useRef(false);

  const getDailySeed = () => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  };

  const loadLeaderboard = useCallback(async (opts?: { fullScreenLoading?: boolean }) => {
    if (!isBackendConfigured()) {
      setEntries([]);
      setDailyEntries([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (opts?.fullScreenLoading) {
      setLoading(true);
    }

    setError(null);
    try {
      const globalResult = await leaderboardApi.getGlobal(100);
      const rawList = Array.isArray(globalResult.data) ? globalResult.data : [];
      setEntries(rawList.map((row: Record<string, unknown>) => normalizeRemoteRow(row)));

      try {
        const dailyRes = await leaderboardApi.getDailyChallenge(getDailySeed(), 100, 0);
        const dailyRaw = Array.isArray(dailyRes.data) ? dailyRes.data : [];
        setDailyEntries(dailyRaw.map((row: Record<string, unknown>) => normalizeRemoteRow(row)));
      } catch (dailyErr: unknown) {
        console.warn('[leaderboard] GET /leaderboard/daily failed (global list still shown)', {
          message: isAxiosError(dailyErr)
            ? dailyErr.message
            : dailyErr instanceof Error
              ? dailyErr.message
              : String(dailyErr),
          status: isAxiosError(dailyErr) ? dailyErr.response?.status : undefined,
          data: isAxiosError(dailyErr) ? dailyErr.response?.data : undefined,
        });
        setDailyEntries([]);
      }

      if (__DEV__) {
        console.log('[leaderboard] GET OK', {
          globalCount: rawList.length,
          seed: getDailySeed(),
        });
      }
    } catch (err: unknown) {
      const msg = isAxiosError(err)
        ? (typeof err.response?.data === 'object' &&
          err.response?.data !== null &&
          'detail' in err.response.data
            ? String((err.response.data as { detail: unknown }).detail)
            : err.message)
        : err instanceof Error
          ? err.message
          : 'Could not load leaderboard';
      console.warn('[leaderboard] GET /leaderboard failed', {
        message: msg,
        status: isAxiosError(err) ? err.response?.status : undefined,
        data: isAxiosError(err) ? err.response?.data : undefined,
      });
      setError(msg);
      setEntries([]);
      setDailyEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isBackendConfigured()) {
        setLoading(false);
        return;
      }
      void loadLeaderboard();
    }, [loadLeaderboard])
  );

  useEffect(() => {
    if (!isBackendConfigured()) return;
    if (!lbMountRef.current) {
      lbMountRef.current = true;
      prevLbRef.current = lastLbUpdate;
      return;
    }
    if (lastLbUpdate > 0 && lastLbUpdate !== prevLbRef.current) {
      prevLbRef.current = lastLbUpdate;
      void loadLeaderboard();
    }
  }, [lastLbUpdate, loadLeaderboard]);

  const globalDisplayEntries = useMemo(() => {
    void lastLbUpdate;
    void nickname;
    let list = [...entries];
    if (playerId && isServerBackedPlayerId(playerId)) {
      list = list.filter((e) => e.player_id !== playerId);
      list.push(entryFromPlayerStore(usePlayerStore.getState()));
    }
    list.sort(compareEntries);
    return list;
  }, [entries, playerId, nickname, lastLbUpdate]);

  const dailySorted = useMemo(() => {
    return [...dailyEntries].sort(compareEntries);
  }, [dailyEntries]);

  const activeEntries = mode === 'daily' ? dailySorted : globalDisplayEntries;

  const globalPlayerRank = useMemo(() => {
    if (!playerId || !isServerBackedPlayerId(playerId)) return null;
    const ix = globalDisplayEntries.findIndex((e) => e.player_id === playerId);
    return ix >= 0 ? ix + 1 : null;
  }, [globalDisplayEntries, playerId]);

  const dailyPlayerRank = useMemo(() => {
    if (!playerId) return null;
    const ix = dailySorted.findIndex((e) => e.player_id === playerId);
    return ix >= 0 ? ix + 1 : null;
  }, [dailySorted, playerId]);

  const activePlayerRank = mode === 'global' ? globalPlayerRank : dailyPlayerRank;

  const localOnlyRows = useMemo(() => {
    void nickname;
    void lifetimeEnemiesKilled;
    void lastRunGemsEarned;
    void lastLbUpdate;
    if (isBackendConfigured()) return [];
    return [entryFromPlayerStore(usePlayerStore.getState())].sort(compareEntries);
  }, [nickname, lifetimeEnemiesKilled, lastRunGemsEarned, lastLbUpdate]);

  const listData = isBackendConfigured() ? activeEntries : localOnlyRows;

  const bannerRank =
    !isBackendConfigured() && listData.length > 0 ? 1 : activePlayerRank;

  const showEmpty = !loading && listData.length === 0 && !error;
  const scoreBanner = lifetimeEnemiesKilled + lastRunGemsEarned;

  const onRefresh = () => {
    setRefreshing(true);
    void loadLeaderboard();
  };

  const renderItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isCurrentPlayer = item.player_id === playerId;
    const rank = index + 1;
    const score = sortKey(item)[0];

    return (
      <View style={[styles.entryContainer, isCurrentPlayer && styles.currentPlayerEntry]}>
        <View style={styles.rankContainer}>
          {rank <= 3 ? (
            <MaterialCommunityIcons
              name="trophy"
              size={24}
              color={TacticalTheme.accent}
            />
          ) : (
            <Text style={styles.rankText}>{rank}</Text>
          )}
        </View>

        <View style={styles.playerInfo}>
          <View style={styles.nicknameRow}>
            <PlayerLogoBadge logoId={item.logo_id} size={18} />
            <Text style={[styles.nickname, isCurrentPlayer && styles.currentPlayerText]}>
              {item.nickname}
              {isCurrentPlayer && ' (You)'}
            </Text>
          </View>
          <Text style={styles.stats}>
            Kills (total): {item.lifetime_enemies_killed} | Run gems: {item.last_run_gems} | Best wave:{' '}
            {item.best_wave}
          </Text>
        </View>

        <View style={styles.scoreContainer}>
          <MaterialCommunityIcons name="skull" size={18} color={TacticalTheme.accent} />
          <Text style={styles.scoreText}>{score}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={TacticalTheme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Leaderboard</Text>
        <View style={styles.backButton} />
      </View>

      {bannerRank != null && (
        <View style={styles.rankBanner}>
          <Text style={styles.rankBannerText}>Your rank: #{bannerRank}</Text>
          <Text style={styles.rankBannerSubtext}>
            Score {scoreBanner} (total kills + last run gems){' '}
            {!isBackendConfigured() ? '· Offline' : ''}
          </Text>
        </View>
      )}

      {!isBackendConfigured() && (
        <View style={styles.offlineHint}>
          <Text style={styles.offlineHintText}>
            No server URL configured — showing this device only. Connect a backend to see global rankings.
          </Text>
        </View>
      )}

      <View style={styles.modeTabs}>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'global' && styles.modeTabActive]}
          onPress={() => setMode('global')}
        >
          <Text style={[styles.modeTabText, mode === 'global' && styles.modeTabTextActive]}>Global</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'daily' && styles.modeTabActive]}
          onPress={() => setMode('daily')}
        >
          <Text style={[styles.modeTabText, mode === 'daily' && styles.modeTabTextActive]}>Daily seed</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void loadLeaderboard({ fullScreenLoading: true })}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TacticalTheme.accent} />
          <Text style={styles.loadingSub}>Loading rankings…</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item._id || item.player_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TacticalTheme.accent} />
          }
          ListEmptyComponent={
            showEmpty ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="trophy-outline" size={64} color="#333" />
                <Text style={styles.emptyText}>No entries yet</Text>
                <Text style={styles.emptySubtext}>Finish a run to appear on the board.</Text>
              </View>
            ) : null
          }
        />
      )}
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
  rankBanner: {
    backgroundColor: TacticalTheme.panel,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  rankBannerText: {
    color: TacticalTheme.accent,
    fontSize: 24,
    fontWeight: 'bold',
  },
  rankBannerSubtext: {
    color: TacticalTheme.textMuted,
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  offlineHint: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: TacticalTheme.panelAlt,
  },
  offlineHintText: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: TacticalTheme.panel,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
  },
  modeTabActive: {
    backgroundColor: TacticalTheme.accent,
    borderColor: TacticalTheme.accent,
  },
  modeTabText: {
    color: TacticalTheme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  modeTabTextActive: {
    color: TacticalTheme.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingSub: {
    color: TacticalTheme.textMuted,
    marginTop: 12,
    fontSize: 14,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: TacticalTheme.panelAlt,
    borderWidth: 1,
    borderColor: TacticalTheme.borderStrong,
  },
  errorText: {
    color: TacticalTheme.textMuted,
    fontSize: 13,
    marginBottom: 8,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: TacticalTheme.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: {
    color: TacticalTheme.text,
    fontWeight: '700',
    fontSize: 13,
  },
  listContent: {
    padding: 16,
  },
  entryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TacticalTheme.panel,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  currentPlayerEntry: {
    borderWidth: 2,
    borderColor: TacticalTheme.accent,
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  rankText: {
    color: TacticalTheme.textSubtle,
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nicknameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nickname: {
    color: TacticalTheme.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  currentPlayerText: {
    color: TacticalTheme.accent,
  },
  stats: {
    color: TacticalTheme.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    color: TacticalTheme.accent,
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: TacticalTheme.textMuted,
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: TacticalTheme.textSubtle,
    fontSize: 14,
    marginTop: 8,
  },
});
