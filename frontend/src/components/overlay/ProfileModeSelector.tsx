import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HouseholdProfileMode } from '../../types/wisp';
import { TVTheme } from '../../theme/tvTheme';

interface Props {
  activeMode: HouseholdProfileMode;
  onChangeMode: (mode: HouseholdProfileMode) => void;
}

const MODES: Array<{ mode: HouseholdProfileMode; label: string }> = [
  { mode: 'quick_glance', label: 'Quick Glance' },
  { mode: 'deep_lore', label: 'Deep Lore' },
  { mode: 'family_friendly', label: 'Family Mode' },
];

export const ProfileModeSelector: React.FC<Props> = ({ activeMode, onChangeMode }) => {
  const [focusedMode, setFocusedMode] = useState<HouseholdProfileMode | null>(null);

  return (
    <View style={styles.row}>
      {MODES.map((item) => {
        const isActive = activeMode === item.mode;
        const isFocused = focusedMode === item.mode;
        return (
          <Pressable
            key={item.mode}
            onFocus={() => setFocusedMode(item.mode)}
            onBlur={() => setFocusedMode(null)}
            onPress={() => onChangeMode(item.mode)}
            style={[
              styles.pill,
              isActive && styles.pillActive,
              isFocused && styles.pillFocused,
            ]}
          >
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: TVTheme.colors.cardSurface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pillActive: {
    backgroundColor: '#1E3A8A',
  },
  pillFocused: {
    borderColor: TVTheme.colors.focusRing,
  },
  pillText: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.caption,
    fontWeight: '600',
  },
  pillTextActive: {
    color: TVTheme.colors.textPrimary,
  },
});
