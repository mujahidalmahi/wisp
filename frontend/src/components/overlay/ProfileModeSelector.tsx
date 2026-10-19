import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HouseholdProfileMode } from '../../types/wisp';
import { TVTheme } from '../../theme/tvTheme';

interface Props {
  activeMode: HouseholdProfileMode;
  onChangeMode: (mode: HouseholdProfileMode) => void;
}

const MODES: Array<{ mode: HouseholdProfileMode; label: string }> = [
  { mode: 'quick_glance', label: 'Quick' },
  { mode: 'deep_lore', label: 'Deep Lore' },
  { mode: 'family_friendly', label: 'Family' },
];

export const ProfileModeSelector: React.FC<Props> = ({ activeMode, onChangeMode }) => {
  const [focusedMode, setFocusedMode] = useState<HouseholdProfileMode | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MODE</Text>
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
              <Text
                style={[
                  styles.pillText,
                  isActive && styles.pillTextActive,
                  isFocused && styles.pillTextFocused,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
  },
  title: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.microTime,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: TVTheme.colors.cardSurface,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: TVTheme.colors.activeTabBackground,
    borderColor: '#4A4A52',
  },
  pillFocused: {
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2,
    backgroundColor: TVTheme.colors.focusGlowWash,
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  pillText: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.buttonText,
    fontWeight: '700',
  },
  pillTextActive: {
    color: TVTheme.colors.textPrimary,
    fontWeight: '800',
  },
  pillTextFocused: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
