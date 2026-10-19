import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TVTheme } from '../../theme/tvTheme';
import { useTVResponsive } from '../../hooks/useTVResponsive';
import { CatalogProgram, DEMO_PROGRAMS } from '../../config/catalog';
export { CatalogProgram, DEMO_PROGRAMS };

interface Props {
  visible: boolean;
  currentEpisodeId: string;
  programs?: CatalogProgram[];
  onSelectProgram: (program: CatalogProgram) => void;
  onClose: () => void;
}

export const CatalogSelector: React.FC<Props> = ({
  visible,
  currentEpisodeId,
  programs = DEMO_PROGRAMS,
  onSelectProgram,
  onClose,
}) => {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isCloseFocused, setIsCloseFocused] = useState(false);

  const { catalogMaxWidth } = useTVResponsive();

  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <View style={[styles.modal, { maxWidth: catalogMaxWidth }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.modalTitle}>WISP DEMO CATALOG</Text>
            <Text style={styles.modalSubtitle}>
              Select a genre to test temporal context, anti-spoiler locks & live AI
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            onFocus={() => setIsCloseFocused(true)}
            onBlur={() => setIsCloseFocused(false)}
            style={[styles.closeButton, isCloseFocused && styles.closeButtonFocused]}
          >
            <Text style={[styles.closeButtonText, isCloseFocused && styles.closeButtonTextFocused]}>
              ✕ Close (Back / Esc)
            </Text>
          </Pressable>
        </View>

        {/* Program Cards Grid with Horizontal Scrolling */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContainer}
        >
          <View style={styles.grid}>
            {programs.map((item, idx) => {
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
                  <Text style={styles.synopsisText} numberOfLines={4}>
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
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 12, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: TVTheme.spacing.overscanHorizontal,
    paddingVertical: TVTheme.spacing.overscanVertical,
    zIndex: 999,
  },
  modal: {
    width: '100%',
    backgroundColor: TVTheme.colors.cardSurface,
    borderRadius: 24,
    padding: 32,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.cardBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  modalTitle: {
    color: TVTheme.colors.focusRing,
    fontSize: TVTheme.typography.cardHeadline,
    fontWeight: '800',
    letterSpacing: 2,
  },
  modalSubtitle: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.subtitle,
    marginTop: 6,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: TVTheme.colors.cardSurface,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: TVTheme.colors.cardBorder,
  },
  closeButtonFocused: {
    borderColor: TVTheme.colors.focusRing,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  closeButtonText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.buttonText,
    fontWeight: '700',
  },
  closeButtonTextFocused: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  scrollContainer: {
    paddingVertical: 8,
  },
  grid: {
    flexDirection: 'row',
    gap: 20,
  },
  card: {
    width: 320,
    backgroundColor: TVTheme.colors.cardSurface,
    borderRadius: 18,
    padding: 22,
    borderWidth: 2,
    borderColor: TVTheme.colors.cardBorder,
    justifyContent: 'space-between',
  },
  cardSelected: {
    borderColor: TVTheme.colors.cardBorderFocused,
    backgroundColor: TVTheme.colors.cardFocused,
  },
  cardFocused: {
    borderColor: TVTheme.colors.focusRing,
    backgroundColor: TVTheme.colors.cardFocused,
    borderWidth: 2.5,
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  genreBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.focusRing,
    marginBottom: 14,
  },
  genreBadgeText: {
    color: TVTheme.colors.focusRing,
    fontSize: TVTheme.typography.badge,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  titleText: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.cardHeadline,
    fontWeight: '800',
    marginBottom: 6,
  },
  episodeText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.subtitle,
    fontWeight: '700',
    marginBottom: 10,
  },
  taglineText: {
    color: TVTheme.colors.focusRing,
    fontSize: TVTheme.typography.buttonText,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  synopsisText: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.buttonText,
    lineHeight: 26,
    marginBottom: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: TVTheme.colors.cardBorder,
    paddingTop: 14,
  },
  durationText: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.badge,
    fontWeight: '700',
  },
  nowPlayingBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TVTheme.colors.spoilerSafeBadge,
  },
  nowPlayingText: {
    color: TVTheme.colors.spoilerSafeBadge,
    fontSize: TVTheme.typography.badge,
    fontWeight: '800',
  },
});
