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
    marginTop: 12,
  },
  chip: {
    backgroundColor: TVTheme.colors.cardSurface,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipFocused: {
    backgroundColor: TVTheme.colors.cardFocused,
    borderColor: TVTheme.colors.focusRing,
    transform: [{ scale: 1.02 }],
  },
  chipText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.chipLabel,
    fontWeight: '600',
  },
  chipTextFocused: {
    color: TVTheme.colors.textPrimary,
  },
});
