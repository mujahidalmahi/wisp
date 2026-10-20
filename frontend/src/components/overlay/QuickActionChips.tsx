import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { QuickActionChip } from '../../types/wisp';
import { TVTheme } from '../../theme/tvTheme';

interface Props {
  chips: QuickActionChip[];
  onSelectChip: (chip: QuickActionChip) => void;
  disabled?: boolean;
}

export const QuickActionChips: React.FC<Props> = ({ chips, onSelectChip, disabled }) => {
  const [focusedId, setFocusedId] = useState<string | null>(chips[0]?.id ?? null);

  return (
    <View style={styles.container}>
      {chips.map((chip, idx) => {
        const isFocused = focusedId === chip.id;
        return (
          <Pressable
            key={chip.id}
            hasTVPreferredFocus={idx === 0}
            disabled={disabled}
            onFocus={() => setFocusedId(chip.id)}
            onBlur={() => setFocusedId(null)}
            onPress={() => onSelectChip(chip)}
            style={[styles.chip, isFocused && styles.chipFocused]}
          >
            <Text style={[styles.chipText, isFocused && styles.chipTextFocused]}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    gap: TVTheme.spacing.chipGap,
    marginTop: 14,
  },
  chip: {
    backgroundColor: TVTheme.colors.cardSurface,
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: TVTheme.colors.cardBorder,
  },
  chipFocused: {
    backgroundColor: TVTheme.colors.cardFocused,
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2.5,
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  chipText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.body10Foot,
    fontWeight: '700',
    lineHeight: 28,
  },
  chipTextFocused: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
