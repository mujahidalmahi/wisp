import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TVTheme } from '../../theme/tvTheme';

interface Props {
  programTitle: string;
  episodeTitle: string;
  genre?: string;
  playbackPositionMs: number;
  durationMs?: number;
  overlayVisible: boolean;
  onInvokeWisp: () => void;
  onAdvanceTimestamp: (deltaMs: number) => void;
  onOpenCatalog?: () => void;
}

export const VideoPlayerSurface: React.FC<Props> = ({
  programTitle,
  episodeTitle,
  genre,
  playbackPositionMs,
  durationMs = 734000,
  overlayVisible,
  onInvokeWisp,
  onAdvanceTimestamp,
  onOpenCatalog,
}) => {
  const [isCatalogFocused, setIsCatalogFocused] = useState<boolean>(false);
  const [isWispFocused, setIsWispFocused] = useState<boolean>(false);
  const [isRewindFocused, setIsRewindFocused] = useState<boolean>(false);
  const [isForwardFocused, setIsForwardFocused] = useState<boolean>(false);

  const sec = Math.floor(playbackPositionMs / 1000);
  const formattedTime = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(
    sec % 60,
  ).padStart(2, '0')}`;

  const totalSec = Math.floor(durationMs / 1000);
  const formattedTotal = `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(
    totalSec % 60,
  ).padStart(2, '0')}`;

  const progressPercent = Math.min(100, Math.max(0, (playbackPositionMs / durationMs) * 100));

  return (
    <View style={styles.viewport}>
      {/* Top HUD */}
      <View style={styles.hudTopRow}>
        <View style={styles.hudTopLeft}>
          <View style={styles.genreTagRow}>
            {genre && (
              <View style={styles.genreBadge}>
                <Text style={styles.genreBadgeText}>{genre}</Text>
              </View>
            )}
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>TEMPORAL PLAYHEAD</Text>
            </View>
          </View>
          <Text style={styles.programTitle}>{programTitle}</Text>
          <Text style={styles.episodeTitle}>
            {episodeTitle} • {formattedTime} / {formattedTotal}
          </Text>
        </View>

        {!overlayVisible && onOpenCatalog && (
          <Pressable
            onPress={onOpenCatalog}
            onFocus={() => setIsCatalogFocused(true)}
            onBlur={() => setIsCatalogFocused(false)}
            style={[
              styles.catalogButton,
              isCatalogFocused && styles.catalogButtonFocused,
            ]}
          >
            <Text
              style={[
                styles.catalogButtonText,
                isCatalogFocused && styles.catalogButtonTextFocused,
              ]}
            >
              📚 Switch Program
            </Text>
          </Pressable>
        )}
      </View>

      {/* Center Simulated Cinema Canvas */}
      <View style={styles.centerCanvas}>
        <View style={styles.cinemaSimBox}>
          <Text style={styles.cinemaWatermark}>WISP 10-FOOT CINEMA SURFACE</Text>
          <Text style={styles.cinemaSubmark}>
            Active Video Frame @ {formattedTime} • Spoiler Gate Enforced
          </Text>
        </View>
      </View>

      {/* Bottom Bar & Timeline */}
      {!overlayVisible && (
        <View style={styles.bottomSection}>
          {/* Temporal Progress Bar */}
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            <View style={[styles.progressScrubberKnob, { left: `${progressPercent}%` }]} />
          </View>

          <View style={styles.bottomBar}>
            <Pressable
              hasTVPreferredFocus
              onPress={onInvokeWisp}
              onFocus={() => setIsWispFocused(true)}
              onBlur={() => setIsWispFocused(false)}
              style={[
                styles.wispButton,
                isWispFocused && styles.wispButtonFocused,
              ]}
            >
              <Text style={styles.wispButtonText}>✨ Invoke Wisp (Menu / Select)</Text>
            </Pressable>

            <View style={styles.controlsGroup}>
              <Pressable
                onPress={() => onAdvanceTimestamp(-30000)}
                onFocus={() => setIsRewindFocused(true)}
                onBlur={() => setIsRewindFocused(false)}
                style={[
                  styles.scrubButton,
                  isRewindFocused && styles.scrubButtonFocused,
                ]}
              >
                <Text
                  style={[
                    styles.scrubButtonText,
                    isRewindFocused && styles.scrubButtonTextFocused,
                  ]}
                >
                  -0:30 Rewind
                </Text>
              </Pressable>

              <Pressable
                onPress={() => onAdvanceTimestamp(60000)}
                onFocus={() => setIsForwardFocused(true)}
                onBlur={() => setIsForwardFocused(false)}
                style={[
                  styles.scrubButton,
                  isForwardFocused && styles.scrubButtonFocused,
                ]}
              >
                <Text
                  style={[
                    styles.scrubButtonText,
                    isForwardFocused && styles.scrubButtonTextFocused,
                  ]}
                >
                  +1:00 Forward
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    backgroundColor: TVTheme.colors.background,
    justifyContent: 'space-between',
    paddingHorizontal: TVTheme.spacing.overscanHorizontal,
    paddingVertical: TVTheme.spacing.overscanVertical,
  },
  hudTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hudTopLeft: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignSelf: 'flex-start',
  },
  genreTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  genreBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: TVTheme.colors.accentCyan,
  },
  genreBadgeText: {
    color: TVTheme.colors.accentCyan,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TVTheme.colors.spoilerSafeBadge,
  },
  liveBadgeText: {
    color: TVTheme.colors.spoilerSafeBadge,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  programTitle: {
    color: TVTheme.colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
  },
  episodeTitle: {
    color: TVTheme.colors.textSecondary,
    fontSize: 16,
    marginTop: 4,
  },
  catalogButton: {
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  catalogButtonFocused: {
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    transform: [{ scale: 1.05 }],
  },
  catalogButtonText: {
    color: TVTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  catalogButtonTextFocused: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  centerCanvas: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cinemaSimBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    paddingVertical: 32,
    paddingHorizontal: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.4)',
    alignItems: 'center',
  },
  cinemaWatermark: {
    color: 'rgba(148, 163, 184, 0.35)',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
  },
  cinemaSubmark: {
    color: 'rgba(148, 163, 184, 0.25)',
    fontSize: 14,
    marginTop: 6,
  },
  bottomSection: {
    width: '100%',
    gap: 12,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#1E293B',
    borderRadius: 3,
    position: 'relative',
    overflow: 'visible',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: TVTheme.colors.focusRing,
    borderRadius: 3,
  },
  progressScrubberKnob: {
    position: 'absolute',
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: TVTheme.colors.textPrimary,
    borderWidth: 2,
    borderColor: TVTheme.colors.focusRing,
    marginLeft: -7,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wispButton: {
    backgroundColor: TVTheme.colors.focusRing,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  wispButtonFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
    transform: [{ scale: 1.04 }],
  },
  wispButtonText: {
    color: '#090B10',
    fontSize: 18,
    fontWeight: '800',
  },
  controlsGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  scrubButton: {
    backgroundColor: TVTheme.colors.cardSurface,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  scrubButtonFocused: {
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    transform: [{ scale: 1.05 }],
  },
  scrubButtonText: {
    color: TVTheme.colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  scrubButtonTextFocused: {
    color: TVTheme.colors.textPrimary,
    fontWeight: '800',
  },
});
