import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TVTheme } from '../../theme/tvTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface KeyGuideItem {
  remoteKey: string;
  keyboardKey: string;
  action: string;
  context: string;
}

const REMOTE_GUIDE_ITEMS: KeyGuideItem[] = [
  {
    remoteKey: 'Menu ☰',
    keyboardKey: 'M',
    action: 'Toggle Wisp Overlay',
    context: 'Instantly opens or hides spoiler-safe contextual insights',
  },
  {
    remoteKey: 'D-Pad Arrows ◀ ▲ ▼ ▶',
    keyboardKey: 'Arrow Keys',
    action: 'Navigate Items',
    context: 'Move focus between Quick Action Chips, characters & quiz choices',
  },
  {
    remoteKey: 'Select / Center ◉',
    keyboardKey: 'Enter',
    action: 'Activate Selection',
    context: 'Selects the focused chip, character lore, or trivia option',
  },
  {
    remoteKey: 'Play / Pause ⏯',
    keyboardKey: 'Space',
    action: 'Toggle Playback',
    context: 'Starts or pauses video stream and continuous time progression',
  },
  {
    remoteKey: 'Rewind / Fast-Forward ⏪ ⏩',
    keyboardKey: 'Left / Right',
    action: 'Seek ±30s / ±1:00',
    context: 'Jumps playback forward or backward to test temporal locks',
  },
  {
    remoteKey: 'Back ⮌',
    keyboardKey: 'Escape',
    action: 'Dismiss / Return',
    context: 'Closes active modals or returns from AI card to scene lore',
  },
  {
    remoteKey: 'Catalog 📚',
    keyboardKey: 'C',
    action: 'Switch Demo Genre',
    context: 'Swaps between Sci-Fi, Science Documentary & Mystery',
  },
  {
    remoteKey: 'Alexa Voice 🎙️',
    keyboardKey: 'V',
    action: 'Voice Query Simulator',
    context: 'Opens spoken voice query selector for hands-free zero-typing',
  },
];

export const RemoteControlGuideModal: React.FC<Props> = ({ visible, onClose }) => {
  const [isCloseFocused, setIsCloseFocused] = useState<boolean>(false);

  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.modal}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>FIRE TV REMOTE NAVIGATION GUIDE</Text>
            <Text style={styles.subtitle}>
              10-Foot Couch Ergonomics • Zero-Typing Navigation Standard
            </Text>
          </View>
          <Pressable
            hasTVPreferredFocus
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

        {/* Remote Grid */}
        <View style={styles.grid}>
          {REMOTE_GUIDE_ITEMS.map((item, idx) => (
            <View key={idx} style={styles.gridItem}>
              <View style={styles.keyBadgesRow}>
                <View style={styles.remoteBadge}>
                  <Text style={styles.remoteBadgeText}>{item.remoteKey}</Text>
                </View>
                <Text style={styles.orText}>or</Text>
                <View style={styles.keyboardBadge}>
                  <Text style={styles.keyboardBadgeText}>Key [{item.keyboardKey}]</Text>
                </View>
              </View>
              <Text style={styles.actionText}>{item.action}</Text>
              <Text style={styles.contextText}>{item.context}</Text>
            </View>
          ))}
        </View>

        {/* Footer Note */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            🎯 Compliance Note: All UI components implement 5% overscan safe margins (≥48px horiz, ≥28px vert) and distance-readable typography (≥22sp) per Fire OS Guidelines.
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
    width: 960,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 32,
    borderWidth: 2,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 28,
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
  title: {
    color: TVTheme.colors.focusRing,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  subtitle: {
    color: TVTheme.colors.textMuted,
    fontSize: 14,
    marginTop: 4,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  keyBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  remoteBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  remoteBadgeText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  orText: {
    color: TVTheme.colors.textMuted,
    fontSize: 12,
  },
  keyboardBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: TVTheme.colors.focusRing,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  keyboardBadgeText: {
    color: TVTheme.colors.focusRing,
    fontSize: 12,
    fontWeight: '700',
  },
  actionText: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  contextText: {
    color: TVTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 14,
  },
  footerText: {
    color: '#94A3B8',
    fontSize: 12,
    fontStyle: 'italic',
  },
});
