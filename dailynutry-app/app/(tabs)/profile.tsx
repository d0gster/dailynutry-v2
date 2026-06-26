/**
 * DailyNutry — Profile Screen
 * 
 * User profile, plan info, settings, and pantry access.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { T } from '../../constants/tokens';
import { Ic } from '../../constants/icons';
import { Card } from '../../components/ui';
import { useDietStore } from '../../stores/diet-store';

export default function ProfileScreen() {
  const router = useRouter();
  const { plan } = useDietStore();

  const patientName = plan?.patientName?.trim() || '';
  const avatarLetter = patientName ? patientName[0].toUpperCase() : 'd';
  const mealCount = plan?.meals?.length ?? 0;
  const itemCount = plan?.meals?.reduce(
    (acc, m) => acc + (m.groups?.reduce((a, g) => a + g.items.length, 0) ?? 0),
    0,
  ) ?? 0;
  const groupCount = plan?.meals?.reduce((acc, m) => acc + (m.groups?.length ?? 0), 0) ?? 0;

  const MENU_ITEMS = [
    { id: 'pantry', icon: 'pantry', label: 'Minha despensa', desc: 'Ingredientes disponíveis', route: '/pantry' },
    { id: 'import', icon: 'cam', label: 'Importar plano', desc: 'Escanear folha do Dietbox', route: '/import' },
    { id: 'history', icon: 'book', label: 'Planos anteriores', desc: 'Planos importados', route: '/history' },
    { id: 'calendar', icon: 'calendar', label: 'Histórico', desc: 'Registro diário', route: '/calendar' },
    { id: 'settings', icon: 'settings', label: 'Configurações', desc: 'Unidades, chave API', route: '/settings' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.userName}>{patientName || 'Sem plano'}</Text>
            <Text style={styles.userPlan}>
              {plan?.planDate ? `Plano de ${plan.planDate}` : 'Nenhum plano importado'}
            </Text>
          </View>
        </View>

        {/* Plan info card — only when a plan is loaded */}
        {plan && (
          <Card style={styles.nutriCard}>
            {plan.nutritionistName ? (
              <View style={styles.nutriRow}>
                <View style={styles.nutriAvatar}>
                  <Text style={styles.nutriAvatarText}>
                    {plan.nutritionistName.trim()[0]?.toUpperCase() ?? '·'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nutriName}>{plan.nutritionistName}</Text>
                  <Text style={styles.nutriDetail}>
                    Nutricionista{plan.crn ? ` · CRN ${plan.crn}` : ''}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.nutriStats}>
              <View style={styles.nutriStat}>
                <Text style={styles.nutriStatValue}>{mealCount}</Text>
                <Text style={styles.nutriStatLabel}>refeições</Text>
              </View>
              <View style={styles.nutriDivider} />
              <View style={styles.nutriStat}>
                <Text style={styles.nutriStatValue}>{groupCount}</Text>
                <Text style={styles.nutriStatLabel}>grupos</Text>
              </View>
              <View style={styles.nutriDivider} />
              <View style={styles.nutriStat}>
                <Text style={styles.nutriStatValue}>{itemCount}</Text>
                <Text style={styles.nutriStatLabel}>itens</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Menu items */}
        <View style={styles.menu}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(item.route as any)}
              style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={styles.menuIcon}>
                <Ic name={item.icon as any} size={18} color={T.forest} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuDesc}>{item.desc}</Text>
              </View>
              <Ic name="chevR" size={16} color={T.inkMute} />
            </Pressable>
          ))}
        </View>

        {/* App info */}
        <View style={styles.appInfo}>
          <View style={styles.logoRow}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoLetter}>d</Text>
            </View>
            <Text style={styles.logoText}>DAILY NUTRY</Text>
          </View>
          <Text style={styles.version}>v1.0.0 · NU try, every day</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
  },
  scroll: {
    paddingBottom: 100,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 22,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 100,
    backgroundColor: T.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'InstrumentSerif',
    fontSize: 32,
    color: T.forestInk,
  },
  headerInfo: {},
  userName: {
    fontFamily: 'InstrumentSerif',
    fontSize: 28,
    color: T.ink,
    letterSpacing: -0.3,
  },
  userPlan: {
    fontFamily: 'Manrope',
    fontSize: 13,
    color: T.inkSoft,
    marginTop: 2,
  },
  nutriCard: {
    marginHorizontal: 18,
    marginBottom: 20,
  },
  nutriRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  nutriAvatar: {
    width: 38,
    height: 38,
    borderRadius: 100,
    backgroundColor: T.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutriAvatarText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 13,
    color: '#fff',
  },
  nutriName: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 14.5,
    color: T.ink,
  },
  nutriDetail: {
    fontFamily: 'Manrope',
    fontSize: 12,
    color: T.inkSoft,
    marginTop: 1,
  },
  nutriStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.bg,
    borderRadius: 12,
    padding: 12,
  },
  nutriStat: {
    flex: 1,
    alignItems: 'center',
  },
  nutriStatValue: {
    fontFamily: 'JetBrainsMono-Medium',
    fontSize: 16,
    color: T.forest,
    fontVariant: ['tabular-nums'],
  },
  nutriStatLabel: {
    fontFamily: 'Manrope',
    fontSize: 10,
    color: T.inkMute,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  nutriDivider: {
    width: 1,
    height: 28,
    backgroundColor: T.hairSoft,
  },
  menu: {
    paddingHorizontal: 18,
    gap: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: T.hairSoft,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 15,
    color: T.ink,
  },
  menuDesc: {
    fontFamily: 'Manrope',
    fontSize: 12,
    color: T.inkSoft,
    marginTop: 1,
  },
  appInfo: {
    alignItems: 'center',
    paddingTop: 30,
    paddingBottom: 20,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoCircle: {
    width: 28,
    height: 28,
    borderRadius: 100,
    backgroundColor: T.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    fontFamily: 'InstrumentSerif-Italic',
    fontSize: 18,
    color: T.forestInk,
  },
  logoText: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 13,
    letterSpacing: 0.6,
    color: T.ink,
  },
  version: {
    fontFamily: 'Manrope',
    fontSize: 11,
    color: T.inkMute,
    marginTop: 6,
  },
});
