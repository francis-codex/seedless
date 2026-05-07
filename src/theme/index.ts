export const colors = {
  bg: '#FFFFFF',
  surface: '#F1F4F8',
  surfaceMuted: '#E7ECF2',
  text: '#0B2545',
  textMuted: '#8C97A8',
  textSubtle: '#B6BFCC',
  border: '#E7ECF2',

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
} as const;

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
    shadowColor: '#0B2545',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
} as const;
