import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  HouseholdProfileMode,
  InstantSceneContext,
  QuickActionChip,
  WispResponseCard,
} from '../../types/wisp';
import { TVTheme } from '../../theme/tvTheme';
import { useTVResponsive } from '../../hooks/useTVResponsive';
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
  onVoteCard?: (vote: -1 | 1) => void;
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
  onVoteCard,
}) => {
  const [upvoteFocused, setUpvoteFocused] = useState<boolean>(false);
  const [downvoteFocused, setDownvoteFocused] = useState<boolean>(false);
  const [currentVote, setCurrentVote] = useState<-1 | 1 | null>(null);

  const { drawerWidth, overscanHorizontal, overscanVertical } = useTVResponsive();

  if (!visible) return null;

  const formatTimestamp = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handleVote = (vote: -1 | 1) => {
    setCurrentVote(vote);
    onVoteCard?.(vote);
  };

  const activeChips =
    responseCard?.followUpChips || sceneContext?.active_scene.quick_action_chips || [];

  return (
    <View
      style={[
        styles.drawer,
        {
          width: drawerWidth,
          right: overscanHorizontal,
          top: overscanVertical,
          bottom: overscanVertical,
        },
      ]}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header & Spoiler-Safe Timestamp Lock */}
        <View style={styles.headerRow}>
          <Text style={styles.brandTitle}>WISP</Text>
          <View style={styles.spoilerBadge}>
            <Text style={styles.spoilerBadgeText}>
              🔒 SPOILER-SAFE LOCK @ {formatTimestamp(playbackPositionMs)}
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
                Provider: {responseCard.providerUsed} • {responseCard.latencyMs}ms •{' '}
                {responseCard.cached ? 'Cache HIT' : 'Live Inference'}
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

            {/* Provider Telemetry & Feedback */}
            <View style={styles.cardFooter}>
              <View style={styles.telemetryGroup}>
                <View style={styles.telemetryDot} />
                <Text style={styles.providerMeta}>
                  {responseCard.providerUsed} • {responseCard.latencyMs}ms •{' '}
                  {responseCard.cached ? 'Cache HIT' : 'Live Gen'}
                </Text>
              </View>

              {/* Helpfulness Voting Buttons */}
              <View style={styles.voteRow}>
                <Pressable
                  onFocus={() => setUpvoteFocused(true)}
                  onBlur={() => setUpvoteFocused(false)}
                  onPress={() => handleVote(1)}
                  style={[
                    styles.voteButton,
                    upvoteFocused && styles.voteButtonFocused,
                    currentVote === 1 && styles.voteButtonSelected,
                  ]}
                >
                  <Text style={styles.voteText}>👍</Text>
                </Pressable>

                <Pressable
                  onFocus={() => setDownvoteFocused(true)}
                  onBlur={() => setDownvoteFocused(false)}
                  onPress={() => handleVote(-1)}
                  style={[
                    styles.voteButton,
                    downvoteFocused && styles.voteButtonFocused,
                    currentVote === -1 && styles.voteButtonSelected,
                  ]}
                >
                  <Text style={styles.voteText}>👎</Text>
                </Pressable>
              </View>
            </View>
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
    backgroundColor: TVTheme.colors.overlaySurface,
    borderRadius: 24,
    padding: TVTheme.spacing.cardPadding,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.cardBorder,
    zIndex: 100,
  },
  scrollContent: {
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandTitle: {
    color: TVTheme.colors.focusRing,
    fontSize: TVTheme.typography.cardHeadline,
    fontWeight: '800',
    letterSpacing: 2,
  },
  spoilerBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.spoilerSafeBadge,
  },
  spoilerBadgeText: {
    color: TVTheme.colors.spoilerSafeBadge,
    fontSize: TVTheme.typography.badge,
    fontWeight: '800',
  },
  card: {
    backgroundColor: TVTheme.colors.cardSurface,
    padding: 22,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: TVTheme.colors.cardBorder,
  },
  sceneSubtitle: {
    color: TVTheme.colors.focusRing,
    fontSize: TVTheme.typography.subtitle,
    fontWeight: '700',
    marginBottom: 6,
  },
  headline: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.cardHeadline,
    fontWeight: '800',
    marginBottom: 12,
  },
  bodyText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.body10Foot,
    lineHeight: 32,
  },
  bulletText: {
    color: TVTheme.colors.textPrimary,
    fontSize: TVTheme.typography.body10Foot,
    lineHeight: 30,
    marginTop: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: TVTheme.colors.cardBorder,
    paddingTop: 12,
  },
  telemetryGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  telemetryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TVTheme.colors.spoilerSafeBadge,
  },
  providerMeta: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.badge,
    fontWeight: '600',
  },
  voteRow: {
    flexDirection: 'row',
    gap: 10,
  },
  voteButton: {
    backgroundColor: TVTheme.colors.cardSurface,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: TVTheme.colors.cardBorder,
  },
  voteButtonFocused: {
    borderColor: TVTheme.colors.focusRing,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    transform: [{ scale: TVTheme.animation.focusScale }],
    ...TVTheme.glow.focusRingShadow,
  },
  voteButtonSelected: {
    borderColor: TVTheme.colors.focusRing,
    backgroundColor: TVTheme.colors.activeTabBackground,
  },
  voteText: {
    fontSize: 18,
  },
  sectionLabel: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.badge,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  loadingBox: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    color: TVTheme.colors.textSecondary,
    fontSize: TVTheme.typography.subtitle,
    fontWeight: '700',
    marginTop: 14,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.22)',
    padding: 18,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: TVTheme.colors.errorBadge,
  },
  errorText: {
    color: TVTheme.colors.errorBadge,
    fontSize: TVTheme.typography.buttonText,
    fontWeight: '700',
  },
  quizWrapper: {
    marginBottom: 16,
  },
  providerTelemetryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TVTheme.colors.cardSurface,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TVTheme.colors.cardBorder,
    alignSelf: 'flex-start',
    marginTop: -8,
    marginBottom: 14,
  },
  providerTelemetryText: {
    color: TVTheme.colors.textMuted,
    fontSize: TVTheme.typography.badge,
    fontWeight: '700',
  },
});
