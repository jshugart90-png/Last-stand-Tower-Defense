import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TacticalTheme } from '../theme/colors';

interface BannerAdComponentProps {
  isPremium?: boolean;
}

// Web fallback - just show placeholder
const BannerAdComponent: React.FC<BannerAdComponentProps> = ({ isPremium = false }) => {
  if (isPremium) return null;

  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Ad Space</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    height: 50,
    backgroundColor: TacticalTheme.panel,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: TacticalTheme.border,
  },
  placeholderText: {
    color: TacticalTheme.textSubtle,
    fontSize: 12,
  },
});

export default BannerAdComponent;
