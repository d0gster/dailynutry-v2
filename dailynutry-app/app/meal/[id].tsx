/**
 * DailyNutry — Meal Detail Screen
 * 
 * Shows ingredient details for a meal with swipeable
 * alternative combinations. Includes macros, photo slot,
 * and "mark as eaten" functionality.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../../constants/tokens';
import { Ic } from '../../constants/icons';
import { Button } from '../../components/ui';
import { useDietStore } from '../../stores/diet-store';

export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [useMedida, setUseMedida] = useState(false);
  const insets = useSafeAreaInsets();
  const { plan, eatenMealIds, toggleMealEaten } = useDietStore();

  const meal = plan?.meals.find(m => m.id === id);

  if (!meal) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ic name="chevL" size={18} color={T.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Refeição</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.simpleMealText}>Refeição não encontrada no plano atual.</Text>
        </View>
      </View>
    );
  }

  const eaten = eatenMealIds.includes(meal.id);
  const groups = meal.groups ?? [];

  const formatQty = (rawQty: number, unit: string, household?: string) => {
    if (useMedida) return household || (rawQty > 0 ? `${rawQty}${unit}` : 'à vontade');
    return rawQty > 0 ? `${rawQty}${unit}` : (household || 'à vontade');
  };

  return (
    <View style={styles.container}>
      {/* ─── Header ──────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ic name="chevL" size={18} color={T.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>{meal.time}</Text>
          <Text style={styles.headerTitle}>{meal.name}</Text>
        </View>
        <Pressable
          style={styles.scaleBtn}
          onPress={() => setUseMedida(!useMedida)}
        >
          <Ic name="scale" size={16} color={useMedida ? T.forest : T.inkSoft} />
        </Pressable>
      </View>

      {/* ─── Content ─────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo slot */}
        <View style={styles.photoSlot}>
          <Ic name="cam" size={22} color={T.inkMute} />
          <Text style={styles.photoLabel}>foto da refeição</Text>
        </View>

        {/* Real groups + items from the imported plan */}
        {groups.length > 0 ? (
          groups.map((group, gi) => (
            <View key={gi}>
              {group.items.map((item, ii) => (
                <IngredientRow
                  key={ii}
                  group={ii === 0 ? group.name : ''}
                  name={item.name}
                  qty={formatQty(item.rawQty, item.unit, item.householdMeasure)}
                  detail={!useMedida && item.rawQty > 0 ? (item.householdMeasure || '') : ''}
                />
              ))}
            </View>
          ))
        ) : (
          <Text style={styles.simpleMealText}>Esta refeição não tem itens detalhados.</Text>
        )}

        {/* Nutritionist note — only what the plan actually carries */}
        {meal.notes ? (
          <View style={styles.noteBox}>
            <Ic name="info" size={15} color="#6e521c" />
            <Text style={styles.noteText}>
              <Text style={{ fontFamily: 'Manrope-Bold' }}>Obs da nutri:</Text> {meal.notes}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* ─── Footer ──────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable style={styles.camBtn}>
          <Ic name="cam" size={18} color={T.ink} />
        </Pressable>
        <Button
          variant={eaten ? 'secondary' : 'primary'}
          size="md"
          style={{ flex: 1 }}
          onPress={() => toggleMealEaten(meal.id)}
          icon={<Ic name="check" size={18} color={eaten ? T.forest : '#f4f1e8'} strokeWidth={2.2} />}
        >
          {eaten ? 'Comido' : 'Marcar como comido'}
        </Button>
      </View>
    </View>
  );
}

// ─── Sub-components ─────────────────────────────────────

function IngredientRow({ group, name, qty, detail }: {
  group: string;
  name: string;
  qty: string;
  detail: string;
}) {
  return (
    <View style={styles.ingRow}>
      <View style={styles.ingPhoto}>
        <Ic name="cam" size={14} color={T.inkMute} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.ingGroup}>{group}</Text>
        <Text style={styles.ingName}>{name}</Text>
        <Text style={styles.ingQty}>
          {qty}
          {detail ? <Text style={{ color: T.inkMute }}> · {detail}</Text> : null}
        </Text>
      </View>
      <Pressable style={styles.swapBtn}>
        <Ic name="swap" size={13} color={T.inkSoft} />
      </Pressable>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
  },
  header: {
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: T.hairSoft,
    backgroundColor: T.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 24,
    lineHeight: 28,
    color: T.ink,
    letterSpacing: -0.3,
  },
  headerTitleAccent: {
    fontFamily: 'InstrumentSerif-Italic',
    color: T.forest,
  },
  scaleBtn: {
    width: 40,
    height: 40,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: T.hairSoft,
    backgroundColor: T.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 20,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  photoSlot: {
    height: 130,
    borderRadius: 18,
    marginBottom: 16,
    backgroundColor: T.surfaceAlt,
    borderWidth: 1,
    borderColor: T.hair,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoLabel: {
    fontFamily: 'JetBrainsMono',
    fontSize: 10,
    color: T.inkMute,
    letterSpacing: 0.3,
  },
  ingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.hairSoft,
  },
  ingPhoto: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: T.surfaceAlt,
    borderWidth: 1,
    borderColor: T.hair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingGroup: {
    fontFamily: 'Manrope-Bold',
    fontSize: 10.5,
    color: T.inkMute,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  ingName: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 14.5,
    color: T.ink,
    lineHeight: 17,
  },
  ingQty: {
    fontFamily: 'JetBrainsMono',
    fontSize: 11,
    color: T.inkSoft,
    marginTop: 2,
  },
  swapBtn: {
    width: 28,
    height: 28,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: T.hairSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleMealText: {
    fontFamily: 'Manrope-Medium',
    fontSize: 15,
    color: T.inkSoft,
    lineHeight: 22,
    paddingVertical: 16,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noteBox: {
    backgroundColor: T.cream,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  noteText: {
    fontFamily: 'Manrope',
    fontSize: 12.5,
    color: '#6e521c',
    lineHeight: 18,
    flex: 1,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 4,
    backgroundColor: T.hair,
  },
  dotActive: {
    width: 22,
    backgroundColor: T.forest,
  },
  footer: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.hairSoft,
  },
  camBtn: {
    width: 52,
    height: 52,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: T.hair,
    backgroundColor: T.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
