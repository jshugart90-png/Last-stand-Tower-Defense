import React, { useEffect, useMemo } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../src/stores/playerStore';
import { GAME_MAPS, getDifficultyColor, type MapDefinition } from '../src/constants/maps';
import { TacticalTheme } from '../src/theme/colors';

const MapCard = ({
  map,
  selected,
  unlocked,
  bestWave,
  onSelect,
  onUnlock,
}: {
  map: MapDefinition;
  selected: boolean;
  unlocked: boolean;
  bestWave: number;
  onSelect: () => void;
  onUnlock: () => void;
}) => {
  const color = getDifficultyColor(map.difficulty);
  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      <View style={[styles.difficultyPill, { borderColor: color }]}>
        <Text style={[styles.difficultyText, { color }]}>{map.difficulty.toUpperCase()}</Text>
      </View>
      <Text style={styles.cardTitle}>{map.name}</Text>
      <View style={styles.bestWaveRow}>
        <MaterialCommunityIcons name="trophy-outline" size={14} color={TacticalTheme.accent} />
        <Text style={styles.bestWaveText}>Best Wave {bestWave}</Text>
      </View>
      <Text style={styles.cardDesc}>{map.description}</Text>
      <Text style={styles.cardMeta}>Route nodes: {map.pathWaypoints.length}</Text>
      {map.unlock ? (
        <Text style={styles.unlockMeta}>
          Unlock: {map.unlock.gemCost} gems OR Wave {map.unlock.previousMapWave}+ on previous map
        </Text>
      ) : (
        <Text style={styles.unlockMeta}>Starter map · standard route and pacing</Text>
      )}
      <View style={styles.cardActions}>
        {unlocked ? (
          <TouchableOpacity style={[styles.cardBtn, styles.cardBtnPrimary]} onPress={onSelect}>
            <Text style={styles.cardBtnPrimaryText}>{selected ? 'Selected' : 'Select'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.cardBtn, styles.cardBtnDanger]} onPress={onUnlock}>
            <Text style={styles.cardBtnDangerText}>Unlock</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default function MapSelectionScreen() {
  const router = useRouter();
  const {
    gems,
    currentMapId,
    mapBestWaves,
    setCurrentMapId,
    unlockMapWithGems,
    unlockMapByProgress,
  } = usePlayerStore();

  const unlockedMapIds = usePlayerStore((s) => s.unlockedMapIds);

  const progressUnlockIds = useMemo(() => {
    const ids: string[] = [];
    for (const m of GAME_MAPS) {
      if (!m.unlock) continue;
      const prevBest = mapBestWaves[m.unlock.previousMapId] ?? 0;
      if (prevBest >= m.unlock.previousMapWave) ids.push(m.id);
    }
    return ids;
  }, [mapBestWaves]);

  useEffect(() => {
    for (const id of progressUnlockIds) {
      if (!unlockedMapIds.includes(id)) unlockMapByProgress(id);
    }
  }, [progressUnlockIds, unlockedMapIds, unlockMapByProgress]);

  const resolvedUnlocks = useMemo(() => {
    const unlocked = new Set(unlockedMapIds);
    for (const m of GAME_MAPS) {
      if (!m.unlock) {
        unlocked.add(m.id);
      }
    }
    return unlocked;
  }, [unlockedMapIds]);

  const startSelectedMap = () => {
    router.push('/game');
  };

  const renderMap = ({ item }: { item: MapDefinition }) => {
    const unlocked = resolvedUnlocks.has(item.id);
    const bestWave = mapBestWaves[item.id] ?? 0;
    return (
      <MapCard
        map={item}
        selected={currentMapId === item.id}
        unlocked={unlocked}
        bestWave={bestWave}
        onSelect={() => setCurrentMapId(item.id)}
        onUnlock={() => {
          if (!item.unlock) return;
          if (gems < item.unlock.gemCost) {
            Alert.alert(
              'Not enough gems',
              `Need ${item.unlock.gemCost} gems or hit Wave ${item.unlock.previousMapWave}+ on ${GAME_MAPS.find((m) => m.id === item.unlock?.previousMapId)?.name}.`
            );
            return;
          }
          Alert.alert('Unlock map', `Spend ${item.unlock.gemCost} gems to unlock ${item.name}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Unlock',
              onPress: () => {
                const ok = unlockMapWithGems(item.id, item.unlock!.gemCost);
                if (ok) setCurrentMapId(item.id);
              },
            },
          ]);
        }}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={TacticalTheme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Map Selection</Text>
        <View style={styles.gemWrap}>
          <MaterialCommunityIcons name="diamond-stone" size={14} color={TacticalTheme.accent} />
          <Text style={styles.gemText}>{gems}</Text>
        </View>
      </View>

      <FlatList
        data={GAME_MAPS}
        keyExtractor={(item) => item.id}
        renderItem={renderMap}
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.startBtn} onPress={startSelectedMap}>
          <Ionicons name="play" size={20} color={TacticalTheme.white} />
          <Text style={styles.startBtnText}>Start Selected Map</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TacticalTheme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: TacticalTheme.border,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: TacticalTheme.text, fontSize: 20, fontWeight: '800' },
  gemWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gemText: { color: TacticalTheme.text, fontWeight: '700' },
  listContent: { padding: 14, gap: 10, paddingBottom: 120 },
  card: {
    backgroundColor: TacticalTheme.panel,
    borderColor: TacticalTheme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  cardSelected: { borderColor: TacticalTheme.accent, backgroundColor: TacticalTheme.panelAlt },
  difficultyPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  difficultyText: { fontSize: 10, fontWeight: '800' },
  cardTitle: { color: TacticalTheme.text, fontSize: 18, fontWeight: '800' },
  bestWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  bestWaveText: {
    color: TacticalTheme.text,
    fontSize: 13,
    fontWeight: '800',
  },
  cardDesc: { color: TacticalTheme.textMuted, marginTop: 4, fontSize: 12 },
  cardMeta: { color: TacticalTheme.textSubtle, marginTop: 8, fontSize: 12 },
  unlockMeta: { color: '#d8a8a8', marginTop: 4, fontSize: 11 },
  cardActions: { marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  cardBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  cardBtnPrimary: { backgroundColor: TacticalTheme.accent },
  cardBtnDanger: { backgroundColor: TacticalTheme.accentSoft },
  cardBtnPrimaryText: { color: TacticalTheme.white, fontWeight: '700' },
  cardBtnDangerText: { color: TacticalTheme.white, fontWeight: '700' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: TacticalTheme.border,
    backgroundColor: TacticalTheme.bgElevated,
    padding: 12,
  },
  startBtn: {
    backgroundColor: TacticalTheme.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  startBtnText: { color: TacticalTheme.white, fontWeight: '800', fontSize: 16 },
});
