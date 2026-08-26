/**
 * DailyNutry — Market Screen (Mercado)
 *
 * Shopping list generated from the active diet plan.
 * Groups items by category, sums duplicates across meals,
 * and shows both cooked (prescribed) and raw (purchase) quantities
 * using yield factors from the gateway enrichment.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { T } from '../../constants/tokens';
import { Ic } from '../../constants/icons';
import { useDietStore } from '../../stores/diet-store';
import type { DietPlan } from '../../constants/foods';

// ─── Category display config ─────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  protein: { label: 'Proteínas',    icon: 'flame',   color: '#a64b3a' },
  carb:    { label: 'Carboidratos', icon: 'droplet',  color: '#c98a5b' },
  legume:  { label: 'Legumes',      icon: 'leaf',     color: '#4a7340' },
  dairy:   { label: 'Laticínios',  icon: 'droplet',  color: '#5b7a9a' },
  fruit:   { label: 'Frutas',       icon: 'apple',    color: '#8a5bc9' },
  salad:   { label: 'Saladas',      icon: 'leaf',     color: '#6a9a5b' },
  other:   { label: 'Outros',       icon: 'plate',    color: T.inkSoft },
};

interface AggregatedItem {
  name: string;
  rawQty: number;
  unit: string;
  yieldFactor?: number;
  calories: number;
}

function aggregateItems(plan: DietPlan) {
  const byCategory: Record<string, Record<string, AggregatedItem>> = {};

  for (const meal of plan.meals) {
    for (const group of meal.groups) {
      const cat = group.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = {};

      for (const item of group.items) {
        const key = item.name.toLowerCase().trim();
        if (!byCategory[cat][key]) {
          byCategory[cat][key] = {
            name: item.name,
            rawQty: 0,
            unit: item.unit,
            yieldFactor: item.yieldFactor,
            calories: 0,
          };
        }
        byCategory[cat][key].rawQty += item.rawQty;
        byCategory[cat][key].calories += (item.calories ?? 0);
        // Keep the yield factor from the first occurrence
        if (item.yieldFactor && !byCategory[cat][key].yieldFactor) {
          byCategory[cat][key].yieldFactor = item.yieldFactor;
        }
      }
    }
  }

  return byCategory;
}

function formatQty(qty: number, unit: string): string {
  if (qty === 0) return 'à vontade';
  const rounded = Math.round(qty * 10) / 10;
  return `${rounded}${unit ? ` ${unit}` : ''}`;
}

const CATEGORY_ORDER = ['protein', 'carb', 'legume', 'dairy', 'fruit', 'salad', 'other'];

export default function MarketScreen() {
  const { plan, shoppingChecked, toggleShoppingItem } = useDietStore();

  if (!plan) {
    return (
      <View style={styles.container}>
        <View style={styles.headerWrap}>
          <Text style={styles.headerTitle}>Mercado</Text>
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ic name="cart" size={32} color={T.inkMute} />
          </View>
          <Text style={styles.emptyTitle}>Nenhum plano ativo</Text>
          <Text style={styles.emptyDesc}>
            Importe um plano alimentar para gerar a lista de compras.
          </Text>
        </View>
      </View>
    );
  }

  const grouped = aggregateItems(plan);
  const totalItems = Object.values(grouped).reduce((s, cat) => s + Object.keys(cat).length, 0);
  const checkedCount = shoppingChecked.length;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerWrap}>
          <View>
            <Text style={styles.headerTitle}>
              Mercado da <Text style={styles.headerTitleAccent}>semana</Text>
            </Text>
            <Text style={styles.headerSub}>
              {checkedCount}/{totalItems} itens comprados
            </Text>
          </View>
        </View>

        {/* Yield info card */}
        <View style={styles.yieldCard}>
          <Text style={styles.yieldCardLabel}>Rendimento</Text>
          <Text style={styles.yieldCardTitle}>
            Compra <Text style={{ fontFamily: 'InstrumentSerif-Italic' }}>cru</Text> → você come{' '}
            <Text style={{ fontFamily: 'InstrumentSerif-Italic' }}>pronto</Text>.
          </Text>
          <Text style={styles.yieldCardDetail}>Cálculo automático ✓</Text>
        </View>

        {/* Category sections */}
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat];
          if (!items || Object.keys(items).length === 0) return null;
          const meta = CATEGORY_META[cat] || CATEGORY_META.other;

          return (
            <View key={cat} style={styles.group}>
              <View style={styles.groupHeader}>
                <View style={[styles.groupDot, { backgroundColor: meta.color }]}>
                  <Ic name={meta.icon} size={14} color="#fff" />
                </View>
                <Text style={styles.groupTitle}>{meta.label}</Text>
                <Text style={styles.groupCount}>{Object.keys(items).length}</Text>
              </View>

              <View style={styles.groupCard}>
                {Object.values(items).map((item, i) => {
                  const key = item.name.toLowerCase().trim();
                  const isChecked = shoppingChecked.includes(key);
                  const rawPurchaseQty = item.yieldFactor
                    ? item.rawQty / item.yieldFactor
                    : null;

                  return (
                    <Pressable
                      key={key}
                      style={[styles.itemRow, i > 0 && styles.itemBorder]}
                      onPress={() => toggleShoppingItem(key)}
                    >
                      {/* Checkbox */}
                      <View style={[styles.checkbox, isChecked && styles.checkboxDone]}>
                        {isChecked && <Ic name="check" size={13} color={T.forestInk} strokeWidth={2.5} />}
                      </View>

                      {/* Item info */}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.itemNameRow}>
                          <Text style={[styles.itemName, isChecked && styles.itemNameDone]}>
                            {item.name}
                          </Text>
                          <Text style={[styles.itemRaw, isChecked && styles.itemRawDone]}>
                            {formatQty(item.rawQty, item.unit)}
                          </Text>
                        </View>
                        <Text style={styles.itemDetail}>
                          Pronto: {formatQty(item.rawQty, item.unit)}
                          {rawPurchaseQty != null && (
                            ` → Cru: ${formatQty(rawPurchaseQty, item.unit)}`
                          )}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
  },
  scroll: {
    padding: 18,
    paddingBottom: 100,
  },

  // Header
  headerWrap: {
    paddingTop: 36,
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontFamily: 'InstrumentSerif',
    fontSize: 28,
    lineHeight: 32,
    color: T.ink,
    letterSpacing: -0.3,
  },
  headerTitleAccent: {
    fontFamily: 'InstrumentSerif-Italic',
    color: T.forest,
  },
  headerSub: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 13,
    color: T.inkMute,
    marginTop: 4,
  },

  // Yield info card
  yieldCard: {
    backgroundColor: T.cream,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  yieldCardLabel: {
    fontFamily: 'Manrope-Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    color: '#6e521c',
    opacity: 0.7,
    textTransform: 'uppercase',
  },
  yieldCardTitle: {
    fontFamily: 'InstrumentSerif',
    fontSize: 18,
    lineHeight: 21,
    color: '#6e521c',
    marginTop: 4,
  },
  yieldCardDetail: {
    fontFamily: 'Manrope',
    fontSize: 10,
    color: '#6e521c',
    opacity: 0.7,
    marginTop: 4,
  },

  // Empty state
  emptyState: {
    marginHorizontal: 22,
    marginTop: 40,
    padding: 30,
    alignItems: 'center',
    backgroundColor: T.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: T.hair,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: T.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'InstrumentSerif',
    fontSize: 22,
    color: T.ink,
    marginBottom: 8,
  },
  emptyDesc: {
    fontFamily: 'Manrope',
    fontSize: 14,
    color: T.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Groups
  group: {
    marginBottom: 14,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  groupDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: {
    flex: 1,
    fontFamily: 'Manrope-Bold',
    fontSize: 13,
    letterSpacing: 0.8,
    color: T.inkMute,
    textTransform: 'uppercase',
  },
  groupCount: {
    fontFamily: 'JetBrainsMono',
    fontSize: 12,
    color: T.inkMute,
  },
  groupCard: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.hairSoft,
    borderRadius: 16,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    alignItems: 'flex-start',
  },
  itemBorder: {
    borderTopWidth: 1,
    borderTopColor: T.hairSoft,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    marginTop: 2,
    borderWidth: 1.5,
    borderColor: T.hair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    backgroundColor: T.forest,
    borderColor: T.forest,
    borderWidth: 0,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemName: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 14.5,
    color: T.ink,
    flex: 1,
  },
  itemNameDone: {
    color: T.inkMute,
    textDecorationLine: 'line-through',
  },
  itemRaw: {
    fontFamily: 'JetBrainsMono',
    fontSize: 13,
    fontWeight: '700',
    color: T.forest,
    fontVariant: ['tabular-nums'],
  },
  itemRawDone: {
    color: T.inkMute,
  },
  itemDetail: {
    fontFamily: 'Manrope',
    fontSize: 11.5,
    color: T.inkSoft,
    marginTop: 3,
    lineHeight: 16,
  },
});
