export const TVTheme = {
  colors: {
    // Pure neutral dark cinema canvas — zero navy blue, zero dark blue
    background: '#0A0A0C',
    overlaySurface: 'rgba(16, 16, 19, 0.96)',
    cardSurface: '#141417',
    cardFocused: '#202025',
    cardBorder: '#27272D',
    cardBorderFocused: '#3F3F46',
    
    // High-contrast Fire TV amber focus indicators (10-foot standard)
    focusRing: '#F59E0B',
    focusGlowWash: 'rgba(245, 158, 11, 0.12)',
    
    // Minimal neutral accents
    accentWarm: '#F59E0B',
    accentNeutral: '#3F3F46',
    activeTabBackground: '#26262C',

    // Pure, crisp typography colors
    textPrimary: '#FFFFFF',
    textSecondary: '#E4E4E7',
    textMuted: '#8E8E96',

    // Functional badges (emerald & ruby)
    spoilerSafeBadge: '#10B981',
    spoilerSafeWash: 'rgba(16, 185, 129, 0.14)',
    errorBadge: '#EF4444',
    errorWash: 'rgba(239, 68, 68, 0.14)',
  },
  spacing: {
    overscanHorizontal: 48,
    overscanVertical: 28,
    cardPadding: 24,
    chipGap: 14,
    elementGap: 12,
  },
  typography: {
    heroTitle: 36,
    cardHeadline: 28,
    body10Foot: 22,
    chipLabel: 20,
    subtitle: 20,
    buttonText: 18,
    caption: 18,
    badge: 16,
    microTime: 15,
  },
  glow: {
    focusRingShadow: {
      shadowColor: '#F59E0B',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 12,
      elevation: 8,
    },
    subtleCardShadow: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.6,
      shadowRadius: 16,
      elevation: 6,
    },
  },
  animation: {
    focusScale: 1.025,
  },
} as const;
