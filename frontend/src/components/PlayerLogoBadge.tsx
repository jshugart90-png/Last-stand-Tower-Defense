import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DEFAULT_PLAYER_LOGO_ID, PLAYER_LOGO_BY_ID } from '../constants/logos';
import { TacticalTheme } from '../theme/colors';

type Props = {
  logoId?: string | null;
  size?: number;
  showLabel?: boolean;
};

export function PlayerLogoBadge({ logoId, size = 28, showLabel = false }: Props) {
  const logo = PLAYER_LOGO_BY_ID[logoId ?? ''] ?? PLAYER_LOGO_BY_ID[DEFAULT_PLAYER_LOGO_ID];
  const iconSize = Math.max(12, Math.floor(size * 0.56));
  const radius = Math.floor(size / 2);

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.badge,
          {
            width: size,
            height: size,
            borderRadius: radius,
          },
        ]}
      >
        <MaterialCommunityIcons name={logo.icon as any} size={iconSize} color={TacticalTheme.white} />
      </View>
      {showLabel ? <Text style={styles.label}>{logo.name}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    backgroundColor: TacticalTheme.accent,
    borderWidth: 1,
    borderColor: TacticalTheme.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: TacticalTheme.textMuted, fontSize: 11, fontWeight: '700' },
});
