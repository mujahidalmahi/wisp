import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  HouseholdProfileMode,
  InstantSceneContext,
  QuickActionChip,
  WispResponseCard,
} from '../../types/wisp';
import { TVTheme } from '../../theme/tvTheme';
import { QuickActionChips } from './QuickActionChips';
import { ProfileModeSelector } from './ProfileModeSelector';
import { InteractiveQuizCard } from './InteractiveQuizCard';
import { ActiveEntitiesBar, UnlockedEntity } from './ActiveEntitiesBar';

interface Props {
  visible: boolean;
  playbackPositionMs: number;
  sceneContext: InstantSceneContext | null;
  responseCard: WispResponseCard | null;
  loadingAi: boolean;
  errorMessage: string | null;
  profileMode: HouseholdProfileMode;
  onChangeProfileMode: (mode: HouseholdProfileMode) => void;
  onSelectChip: (chip: QuickActionChip) => void;
  onAskAboutEntity?: (entity: UnlockedEntity) => void;
}

export const WispOverlayDrawer: React.FC<Props> = ({
  visible,
  playbackPositionMs,
  sceneContext,
  responseCard,
  loadingAi,
  errorMessage,
  profileMode,
  onChangeProfileMode,
  onSelectChip,
  onAskAboutEntity,
}) => {
  if (!visible) return null;

  const formatTimestamp = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const activeChips =
    responseCard?.followUpChips || sceneContext?.active_scene.quick_action_chips || [];

  return (
    <View style={styles.drawer}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header & Spoiler-Safe Timestamp Lock */}
        <View style={styles.headerRow}>
          <Text style={styles.brandTitle}>WISP</Text>
          <View style={styles.spoilerBadge}>
            <Text style={styles.spoilerBadgeText}>
              SPOILER-SAFE LOCK @ {formatTimestamp(playbackPositionMs)}
            </Text>
          </View>
        </View>

        {/* Household Profile Mode Selector */}
        <ProfileModeSelector activeMode={profileMode} onChangeMode={onChangeProfileMode} />

        {/* Stage 1 Instant Scene Header (<100ms) */}
        {sceneContext && !responseCard && (
          <View style={styles.card}>
            <Text style={styles.sceneSubtitle}>{sceneContext.active_scene.location_name}</Text>
            <Text style={styles.headline}>{sceneContext.active_scene.scene_title}</Text>
            <Text style={styles.bodyText}>
              {sceneContext.active_scene.spoiler_safe_summary}
            </Text>
          </View>
        )}

        {/* On-Screen Characters & Entities Spotlight */}
        {sceneContext?.unlocked_entities && sceneContext.unlocked_entities.length > 0 && !responseCard && (
          <ActiveEntitiesBar
            entities={sceneContext.unlocked_entities}
            onAskAboutEntity={onAskAboutEntity}
          />
        )}

        {/* Stage 2 Grounded AI Response Card */}
        {loadingAi && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={TVTheme.colors.focusRing} />
            <Text style={styles.loadingText}>Retrieving spoiler-safe insight...</Text>
          </View>
        )}

        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Interactive Trivia Challenge Card when quizPayload is present */}
        {responseCard?.quizPayload && !loadingAi && (
          <View style={styles.quizWrapper}>
            <InteractiveQuizCard quiz={responseCard.quizPayload} />
            <View style={styles.providerTelemetryBar}>
              <View style={styles.telemetryDot} />
              <Text style={styles.providerTelemetryText}>
                Provider: {responseCard.providerUsed} • {responseCard.latencyMs}ms
              </Text>
            </View>
          </View>
        )}

        {/* Standard AI Response Card (when not a standalone quiz, or in addition) */}
        {responseCard && !loadingAi && !responseCard.quizPayload && (
          <View style={styles.card}>
            <Text style={styles.headline}>{responseCard.headline}</Text>
            <Text style={styles.bodyText}>{responseCard.body}</Text>
            {responseCard.bulletPoints?.map((bp, i) => (
              <Text key={i} style={styles.bulletText}>
                • {bp}
              </Text>
            ))}
            <Text style={styles.providerMeta}>
              Provider: {responseCard.providerUsed} • {responseCard.latencyMs}ms
            </Text>
          </View>
        )}

        {/* Zero-Typing D-Pad Quick Action Chips */}
        <Text style={styles.sectionLabel}>ASK ABOUT THIS MOMENT (D-PAD SELECT)</Text>
        <QuickActionChips
          chips={activeChips}
          onSelectChip={onSelectChip}
          disabled={loadingAi}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    right: TVTheme.spacing.overscanHorizontal,
    top: TVTheme.spacing.overscanVertical,
    bottom: TVTheme.spacing.overscanVertical,
    width: 540,
    backgroundColor: TVTheme.colors.overlaySurface,
    borderRadius: 20,
    padding: TVTheme.spacing.cardPadding,
    borderWidth: 1,
    borderColor: '#334155',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  brandTitle: {
    color: TVTheme.colors.focusRing,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
  },
  spoilerBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TVTheme.colors.spoilerSafeBadge,
  },
  spoilerBadgeText: {
    color: TVTheme.colors.spoilerSafeBadge,
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    backgroundColor: TVTheme.colors.cardSurface,
    padding: 20,
    borderRadius: 14,
    marginBottom: 18,
  },
  sceneSubtitle: {
    color: TVTheme.colors.accentCyan,
    fontSize: TVTheme.typography.caption,
    fontWeight: '600',
    marginBottom: 4,
  },
  headline: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.cardHeadline,
    fontWeight: '700',
    marginBottom: 10,
  },
  bodyText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.body10Foot,
    lineHeight: 30,
  },
  bulletText: {
    color: TVTheme.colors.textPrimary,
    fontSize: 19,
    marginTop: 8,
  },
  providerMeta: {
    color: TVTheme.colors.textMuted,
    fontSize: 13,
    marginTop: 12,
  },
  sectionLabel: {
    color: TVTheme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  loadingBox: {
    padding: 28,
    alignItems: 'center',
  },
  loadingText: {
    color: TVTheme.colors.textSecondary,
    fontSize: 18,
    marginTop: 12,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 14,
  },
  errorText: {
    color: TVTheme.colors.errorBadge,
    fontSize: 16,
  },
  quizWrapper: {
    marginBottom: 14,
  },
  providerTelemetryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignSelf: 'flex-start',
    marginTop: -8,
    marginBottom: 12,
  },
  telemetryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TVTheme.colors.spoilerSafeBadge,
  },
  providerTelemetryText: {
    color: TVTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
