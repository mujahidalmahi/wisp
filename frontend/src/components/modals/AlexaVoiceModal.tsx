import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TVTheme } from '../../theme/tvTheme';
import { QuickActionChip, WispActionType } from '../../types/wisp';

export interface VoiceQueryOption {
  id: string;
  spokenPrompt: string;
  displayLabel: string;
  actionType: WispActionType;
}

const CURATED_VOICE_QUERIES: VoiceQueryOption[] = [
  {
    id: 'voice-1',
    spokenPrompt: 'Alexa, who is on screen right now?',
    displayLabel: 'Tell me about the active characters on screen',
    actionType: 'entity_explain',
  },
  {
    id: 'voice-2',
    spokenPrompt: 'Alexa, what is the context of this scene?',
    displayLabel: 'Explain why they are here without spoilers',
    actionType: 'scene_explain',
  },
  {
    id: 'voice-3',
    spokenPrompt: 'Alexa, catch me up to this moment',
    displayLabel: 'Recap the key events leading to this point',
    actionType: 'episode_recap',
  },
  {
    id: 'voice-4',
    spokenPrompt: 'Alexa, quiz me on what just happened',
    displayLabel: 'Challenge me with a spoiler-safe trivia question',
    actionType: 'post_watch_quiz',
  },
];

interface Props {
  visible: boolean;
  onSelectQuery: (chip: QuickActionChip) => void;
  onClose: () => void;
}

export const AlexaVoiceModal: React.FC<Props> = ({ visible, onSelectQuery, onClose }) => {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isCloseFocused, setIsCloseFocused] = useState<boolean>(false);

  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.modal}>
        {/* Alexa Header with Cyan / Blue Accent Bar */}
        <View style={styles.header}>
          <View style={styles.alexaGlowBar}>
            <View style={styles.alexaRing}>
              <View style={styles.alexaDot} />
            </View>
            <View>
              <Text style={styles.alexaTitle}>ALEXA VOICE ASSISTANT</Text>
              <Text style={styles.alexaSubtitle}>Simulated Fire TV Voice Remote Input</Text>
            </View>
          </View>
          <Pressable
            onPress={onClose}
            onFocus={() => setIsCloseFocused(true)}
            onBlur={() => setIsCloseFocused(false)}
            style={[styles.closeBtn, isCloseFocused && styles.closeBtnFocused]}
          >
            <Text style={[styles.closeBtnText, isCloseFocused && styles.closeBtnTextFocused]}>
              ✕ Close (Esc)
            </Text>
          </Pressable>
        </View>

        {/* Spoken Query Instruction */}
        <Text style={styles.instructionText}>
          Hold the Voice button or D-pad select a question to ask Wisp AI:
        </Text>

        {/* Voice Queries Grid */}
        <View style={styles.queriesList}>
          {CURATED_VOICE_QUERIES.map((q, idx) => {
            const isFocused = focusedId === q.id;

            return (
              <Pressable
                key={q.id}
                hasTVPreferredFocus={idx === 0}
                onFocus={() => setFocusedId(q.id)}
                onBlur={() => setFocusedId(null)}
                onPress={() => {
                  onSelectQuery({
                    id: q.id,
                    label: q.displayLabel,
                    actionType: q.actionType,
                  });
                  onClose();
                }}
                style={[
                  styles.queryCard,
                  isFocused && styles.queryCardFocused,
                ]}
              >
                <View style={styles.micCircle}>
                  <Text style={styles.micIcon}>🎙️</Text>
                </View>
                <View style={styles.queryBody}>
                  <Text
                    style={[
                      styles.spokenPromptText,
                      isFocused && styles.spokenPromptTextFocused,
                    ]}
                  >
                    "{q.spokenPrompt}"
                  </Text>
                  <Text style={styles.queryDescriptionText}>{q.displayLabel}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerNote}>
            💡 Zero typing required: All voice queries execute directly against @wisp/ai-engine with 15-second timestamp locks.
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 10, 20, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modal: {
    width: 900,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 32,
    borderWidth: 2,
    borderColor: '#0284C7',
    shadowColor: '#0284C7',
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: 16,
  },
  alexaGlowBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  alexaRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alexaDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#38BDF8',
  },
  alexaTitle: {
    color: '#38BDF8',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  alexaSubtitle: {
    color: TVTheme.colors.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  closeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  closeBtnFocused: {
    borderColor: TVTheme.colors.focusRing,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  closeBtnText: {
    color: TVTheme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  closeBtnTextFocused: {
    color: TVTheme.colors.focusRing,
    fontWeight: '800',
  },
  instructionText: {
    color: TVTheme.colors.textSecondary,
    fontSize: 18,
    marginBottom: 20,
  },
  queriesList: {
    gap: 12,
  },
  queryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 16,
  },
  queryCardFocused: {
    borderColor: TVTheme.colors.focusRing,
    backgroundColor: '#26334D',
    transform: [{ scale: 1.02 }],
  },
  micCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micIcon: {
    fontSize: 22,
  },
  queryBody: {
    flex: 1,
  },
  spokenPromptText: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '700',
  },
  spokenPromptTextFocused: {
    color: TVTheme.colors.focusRing,
  },
  queryDescriptionText: {
    color: TVTheme.colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  footerRow: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 16,
  },
  footerNote: {
    color: TVTheme.colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
});
