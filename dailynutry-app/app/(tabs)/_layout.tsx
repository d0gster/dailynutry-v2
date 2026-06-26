/**
 * DailyNutry — Tab Navigator Layout
 * 
 * Bottom tab bar with custom DailyNutry styling.
 * Tabs: Hoje (Home), Cozinha (Cook), Mercado (Market), Perfil (Profile)
 */

import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../../constants/tokens';
import { Ic } from '../../constants/icons';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(248,245,238,0.95)',
          borderTopWidth: 1,
          borderTopColor: T.hairSoft,
          paddingTop: 6,
          paddingBottom: bottomPad,
          height: 56 + bottomPad,
          elevation: 0,
        },
        tabBarActiveTintColor: T.forest,
        tabBarInactiveTintColor: T.inkSoft,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hoje',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
              <Ic name="home" size={20} color={focused ? T.forestInk : T.inkSoft} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="cook"
        options={{
          title: 'Cozinha',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
              <Ic name="fork" size={20} color={focused ? T.forestInk : T.inkSoft} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Mercado',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
              <Ic name="cart" size={20} color={focused ? T.forestInk : T.inkSoft} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
              <Ic name="user" size={20} color={focused ? T.forestInk : T.inkSoft} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  tabItem: {
    paddingVertical: 4,
  },
  tabIconWrap: {
    width: 42,
    height: 30,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {
    backgroundColor: T.forest,
    borderRadius: 14,
  },
});

