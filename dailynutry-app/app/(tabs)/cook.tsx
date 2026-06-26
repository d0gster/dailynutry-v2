/**
 * DailyNutry — Cook Mode Screen
 * 
 * "Hoje na panela" — flattened view of every ingredient by meal.
 * Designed for greasy-finger cooking mode.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { T } from '../../constants/tokens';
import { Ic } from '../../constants/icons';

const COOK_MEALS = [
  {
    time: '08:30',
    name: 'Café da manhã',
    icon: 'coffee',
    ings: [
      ['2 fatias', 'Pão integral'],
      ['15 g', 'Creme de Ricota'],
      ['2 un', 'Ovos'],
      ['100 g', 'Mamão'],
      ['1 copo', 'Café · canela'],
    ],
  },
  {
    time: '13:30',
    name: 'Almoço',
    icon: 'plate',
    ings: [
      ['220 g', 'Arroz branco · pronto'],
      ['1 concha', 'Feijão carioca'],
      ['115 g', 'Frango grelhado'],
      ['à vontade', 'Salada folhas + legumes'],
    ],
    note: 'Pré-cozinhar feijão na quarta · arroz no dia',
  },
  {
    time: '17:00',
    name: 'Lanche',
    icon: 'apple',
    ings: [
      ['200 g', 'Iogurte zero'],
      ['1 un', 'Banana'],
      ['1 c. sopa', 'Granola sem açúcar (20g)'],
      ['1 dose', 'Whey (30g)'],
    ],
  },
  {
    time: '20:30',
    name: 'Jantar',
    icon: 'moon',
    ings: [
      ['2 fatias', 'Pão integral'],
      ['20 g', 'Muçarela'],
      ['140 g', 'Frango grelhado'],
      ['à vontade', 'Alface + Tomate'],
    ],
  },
];

type UnitMode = 'gramatura' | 'caseira' | 'crupronto';

export default function CookScreen() {
  const [unitMode, setUnitMode] = useState<UnitMode>('gramatura');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerLabel}>Modo cozinha</Text>
            <Text style={styles.headerTitle}>
              Hoje na <Text style={styles.headerTitleAccent}>panela</Text>
            </Text>
          </View>
        </View>

        {/* Unit toggle */}
        <View style={styles.unitToggle}>
          {(['gramatura', 'caseira', 'crupronto'] as UnitMode[]).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setUnitMode(mode)}
              style={[styles.unitTab, unitMode === mode && styles.unitTabActive]}
            >
              <Text style={[styles.unitTabText, unitMode === mode && styles.unitTabTextActive]}>
                {mode === 'gramatura' ? 'Gramatura' : mode === 'caseira' ? 'Medida caseira' : 'Cru / pronto'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Meal blocks */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {COOK_MEALS.map((m) => (
          <View key={m.time} style={styles.mealBlock}>
            <View style={styles.mealHeader}>
              <View style={styles.mealIcon}>
                <Ic name={m.icon} size={15} color={T.inkSoft} />
              </View>
              <Text style={styles.mealTime}>{m.time}</Text>
              <Text style={styles.mealName}>{m.name}</Text>
              <View style={{ flex: 1 }} />
              <Ic name="timer" size={15} color={T.inkMute} />
            </View>

            <View style={styles.ingsList}>
              {m.ings.map((row, i) => (
                <View
                  key={i}
                  style={[styles.ingRow, i > 0 && styles.ingRowBorder]}
                >
                  <Text style={styles.ingQty}>{row[0]}</Text>
                  <Text style={styles.ingName}>{row[1]}</Text>
                </View>
              ))}
            </View>

            {m.note && (
              <View style={styles.noteBox}>
                <Ic name="info" size={12} color="#6e521c" />
                <Text style={styles.noteText}>{m.note}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLabel: {
    fontFamily: 'Manrope-Bold',
    fontSize: 11,
    letterSpacing: 1,
    color: T.inkMute,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: 'InstrumentSerif',
    fontSize: 28,
    lineHeight: 32,
    color: T.ink,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  headerTitleAccent: {
    fontFamily: 'InstrumentSerif-Italic',
    color: T.forest,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: T.surfaceAlt,
    borderRadius: 100,
    padding: 3,
    marginTop: 12,
  },
  unitTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 100,
  },
  unitTabActive: {
    backgroundColor: T.forest,
  },
  unitTabText: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 11.5,
    color: T.inkSoft,
    letterSpacing: 0.2,
  },
  unitTabTextActive: {
    color: T.forestInk,
  },
  scroll: {
    padding: 18,
    paddingBottom: 100,
    gap: 10,
  },
  mealBlock: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.hairSoft,
    borderRadius: 18,
    padding: 14,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  mealIcon: {
    width: 30,
    height: 30,
    borderRadius: 100,
    backgroundColor: T.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTime: {
    fontFamily: 'JetBrainsMono',
    fontSize: 11,
    fontWeight: '600',
    color: T.inkSoft,
  },
  mealName: {
    fontFamily: 'InstrumentSerif',
    fontSize: 19,
    color: T.ink,
    letterSpacing: -0.2,
  },
  ingsList: {},
  ingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 6,
  },
  ingRowBorder: {
    borderTopWidth: 1,
    borderTopColor: T.hairSoft,
  },
  ingQty: {
    fontFamily: 'JetBrainsMono',
    fontSize: 13,
    fontWeight: '700',
    color: T.forest,
    minWidth: 76,
    fontVariant: ['tabular-nums'],
  },
  ingName: {
    flex: 1,
    fontFamily: 'Manrope-Medium',
    fontSize: 13.5,
    color: T.ink,
  },
  noteBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: T.cream,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  noteText: {
    fontFamily: 'Manrope',
    fontSize: 11.5,
    color: '#6e521c',
    flex: 1,
  },
});
