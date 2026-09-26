export const TVTheme = {
  colors: {
    background: '#090B10',
    overlaySurface: 'rgba(13, 17, 26, 0.94)',
    cardSurface: '#151C28',
    cardFocused: '#1E293B',
    focusRing: '#F59E0B', // High-contrast Fire TV amber focus ring
    accentCyan: '#38BDF8',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    spoilerSafeBadge: '#10B981',
    errorBadge: '#EF4444',
  },
  spacing: {
    overscanHorizontal: 48,
    overscanVertical: 28,
    cardPadding: 24,
    chipGap: 14,
  },
  typography: {
    heroTitle: 34,
    cardHeadline: 26,
    body10Foot: 22,
    chipLabel: 20,
    caption: 16,
  },
} as const;
