// Semantic theme tokens.
//
// `solid` and `onSolid` are the pair used for filled buttons / max chips /
// selected states that historically used `colors.text` as a background. They
// flip between modes so contrast survives a light→dark swap. Most other
// tokens have a direct counterpart in the dark palette below.

const lightPalette = {
  bg: '#FFFFFF',
  surface: '#F1F4F8',
  surfaceMuted: '#E7ECF2',
  border: '#E7ECF2',

  text: '#0B2545',
  textMuted: '#8C97A8',
  textSubtle: '#B6BFCC',

  // Filled element pair (e.g. primary CTA chip, MAX button, selected chip).
  // Dark navy in light mode, near-white in dark mode — always inverts.
  solid: '#0B2545',
  onSolid: '#FFFFFF',

  accent: '#2FB6F5',
  accentDeep: '#1FA0E0',

  successText: '#0FAE5C',
  successBg: '#D6F4DF',

  dangerText: '#E5484D',
  dangerBg: '#FCD7D9',

  warningText: '#D97706',
  warningBg: '#FEF3C7',

  black: '#0B2545',
  white: '#FFFFFF',
};

const darkPalette = {
  bg: '#0B0F1A',
  surface: '#171D2B',
  surfaceMuted: '#1F2538',
  border: '#252B3D',

  text: '#F5F7FA',
  textMuted: '#9CA3AF',
  textSubtle: '#6B7280',

  solid: '#F5F7FA',
  onSolid: '#0B0F1A',

  accent: '#2FB6F5',
  accentDeep: '#1FA0E0',

  successText: '#4ADE80',
  successBg: 'rgba(74, 222, 128, 0.15)',

  dangerText: '#F87171',
  dangerBg: 'rgba(248, 113, 113, 0.18)',

  warningText: '#FCD34D',
  warningBg: 'rgba(252, 211, 77, 0.18)',

  black: '#000000',
  white: '#FFFFFF',
};

// Ship dark-by-default per tester feedback (May 13 design review request).
// Light palette is preserved above as the eventual toggle counterpart — when
// we wire a runtime theme switcher this is where it'll plug in.
export const colors = darkPalette;

export const radii = {
  pill: 999,
  lg: 24,
  md: 16,
  sm: 12,
  xs: 8,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const typography = {
  display: {
    fontSize: 64,
    fontWeight: '700' as const,
    letterSpacing: -2,
    color: colors.text,
  },
  title: {
    fontSize: 22,
    fontWeight: '600' as const,
    color: colors.text,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
  },
  body: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: colors.text,
  },
  bodyMuted: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: colors.textMuted,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: colors.textMuted,
  },
  pill: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
} as const;

export const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 1,
  },
} as const;
