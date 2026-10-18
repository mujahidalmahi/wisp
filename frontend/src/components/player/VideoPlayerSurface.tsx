import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TVTheme } from '../../theme/tvTheme';
import { SceneMarker } from '../../config/catalog';

interface Props {
  programTitle: string;
  episodeTitle: string;
  genre?: string;
  playbackPositionMs: number;
  durationMs?: number;
  overlayVisible: boolean;
  isPlaying?: boolean;
  sceneMarkers?: SceneMarker[];
  recentTranscript?: Array<{
    start_time_ms: number;
    end_time_ms: number;
    speaker: string;
    dialogue: string;
    visual_cue?: string;
  }>;
  onInvokeWisp: () => void;
  onAdvanceTimestamp: (deltaMs: number) => void;
  onOpenCatalog?: () => void;
  onTogglePlayPause?: () => void;
  onOpenAlexaVoice?: () => void;
  onOpenRemoteGuide?: () => void;
}

export const VideoPlayerSurface: React.FC<Props> = ({
  programTitle,
  episodeTitle,
  genre,
  playbackPositionMs,
  durationMs = 734000,
  overlayVisible,
  isPlaying = true,
  sceneMarkers,
  recentTranscript,
  onInvokeWisp,
  onAdvanceTimestamp,
  onOpenCatalog,
  onTogglePlayPause,
  onOpenAlexaVoice,
  onOpenRemoteGuide,
}) => {
  const [isCatalogFocused, setIsCatalogFocused] = useState<boolean>(false);
  const [isWispFocused, setIsWispFocused] = useState<boolean>(false);
  const [isRewindFocused, setIsRewindFocused] = useState<boolean>(false);
  const [isForwardFocused, setIsForwardFocused] = useState<boolean>(false);
  const [isPlayPauseFocused, setIsPlayPauseFocused] = useState<boolean>(false);
  const [isAlexaFocused, setIsAlexaFocused] = useState<boolean>(false);
  const [isGuideFocused, setIsGuideFocused] = useState<boolean>(false);
  const [isCcFocused, setIsCcFocused] = useState<boolean>(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(true);

  const sec = Math.floor(playbackPositionMs / 1000);
  const formattedTime = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(
    sec % 60,
  ).padStart(2, '0')}`;

  const totalSec = Math.floor(durationMs / 1000);
  const formattedTotal = `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(
    totalSec % 60,
  ).padStart(2, '0')}`;

  const progressPercent = Math.min(100, Math.max(0, (playbackPositionMs / durationMs) * 100));

  // Find active spoken dialogue segment matching current playhead
  const activeSubtitle = recentTranscript?.find(
    (seg) =>
      playbackPositionMs >= seg.start_time_ms &&
      playbackPositionMs <= seg.end_time_ms + 1000, // Grace margin
  );

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
            <View style={[styles.liveBadge, !isPlaying && styles.pausedBadge]}>
              <View style={[styles.liveDot, !isPlaying && styles.pausedDot]} />
              <Text style={[styles.liveBadgeText, !isPlaying && styles.pausedBadgeText]}>
                {isPlaying ? 'LIVE PLAYBACK' : 'PAUSED'}
              </Text>
            </View>
          </View>
          <Text style={styles.programTitle}>{programTitle}</Text>
          <Text style={styles.episodeTitle}>
            {episodeTitle} • {formattedTime} / {formattedTotal}
          </Text>
        </View>

        {!overlayVisible && (
          <View style={styles.hudTopRightActions}>
            {onOpenAlexaVoice && (
              <Pressable
                onPress={onOpenAlexaVoice}
                onFocus={() => setIsAlexaFocused(true)}
                onBlur={() => setIsAlexaFocused(false)}
                style={[
                  styles.hudActionButton,
                  styles.alexaButton,
                  isAlexaFocused && styles.hudActionButtonFocused,
                ]}
              >
                <Text
                  style={[
                    styles.hudActionText,
                    styles.alexaButtonText,
                    isAlexaFocused && styles.hudActionTextFocused,
                  ]}
                >
                  🎙️ Alexa Voice
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => setSubtitlesEnabled((prev) => !prev)}
              onFocus={() => setIsCcFocused(true)}
              onBlur={() => setIsCcFocused(false)}
              style={[
                styles.hudActionButton,
                subtitlesEnabled && styles.hudActionButtonActive,
                isCcFocused && styles.hudActionButtonFocused,
              ]}
            >
              <Text
                style={[
                  styles.hudActionText,
                  subtitlesEnabled && styles.hudActionTextActive,
                  isCcFocused && styles.hudActionTextFocused,
                ]}
              >
                💬 {subtitlesEnabled ? 'CC ON' : 'CC OFF'}
              </Text>
            </Pressable>

            {onOpenRemoteGuide && (
              <Pressable
                onPress={onOpenRemoteGuide}
                onFocus={() => setIsGuideFocused(true)}
                onBlur={() => setIsGuideFocused(false)}
                style={[
                  styles.hudActionButton,
                  isGuideFocused && styles.hudActionButtonFocused,
                ]}
              >
                <Text
                  style={[
                    styles.hudActionText,
                    isGuideFocused && styles.hudActionTextFocused,
                  ]}
                >
                  [?] Keys
                </Text>
              </Pressable>
            )}

            {onOpenCatalog && (
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

        {/* Live Closed Captioning / Subtitles Display (AD/CC) */}
        {subtitlesEnabled && activeSubtitle && !overlayVisible && (
          <View style={styles.subtitleBanner}>
            <View style={styles.subtitleSpeakerBadge}>
              <Text style={styles.subtitleSpeakerText}>{activeSubtitle.speaker}</Text>
            </View>
            <Text style={styles.subtitleDialogueText}>
              "{activeSubtitle.dialogue}"
            </Text>
          </View>
        )}
      </View>

      {/* Bottom Bar & Timeline */}
      {!overlayVisible && (
        <View style={styles.bottomSection}>
          {/* Temporal Progress Bar with Chapter Pins */}
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            <View style={[styles.progressScrubberKnob, { left: `${progressPercent}%` }]} />
            {sceneMarkers?.map((marker, idx) => {
              const pinLeft = Math.min(100, Math.max(0, (marker.timeMs / durationMs) * 100));
              const isPassed = playbackPositionMs >= marker.timeMs;
              return (
                <View
                  key={idx}
                  style={[
                    styles.chapterPin,
                    { left: `${pinLeft}%` },
                    isPassed && styles.chapterPinPassed,
                  ]}
                />
              );
            })}
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
              {onTogglePlayPause && (
                <Pressable
                  onPress={onTogglePlayPause}
                  onFocus={() => setIsPlayPauseFocused(true)}
                  onBlur={() => setIsPlayPauseFocused(false)}
                  style={[
                    styles.scrubButton,
                    isPlayPauseFocused && styles.scrubButtonFocused,
                  ]}
                >
                  <Text
                    style={[
                      styles.scrubButtonText,
                      isPlayPauseFocused && styles.scrubButtonTextFocused,
                    ]}
                  >
                    {isPlaying ? '⏸ Pause (Space)' : '▶ Play (Space)'}
                  </Text>
                </Pressable>
              )}

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
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  pausedBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 1,
  },
  pausedDot: {
    backgroundColor: TVTheme.colors.focusRing,
  },
  pausedBadgeText: {
    color: TVTheme.colors.focusRing,
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
  hudTopRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hudActionButton: {
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  hudActionButtonActive: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  hudActionButtonFocused: {
    borderColor: TVTheme.colors.focusRing,
    borderWidth: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    transform: [{ scale: 1.05 }],
  },
  hudActionText: {
    color: TVTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  hudActionTextActive: {
    color: '#38BDF8',
  },
  hudActionTextFocused: {
    color: TVTheme.colors.textPrimary,
    fontWeight: '800',
  },
  alexaButton: {
    borderColor: '#0284C7',
    backgroundColor: 'rgba(2, 132, 199, 0.2)',
  },
  alexaButtonText: {
    color: '#38BDF8',
  },
  subtitleBanner: {
    position: 'absolute',
    bottom: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  subtitleSpeakerBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  subtitleSpeakerText: {
    color: TVTheme.colors.focusRing,
    fontSize: 14,
    fontWeight: '800',
  },
  subtitleDialogueText: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '600',
    flexShrink: 1,
  },
  chapterPin: {
    position: 'absolute',
    top: -2,
    width: 4,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#64748B',
    marginLeft: -2,
  },
  chapterPinPassed: {
    backgroundColor: '#FFFFFF',
  },
});
