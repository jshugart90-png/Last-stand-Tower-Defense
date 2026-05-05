import React, { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { TacticalTheme } from '../theme/colors';
import { MissionResetHints } from './MissionResetHints';
import type { DailyMission } from '../constants/progression';

type Props = {
  visible: boolean;
  missions: DailyMission[];
  onClose: () => void;
  onClaim?: (missionId: string) => void;
};

export function DailyMissionsModal({ visible, missions, onClose, onClaim }: Props) {
  const [claimedIds, setClaimedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setClaimedIds((prev) => {
      const next: Record<string, boolean> = {};
      for (const m of missions) {
        if (m.completed && prev[m.id]) next[m.id] = true;
      }
      return next;
    });
  }, [missions]);

  const completedCount = useMemo(() => missions.filter((m) => m.completed).length, [missions]);

  const handleClaim = (missionId: string) => {
    setClaimedIds((prev) => ({ ...prev, [missionId]: true }));
    onClaim?.(missionId);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Daily Missions</Text>
              <Text style={styles.subtitle}>
                {completedCount}/{missions.length} completed
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color={TacticalTheme.text} />
            </TouchableOpacity>
          </View>

          <MissionResetHints />

          <View style={styles.list}>
            {missions.map((mission) => {
              const progress = Math.min(1, mission.target > 0 ? mission.progress / mission.target : 0);
              const claimed = !!claimedIds[mission.id];
              const canClaim = mission.completed && !claimed;
              return (
                <View key={mission.id} style={styles.card}>
                  <Text style={styles.missionTitle}>{mission.label}</Text>
                  <View style={styles.progressRow}>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                    </View>
                    <Text style={styles.progressText}>
                      {Math.min(mission.progress, mission.target)}/{mission.target}
                    </Text>
                  </View>
                  <View style={styles.footerRow}>
                    <View style={styles.rewardWrap}>
                      <MaterialCommunityIcons name="diamond-stone" size={14} color={TacticalTheme.accent} />
                      <Text style={styles.rewardText}>+{mission.rewardGems}</Text>
                    </View>
                    {mission.completed ? (
                      <TouchableOpacity
                        style={[styles.claimBtn, !canClaim && styles.claimBtnDone]}
                        disabled={!canClaim}
                        onPress={() => handleClaim(mission.id)}
                      >
                        <Text style={styles.claimText}>{canClaim ? 'Claim' : 'Claimed'}</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.pendingPill}>
                        <Text style={styles.pendingText}>In Progress</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: TacticalTheme.bg,
    borderTopWidth: 1,
    borderTopColor: TacticalTheme.border,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 24,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { color: TacticalTheme.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: TacticalTheme.textMuted, fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    backgroundColor: TacticalTheme.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: 10, marginTop: 8 },
  card: {
    backgroundColor: TacticalTheme.panel,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    borderRadius: 12,
    padding: 12,
  },
  missionTitle: { color: TacticalTheme.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: {
    flex: 1,
    height: 9,
    borderRadius: 999,
    backgroundColor: TacticalTheme.bgElevated,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: TacticalTheme.accent,
    borderRadius: 999,
  },
  progressText: { color: TacticalTheme.textMuted, fontSize: 11, fontWeight: '700', width: 64, textAlign: 'right' },
  footerRow: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rewardWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rewardText: { color: TacticalTheme.text, fontWeight: '800', fontSize: 13 },
  claimBtn: {
    backgroundColor: TacticalTheme.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  claimBtnDone: { backgroundColor: TacticalTheme.panelAlt, borderWidth: 1, borderColor: TacticalTheme.border },
  claimText: { color: TacticalTheme.white, fontWeight: '800', fontSize: 12 },
  pendingPill: {
    backgroundColor: TacticalTheme.bgElevated,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingText: { color: TacticalTheme.textSubtle, fontSize: 11, fontWeight: '700' },
});
