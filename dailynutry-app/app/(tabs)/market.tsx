/**
 * DailyNutry — Market Screen (Mercado)
 * 
 * Quick access to shopping list configuration.
 * Shows summary of last shopping list and CTA to create new one.
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
import { Card, Button, Chip } from '../../components/ui';

const SHOPPING = [
  {
    cat: 'Carboidratos',
    items: [
      { name: 'Arroz branco', raw: '1,15 kg', detail: '90g cozido × 5d × 2p (+35%) · rend. 2.5×', checked: true },
      { name: 'Batata doce', raw: '450 g', detail: '90g cozida × 2d × 2p · perde 12%', checked: false },
      { name: 'Pão integral', raw: '14 fatias', detail: '2 fatias × 7 jantares', checked: false },
    ],
  },
  {
    cat: 'Proteínas',
    items: [
      { name: 'Filé de frango', raw: '2,2 kg', detail: '150g × 5 + 140g × 7 · perde ~25%', checked: false },
      { name: 'Filé de peixe', raw: '650 g', detail: '190g cozido × 2 · perde ~20%', checked: false },
      { name: 'Ovos', raw: '36 un.', detail: '2 ovos × 7 cafés + cozinha', checked: false },
    ],
  },
  {
    cat: 'Leguminosas',
    items: [
      { name: 'Feijão carioca seco', raw: '350 g', detail: '70g cozido × 5 · rend. 2,2×', checked: false },
      { name: 'Grão de bico seco', raw: '150 g', detail: '50g cozido × 2 · rend. 2,5×', checked: false },
    ],
  },
  {
    cat: 'Laticínios & extras',
    items: [
      { name: 'Iogurte zero', raw: '1,9 kg', detail: '200g × 7 lanches × +35%', checked: false },
      { name: 'Banana', raw: '1,4 kg', detail: '100g × 7 + perda casca ~35%', checked: false },
      { name: 'Whey protein', raw: '420 g', detail: '30g × 7 + sub ocasional', checked: false },
    ],
  },
];

export default function MarketScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>11 · 17 mai · 2 pessoas</Text>
            <Text style={styles.headerTitle}>
              Mercado da <Text style={styles.headerTitleAccent}>semana</Text>
            </Text>
          </View>
          <Pressable style={styles.settingsBtn}>
            <Ic name="settings" size={16} color={T.inkSoft} />
          </Pressable>
        </View>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryForest}>
            <Text style={styles.summaryLabel}>Estimado</Text>
            <Text style={styles.summaryValue}>R$ 342</Text>
            <Text style={styles.summaryDetail}>12 itens · ~24 kg</Text>
          </View>
          <View style={styles.summaryCream}>
            <Text style={styles.summaryCreamLabel}>Rendimento</Text>
            <Text style={styles.summaryCreamTitle}>
              Compra <Text style={{ fontFamily: 'InstrumentSerif-Italic' }}>cru</Text> → você come{' '}
              <Text style={{ fontFamily: 'InstrumentSerif-Italic' }}>pronto</Text>.
            </Text>
            <Text style={styles.summaryCreamDetail}>Cálculo automático ✓</Text>
          </View>
        </View>
      </View>

      {/* Shopping list */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {SHOPPING.map((group) => (
          <View key={group.cat} style={styles.group}>
            <Text style={styles.groupTitle}>{group.cat}</Text>
            <View style={styles.groupCard}>
              {group.items.map((item, i) => (
                <View key={item.name} style={[styles.itemRow, i > 0 && styles.itemBorder]}>
                  <View style={[styles.checkbox, item.checked && styles.checkboxDone]}>
                    {item.checked && (
                      <Ic name="check" size={13} color={T.forestInk} strokeWidth={2.5} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.itemNameRow}>
                      <Text style={[styles.itemName, item.checked && styles.itemNameDone]}>
                        {item.name}
                      </Text>
                      <Text style={[styles.itemRaw, item.checked && styles.itemRawDone]}>
                        {item.raw}
                      </Text>
                    </View>
                    <Text style={styles.itemDetail}>{item.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
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
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: T.hairSoft,
    backgroundColor: T.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  summaryForest: {
    flex: 1,
    backgroundColor: T.forest,
    borderRadius: 14,
    padding: 14,
  },
  summaryLabel: {
    fontFamily: 'Manrope-Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    color: T.forestInk,
    opacity: 0.7,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontFamily: 'InstrumentSerif',
    fontSize: 26,
    color: T.forestInk,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  summaryDetail: {
    fontFamily: 'Manrope',
    fontSize: 11,
    color: T.forestInk,
    opacity: 0.7,
    marginTop: 2,
  },
  summaryCream: {
    flex: 1,
    backgroundColor: T.cream,
    borderRadius: 14,
    padding: 14,
  },
  summaryCreamLabel: {
    fontFamily: 'Manrope-Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    color: '#6e521c',
    opacity: 0.7,
    textTransform: 'uppercase',
  },
  summaryCreamTitle: {
    fontFamily: 'InstrumentSerif',
    fontSize: 18,
    lineHeight: 21,
    color: '#6e521c',
    marginTop: 4,
  },
  summaryCreamDetail: {
    fontFamily: 'Manrope',
    fontSize: 10,
    color: '#6e521c',
    opacity: 0.7,
    marginTop: 4,
  },
  scroll: {
    padding: 18,
    paddingBottom: 100,
  },
  group: {
    marginBottom: 14,
  },
  groupTitle: {
    fontFamily: 'Manrope-Bold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: T.inkMute,
    textTransform: 'uppercase',
    paddingVertical: 6,
    paddingHorizontal: 4,
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
