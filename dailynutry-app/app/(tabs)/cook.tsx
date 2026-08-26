/**
 * DailyNutry — Cook Mode Screen (Cozinha)
 *
 * Placeholder for the upcoming cooking mode.
 * Will include: timer, step-by-step mode, and measurement conversions.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { T } from '../../constants/tokens';
import { Ic } from '../../constants/icons';

export default function CookScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.headerWrap}>
        <Text style={styles.headerTitle}>Modo Cozinha</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ic name="fork" size={32} color={T.forest} />
        </View>
        <Text style={styles.title}>Em breve</Text>
        <Text style={styles.desc}>
          Timer, modo passo a passo e conversão de medidas.
        </Text>

        <View style={styles.featureList}>
          <View style={styles.featureRow}>
            <Ic name="timer" size={16} color={T.sage} />
            <Text style={styles.featureText}>Timer para cada preparo</Text>
          </View>
          <View style={styles.featureRow}>
            <Ic name="list" size={16} color={T.sage} />
            <Text style={styles.featureText}>Passo a passo das receitas</Text>
          </View>
          <View style={styles.featureRow}>
            <Ic name="scale" size={16} color={T.sage} />
            <Text style={styles.featureText}>Conversão de medidas</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
  },
  headerWrap: {
    paddingHorizontal: 22,
    paddingTop: 56,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: 'InstrumentSerif',
    fontSize: 38,
    color: T.ink,
    letterSpacing: -0.6,
  },
  card: {
    marginHorizontal: 22,
    marginTop: 20,
    padding: 30,
    alignItems: 'center',
    backgroundColor: T.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: T.hair,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: T.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'InstrumentSerif',
    fontSize: 24,
    color: T.ink,
    marginBottom: 8,
  },
  desc: {
    fontFamily: 'Manrope',
    fontSize: 14,
    color: T.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  featureList: {
    alignSelf: 'stretch',
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: T.surfaceAlt,
    borderRadius: 12,
  },
  featureText: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 13.5,
    color: T.ink,
  },
});
