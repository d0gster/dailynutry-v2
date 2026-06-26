/**
 * DailyNutry — Chip component
 * 
 * Pill-shaped chip for alternative counts, macro labels,
 * tags, and filters.
 */

import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { T } from '../../constants/tokens';

type ChipVariant = 'default' | 'forest' | 'sage' | 'clay' | 'outline' | 'cream';
type ChipSize = 'sm' | 'md' | 'lg';

interface ChipProps {
  children: React.ReactNode;
  variant?: ChipVariant;
  size?: ChipSize;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const VARIANT_STYLES: Record<ChipVariant, { bg: string; fg: string; bd: string }> = {
  default: { bg: T.surfaceAlt, fg: T.inkSoft, bd: 'transparent' },
  forest:  { bg: T.forest,     fg: T.forestInk, bd: 'transparent' },
  sage:    { bg: '#dde3c8',    fg: '#3d4a1f',   bd: 'transparent' },
  clay:    { bg: '#f0d9c1',    fg: '#6e3a1c',   bd: 'transparent' },
  outline: { bg: 'transparent',fg: T.inkSoft, bd: T.hair },
  cream:   { bg: T.cream,      fg: '#6e521c', bd: 'transparent' },
};

const SIZE_STYLES: Record<ChipSize, { padH: number; padV: number; fs: number; gap: number; h: number }> = {
  sm: { padH: 8,  padV: 2,  fs: 11, gap: 4, h: 20 },
  md: { padH: 10, padV: 4,  fs: 12, gap: 5, h: 24 },
  lg: { padH: 14, padV: 6,  fs: 14, gap: 6, h: 30 },
};

export function Chip({ children, variant = 'default', size = 'md', icon, style }: ChipProps) {
  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];
  
  return (
    <View style={[{
      flexDirection: 'row',
      alignItems: 'center',
      gap: s.gap,
      paddingHorizontal: s.padH,
      paddingVertical: s.padV,
      backgroundColor: v.bg,
      borderColor: v.bd,
      borderWidth: v.bd !== 'transparent' ? 1 : 0,
      borderRadius: T.radius.pill,
    }, style]}>
      {icon}
      <Text style={{
        fontFamily: T.sans,
        fontSize: s.fs,
        fontWeight: '500',
        color: v.fg,
        letterSpacing: 0.1,
      }}>
        {children}
      </Text>
    </View>
  );
}
