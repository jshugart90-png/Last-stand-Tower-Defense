import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

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
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  placeholderText: {
    color: '#444',
    fontSize: 12,
  },
});

export default BannerAdComponent;
