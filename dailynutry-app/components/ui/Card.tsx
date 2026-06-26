/**
 * DailyNutry — Card component
 * 
 * Raised surface card — the base for everything stacked
 * on home/detail screens.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { T } from '../../constants/tokens';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  padding?: number;
}

export function Card({ children, style, onPress, padding = 16 }: CardProps) {
  const inner = (
    <View style={[styles.card, { padding }, style]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
        {inner}
      </Pressable>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.hairSoft,
  },
});
