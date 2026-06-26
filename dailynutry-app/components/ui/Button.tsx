/**
 * DailyNutry — Button component
 * 
 * Primary CTA and variants — forest, secondary, ghost, cream.
 */

import React from 'react';
import { Pressable, Text, ViewStyle } from 'react-native';
import { T } from '../../constants/tokens';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'cream';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  onPress?: () => void;
  full?: boolean;
  style?: ViewStyle;
  disabled?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, { bg: string; fg: string; bd: string }> = {
  primary:   { bg: T.forest, fg: T.forestInk, bd: 'transparent' },
  secondary: { bg: T.surface, fg: T.ink, bd: T.hair },
  ghost:     { bg: 'transparent', fg: T.ink, bd: 'transparent' },
  cream:     { bg: T.cream, fg: '#6e521c', bd: 'transparent' },
};

const SIZE_STYLES: Record<ButtonSize, { padH: number; padV: number; fs: number; h: number; gap: number }> = {
  sm: { padH: 14, padV: 8,  fs: 13, h: 36, gap: 6 },
  md: { padH: 18, padV: 12, fs: 15, h: 48, gap: 8 },
  lg: { padH: 22, padV: 14, fs: 16, h: 56, gap: 10 },
};

export function Button({ children, variant = 'primary', size = 'md', icon, onPress, full, style, disabled }: ButtonProps) {
  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        paddingHorizontal: s.padH,
        paddingVertical: s.padV,
        height: s.h,
        backgroundColor: v.bg,
        borderColor: v.bd,
        borderWidth: v.bd !== 'transparent' ? 1 : 0,
        borderRadius: T.radius.pill,
        width: full ? '100%' : undefined,
        opacity: pressed ? 0.85 : disabled ? 0.5 : 1,
      }, style]}
    >
      {icon}
      <Text style={{
        fontFamily: T.sans,
        fontWeight: '600',
        fontSize: s.fs,
        color: v.fg,
        letterSpacing: 0.1,
      }}>
        {children}
      </Text>
    </Pressable>
  );
}
