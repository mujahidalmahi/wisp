import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TVTheme } from '../../theme/tvTheme';

import { CatalogProgram, DEMO_PROGRAMS } from '../../config/catalog';
export { CatalogProgram, DEMO_PROGRAMS };

interface Props {
  visible: boolean;
  currentEpisodeId: string;
  onSelectProgram: (program: CatalogProgram) => void;
  onClose: () => void;
}

export const CatalogSelector: React.FC<Props> = ({
  visible,
  currentEpisodeId,
  onSelectProgram,
  onClose,
}) => {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.modal}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.modalTitle}>WISP DEMO CATALOG</Text>
            <Text style={styles.modalSubtitle}>
              Select a genre to test temporal context, anti-spoiler locks & live AI
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕ Close (Back)</Text>
          </Pressable>
        </View>

        {/* Program Cards Grid */}
        <View style={styles.grid}>
          {DEMO_PROGRAMS.map((item, idx) => {
            const isSelected = item.episodeId === currentEpisodeId;
            const isFocused = focusedId === item.episodeId;

            return (
              <Pressable
                key={item.episodeId}
                hasTVPreferredFocus={idx === 0}
                onFocus={() => setFocusedId(item.episodeId)}
                onBlur={() => setFocusedId(null)}
                onPress={() => {
                  onSelectProgram(item);
                  onClose();
                }}
                style={[
                  styles.card,
                  isSelected && styles.cardSelected,
                  isFocused && styles.cardFocused,
                ]}
              >
                <View style={styles.genreBadge}>
                  <Text style={styles.genreBadgeText}>{item.genre}</Text>
                </View>

                <Text style={styles.titleText}>{item.title}</Text>
                <Text style={styles.episodeText}>{item.episodeTitle}</Text>
                <Text style={styles.taglineText}>"{item.tagline}"</Text>
                <Text style={styles.synopsisText} numberOfLines={3}>
                  {item.synopsis}
                </Text>

                <View style={styles.cardFooter}>
                  <Text style={styles.durationText}>
                    ⏱ {Math.floor(item.durationSeconds / 60)} min runtime
                  </Text>
                  {isSelected && (
                    <View style={styles.nowPlayingBadge}>
                      <Text style={styles.nowPlayingText}>NOW PLAYING</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 11, 16, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: TVTheme.spacing.overscanHorizontal,
    paddingVertical: TVTheme.spacing.overscanVertical,
    zIndex: 999,
  },
  modal: {
    width: '100%',
    maxWidth: 1040,
    backgroundColor: TVTheme.colors.cardSurface,
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: '#334155',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  modalTitle: {
    color: TVTheme.colors.focusRing,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 2,
  },
  modalSubtitle: {
    color: TVTheme.colors.textSecondary,
    fontSize: 16,
    marginTop: 4,
  },
  closeButton: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  closeButtonText: {
    color: TVTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    gap: 18,
  },
  card: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'space-between',
  },
  cardSelected: {
    borderColor: TVTheme.colors.accentCyan,
    backgroundColor: 'rgba(30, 58, 138, 0.25)',
  },
  cardFocused: {
    borderColor: TVTheme.colors.focusRing,
    backgroundColor: TVTheme.colors.cardFocused,
    transform: [{ scale: 1.03 }],
  },
  genreBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
  },
  genreBadgeText: {
    color: TVTheme.colors.accentCyan,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  titleText: {
    color: TVTheme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  episodeText: {
    color: TVTheme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  taglineText: {
    color: TVTheme.colors.focusRing,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  synopsisText: {
    color: TVTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 12,
  },
  durationText: {
    color: TVTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  nowPlayingBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nowPlayingText: {
    color: TVTheme.colors.spoilerSafeBadge,
    fontSize: 10,
    fontWeight: '800',
  },
});
