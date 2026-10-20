import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TVTheme } from '../../theme/tvTheme';
import { useTVResponsive } from '../../hooks/useTVResponsive';

interface Props {
  programTitle: string;
  episodeTitle: string;
  genre?: string;
  playbackPositionMs: number;
  durationMs?: number;
  overlayVisible: boolean;
  isPlaying?: boolean;
  onInvokeWisp: () => void;
  onAdvanceTimestamp: (deltaMs: number) => void;
  onTogglePlayPause?: () => void;
  onOpenCatalog?: () => void;
}

export const VideoPlayerSurface: React.FC<Props> = ({
  programTitle,
  episodeTitle,
  genre,
  playbackPositionMs,
  durationMs = 734000,
  overlayVisible,
  isPlaying = true,
  onInvokeWisp,
  onAdvanceTimestamp,
  onTogglePlayPause,
  onOpenCatalog,
}) => {
  const [isCatalogFocused, setIsCatalogFocused] = useState<boolean>(false);
  const [isWispFocused, setIsWispFocused] = useState<boolean>(false);
  const [isPlayPauseFocused, setIsPlayPauseFocused] = useState<boolean>(false);
  const [isRewindFocused, setIsRewindFocused] = useState<boolean>(false);
  const [isForwardFocused, setIsForwardFocused] = useState<boolean>(false);

  const { overscanHorizontal, overscanVertical } = useTVResponsive();

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
    <View style={[styles.viewport, { paddingHorizontal: overscanHorizontal, paddingVertical: overscanVertical }]}>
      {/* Top HUD: Clean & Minimalist */}
      <View style={styles.hudTopRow}>
        <View style={styles.hudTopLeft}>
          <View style={styles.badgeRow}>
            {genre && (
              <View style={styles.genreBadge}>
                <Text style={styles.genreBadgeText}>{genre}</Text>
              </View>
            )}
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>
                {isPlaying ? 'PLAYING' : 'PAUSED'}
              </Text>
            </View>
            <View style={styles.formatBadge}>
              <Text style={styles.formatBadgeText}>4K UHD • HDR10 • ATMOS</Text>
            </View>
          </View>
          <Text style={styles.programTitle}>{programTitle}</Text>
          <Text style={styles.episodeTitle}>
            {episodeTitle}  •  {formattedTime} / {formattedTotal}
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
              Browse Catalog (C)
            </Text>
          </Pressable>
        )}
      </View>

      {/* Center Cinematic Stage: Clean, Pure & Uncluttered */}
      <View style={styles.centerCanvas}>
        <View style={styles.cinemaStageBox}>
          <Text style={styles.cinemaTitleText}>{programTitle}</Text>
          <Text style={styles.cinemaSubtitleText}>
            {episodeTitle}  •  Scene Timecode {formattedTime}
          </Text>
          <View style={styles.guardIndicator}>
            <View style={styles.guardDot} />
            <Text style={styles.guardText}>SPOILER GUARD ACTIVE</Text>
          </View>
        </View>
      </View>

      {/* Bottom Timeline & Controls */}
      {!overlayVisible && (
        <View style={styles.bottomSection}>
          {/* Minimalist Scrubber with Scene Chapter Notches */}
          <View style={styles.progressBarBackground}>
            <View style={[styles.chapterNotch, { left: '25%' }]} />
            <View style={[styles.chapterNotch, { left: '50%' }]} />
            <View style={[styles.chapterNotch, { left: '75%' }]} />

            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            <View style={[styles.progressScrubberKnob, { left: `${progressPercent}%` }]} />
          </View>

          <View style={styles.bottomBar}>
            <View style={styles.primaryActions}>
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
                <Text style={styles.wispButtonText}>✨ Context & Lore (Menu)</Text>
              </Pressable>

              {onTogglePlayPause && (
                <Pressable
                  onPress={onTogglePlayPause}
                  onFocus={() => setIsPlayPauseFocused(true)}
                  onBlur={() => setIsPlayPauseFocused(false)}
                  style={[
                    styles.playPauseButton,
                    isPlayPauseFocused && styles.playPauseButtonFocused,
                  ]}
                >
                  <Text
                    style={[
                      styles.playPauseButtonText,
                      isPlayPauseFocused && styles.playPauseButtonTextFocused,
                    ]}
                  >
                    {isPlaying ? 'Pause' : 'Play'}
                  </Text>
                </Pressable>
              )}
            </View>

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
                  -30s
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
                  +60s
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
  },
  hudTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hudTopLeft: {
    backgroundColor: 'rgba(20, 20, 24, 0.92)',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TVTheme.colors.cardBorder,
    alignSelf: 'flex-start',
    ...TVTheme.glow.subtleCardShadow,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  genreBadge: {
    backgroundColor: '#202025',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  genreBadgeText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.badge,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TVTheme.colors.spoilerSafeWash,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TVTheme.colors.spoilerSafeBadge,
  },
  liveBadgeText: {
    color: TVTheme.colors.spoilerSafeBadge,
    fontSize: TVTheme.typography.badge,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  formatBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  formatBadgeText: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.microTime,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  programTitle: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.heroTitle,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  episodeTitle: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.subtitle,
    marginTop: 6,
    fontWeight: '600',
  },
  catalogButton: {
    backgroundColor: TVTheme.colors.cardSurface,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.cardBorder,
  },
  catalogButtonFocused: {
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2,
    backgroundColor: TVTheme.colors.focusGlowWash,
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  catalogButtonText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.buttonText,
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
  cinemaStageBox: {
    backgroundColor: 'rgba(18, 18, 22, 0.65)',
    paddingVertical: 40,
    paddingHorizontal: 60,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    ...TVTheme.glow.subtleCardShadow,
  },
  cinemaTitleText: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.cardHeadline,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  cinemaSubtitleText: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.caption,
    marginTop: 8,
  },
  guardIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  guardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TVTheme.colors.spoilerSafeBadge,
  },
  guardText: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.microTime,
    fontWeight: '700',
    letterSpacing: 1,
  },
  bottomSection: {
    width: '100%',
    gap: 16,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#222228',
    borderRadius: 3,
    position: 'relative',
    overflow: 'visible',
  },
  chapterNotch: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 2,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: TVTheme.colors.focusRing,
    borderRadius: 3,
  },
  progressScrubberKnob: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: TVTheme.colors.textPrimary,
    borderWidth: 2.5,
    borderColor: TVTheme.colors.focusRing,
    marginLeft: -8,
    zIndex: 3,
    ...TVTheme.glow.focusRingShadow,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  primaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  wispButton: {
    backgroundColor: TVTheme.colors.focusRing,
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  wispButtonFocused: {
    borderColor: '#FFFFFF',
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  wispButtonText: {
    color: '#0A0A0C',
    fontSize: TVTheme.typography.buttonText,
    fontWeight: '800',
  },
  playPauseButton: {
    backgroundColor: TVTheme.colors.cardSurface,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.cardBorder,
  },
  playPauseButtonFocused: {
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2,
    backgroundColor: TVTheme.colors.focusGlowWash,
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  playPauseButtonText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.buttonText,
    fontWeight: '700',
  },
  playPauseButtonTextFocused: {
    color: TVTheme.colors.textPrimary,
    fontWeight: '800',
  },
  controlsGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  scrubButton: {
    backgroundColor: TVTheme.colors.cardSurface,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.cardBorder,
  },
  scrubButtonFocused: {
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2,
    backgroundColor: TVTheme.colors.focusGlowWash,
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  scrubButtonText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.buttonText,
    fontWeight: '700',
  },
  scrubButtonTextFocused: {
    color: TVTheme.colors.textPrimary,
    fontWeight: '800',
  },
});
