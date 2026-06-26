/**
 * DailyNutry — Design Tokens
 * 
 * Organic/clinical aesthetic. Cream surfaces, deep forest primary,
 * sage + warm-clay accents. Converted from the web prototype to
 * React Native StyleSheet-compatible values.
 */

export const T = {
  // ─── Surfaces ─────────────────────────────────────────────
  bg:        '#f1ede4',       // cream canvas
  surface:   '#f8f5ee',       // raised card
  surfaceAlt:'#ebe5d6',       // chip / inactive
  ink:       '#1f1d17',       // primary text
  inkSoft:   '#5b574c',       // secondary text
  inkMute:   '#8c8678',       // tertiary / placeholder
  hair:      '#dcd6c6',       // hairline divider
  hairSoft:  '#e6e0cf',

  // ─── Brand ────────────────────────────────────────────────
  forest:    '#2d4a2b',       // primary deep green
  forestInk: '#f4f1e8',       // text on forest
  sage:      '#8a9a5b',       // sage accent
  clay:      '#c98a5b',       // terracotta/clay accent
  cream:     '#f4e9d2',       // light accent fill

  // ─── Semantic ─────────────────────────────────────────────
  ok:        '#4a7340',
  warn:      '#c98a5b',
  danger:    '#a64b3a',

  // ─── Typography (font family names loaded via expo-font) ──
  serif:     'InstrumentSerif',
  serifItalic: 'InstrumentSerif-Italic',
  sans:      'Manrope',
  sansBold:  'Manrope-Bold',
  sansExtraBold: 'Manrope-ExtraBold',
  mono:      'JetBrainsMono',

  // ─── Spacing ──────────────────────────────────────────────
  sp: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
  },

  // ─── Radii ────────────────────────────────────────────────
  radius: {
    sm: 8,
    md: 14,
    lg: 18,
    xl: 22,
    pill: 100,
  },
} as const;

export type TokenColors = typeof T;
