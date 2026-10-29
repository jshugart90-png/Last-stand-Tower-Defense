import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { gridForArenaSize } from '../logic/arenaSize';
import { TacticalTheme } from '../theme/colors';

export function arenaSizeName(size: number): string {
  if (size <= 0) return 'Original';
  return `Size ${size}`;
}

/** Sizes the player already owns. Choosing one does not change a saved run. */
export function ArenaSizePicker({
  owned,
  selected,
  onSelect,
}: {
  owned: number;
  selected: number;
  onSelect: (size: number) => void;
}) {
  const max = Math.max(0, Math.floor(owned));
  const sizes = Array.from({ length: max + 1 }, (_, i) => i);
  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>Free Play field. A saved game keeps the size it started with.</Text>
      <View style={styles.row}>
        {sizes.map((size) => {
          const grid = gridForArenaSize(size);
          const on = size === selected;
          return (
            <TouchableOpacity
              key={size}
              testID={`arena-size-${size}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onSelect(size)}
            >
              <Text style={[styles.chipTitle, on && styles.chipTitleOn]}>{arenaSizeName(size)}</Text>
              <Text style={[styles.chipMeta, on && styles.chipMetaOn]}>
                {grid.cols}×{grid.rows}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginBottom: 8 },
  hint: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 72,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: TacticalTheme.surfaceDeep,
  },
  chipOn: {
    borderColor: TacticalTheme.accent,
    backgroundColor: TacticalTheme.panel,
  },
  chipTitle: { color: '#ddd', fontSize: 13, fontWeight: '700' },
  chipTitleOn: { color: '#fff' },
  chipMeta: { color: '#888', fontSize: 11, marginTop: 2 },
  chipMetaOn: { color: TacticalTheme.accent },
});
