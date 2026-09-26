import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TVTheme } from '../../theme/tvTheme';

interface Props {
  programTitle: string;
  episodeTitle: string;
  playbackPositionMs: number;
  overlayVisible: boolean;
  onInvokeWisp: () => void;
  onAdvanceTimestamp: (deltaMs: number) => void;
}

export const VideoPlayerSurface: React.FC<Props> = ({
  programTitle,
  episodeTitle,
  playbackPositionMs,
  overlayVisible,
  onInvokeWisp,
  onAdvanceTimestamp,
}) => {
  const sec = Math.floor(playbackPositionMs / 1000);
  const formattedTime = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(
    sec % 60,
  ).padStart(2, '0')}`;

  return (
    <View style={styles.viewport}>
      <View style={styles.hudTopLeft}>
        <Text style={styles.programTitle}>{programTitle}</Text>
        <Text style={styles.episodeTitle}>
          {episodeTitle} • Playhead {formattedTime}
        </Text>
      </View>

      {!overlayVisible && (
        <View style={styles.bottomBar}>
          <Pressable hasTVPreferredFocus onPress={onInvokeWisp} style={styles.wispButton}>
            <Text style={styles.wispButtonText}>✨ Invoke Wisp (Menu / Select)</Text>
          </Pressable>

          <Pressable
            onPress={() => onAdvanceTimestamp(60000)}
            style={styles.scrubButton}
          >
            <Text style={styles.scrubButtonText}>+1:00 Scene Jump</Text>
          </Pressable>
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
  hudTopLeft: {
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  programTitle: {
    color: TVTheme.colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
  },
  episodeTitle: {
    color: TVTheme.colors.textSecondary,
    fontSize: 18,
    marginTop: 4,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  wispButton: {
    backgroundColor: TVTheme.colors.focusRing,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  wispButtonText: {
    color: '#090B10',
    fontSize: 20,
    fontWeight: '800',
  },
  scrubButton: {
    backgroundColor: TVTheme.colors.cardSurface,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  scrubButtonText: {
    color: TVTheme.colors.textSecondary,
    fontSize: 18,
    fontWeight: '600',
  },
});
