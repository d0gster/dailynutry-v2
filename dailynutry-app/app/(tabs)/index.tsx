/**
 * DailyNutry — Home Screen (Hoje)
 * 
 * Vertical stack of meal cards with greeting, progress ring,
 * streak counter, and nutritionist notes.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { T } from '../../constants/tokens';
import { Ic } from '../../constants/icons';
import { Chip } from '../../components/ui';
import { useFocusEffect } from '@react-navigation/native';
import { useDietStore } from '../../stores/diet-store';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const { plan, eatenMealIds, toggleMealEaten, markMealEaten, checkDailyReset, autoCompleteMeals, toggleAutoCompleteMeals } = useDietStore();
  const [showPopup, setShowPopup] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  // Check for daily reset on focus
  useFocusEffect(
    React.useCallback(() => {
      checkDailyReset();
    }, [checkDailyReset])
  );

  // Auto-complete meals periodically if active
  useEffect(() => {
    if (!autoCompleteMeals || !plan?.meals) return;
    
    const evaluateMeals = () => {
      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();
      
      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      plan.meals.forEach(m => {
        if (toMin(m.time) <= currentMin) {
          markMealEaten(m.id);
        }
      });
    };

    evaluateMeals(); // run immediately
    const interval = setInterval(evaluateMeals, 60000); // and every minute
    return () => clearInterval(interval);
  }, [autoCompleteMeals, plan, markMealEaten]);
  
  // Transform raw plan meals into displayable meals with eaten state
  const meals = (plan?.meals || []).map(m => ({
    ...m,
    eaten: eatenMealIds.includes(m.id),
    cal: 0, // we will calculate this properly later or parse it from the plan
    alts: m.groups?.reduce((acc, g) => acc + g.items.length, 0) || 0,
    current: m.groups?.map(g => g.items.map(i => `${i.rawQty}${i.unit} ${i.name}`).join(' · ')).join(' + ') || '',
  }));

  const eaten = meals.filter(m => m.eaten).length;
  const total = meals.length;
  const pct = total > 0 ? eaten / total : 0;

  // Get current day name in Portuguese
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const now = new Date();
  const dayStr = `${dayNames[now.getDay()]} · ${now.getDate()} ${monthNames[now.getMonth()]}`;

  // Greeting based on time of day
  const hour = now.getHours();
  const mins = now.getMinutes();
  const nowMinutes = hour * 60 + mins;
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = plan?.patientName?.trim().split(' ')[0] ?? '';

  // Determine next meal (active card = green)
  // Priority: first uneaten meal whose time is >= now, else first uneaten overall
  const getNextMealId = (): string | null => {
    const uneaten = meals.filter(m => !m.eaten);
    if (uneaten.length === 0) return null;
    // Parse "HH:MM" to minutes
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    // Find first uneaten meal whose time hasn't fully passed
    const upcoming = uneaten.find(m => toMin(m.time) >= nowMinutes);
    return upcoming ? upcoming.id : uneaten[0].id;
  };
  const activeMealId = getNextMealId();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Header ──────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.dayLabel}>{dayStr}</Text>
            <Text style={styles.greeting}>
              {greeting}{firstName ? ', ' : ''}
              {firstName ? <Text style={styles.greetingName}>{firstName}</Text> : null}
            </Text>
          </View>

          {/* Progress Ring */}
          <View style={styles.ringOuter}>
            <View style={styles.ringWrap}>
              <Svg width={56} height={56} viewBox="0 0 56 56">
                <Circle
                  cx={28} cy={28} r={22}
                  fill="none" stroke={T.hairSoft} strokeWidth={4}
                />
                <Circle
                  cx={28} cy={28} r={22}
                  fill="none" stroke={T.forest} strokeWidth={4}
                  strokeDasharray={2 * Math.PI * 22}
                  strokeDashoffset={2 * Math.PI * 22 * (1 - pct)}
                  strokeLinecap="round"
                  rotation={-90}
                  origin="28, 28"
                />
              </Svg>
              <View style={styles.ringText}>
                <Text style={styles.ringCount}>{eaten}/{total}</Text>
              </View>
            </View>
            <Text style={styles.ringLabel}>refeições</Text>
          </View>
        </View>

        {/* ─── Streak + Quick Info ──────────────────────── */}
        <View style={styles.chipRow}>
          <View style={{ position: 'relative' }}>
            <Pressable 
              onPress={toggleAutoCompleteMeals}
              onLongPress={() => {
                setShowTooltip(true);
                setTimeout(() => setShowTooltip(false), 5000);
              }}
            >
              <Chip 
                variant={autoCompleteMeals ? "cream" : "outline"} 
                size="md" 
                icon={<Ic name="check" size={13} color={autoCompleteMeals ? T.forest : T.inkSoft} />}
              >
                Auto
              </Chip>
            </Pressable>

            {showTooltip && (
              <View style={styles.tooltip}>
                <Text style={styles.tooltipText}>
                  Quando ativo, o app marca automaticamente as refeições como concluídas assim que o horário delas passar.
                </Text>
                <View style={styles.tooltipArrow} />
              </View>
            )}
          </View>
        </View>

        {/* ─── Meal Cards ──────────────────────────────── */}
        <View style={styles.mealList}>
          {meals.length > 0 ? meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={{ ...meal, active: meal.id === activeMealId }}
              onPress={() => router.push(`/meal/${meal.id}`)}
              onCheckToggle={() => toggleMealEaten(meal.id)}
            />
          )) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nenhum plano ativo</Text>
              <Text style={styles.emptyDesc}>Importe a sua dieta pela aba Perfil para começar a usar o DailyNutry.</Text>
            </View>
          )}
        </View>

        {/* ─── Day Notes (from the imported plan) ────────── */}
        {plan?.notes && plan.notes.length > 0 && (
          <View style={styles.notesWrap}>
            <View style={styles.notesCard}>
              <View style={{ marginTop: 2 }}>
                <Ic name="info" size={16} color={T.sage} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.notesTitle}>Lembretes do plano</Text>
                <Text style={styles.notesText}>
                  {plan.notes.join(' · ')}
                  {plan.nutritionistName ? (
                    <Text style={{ color: T.inkMute }}>
                      {'\n'}Receitado por {plan.nutritionistName}
                      {plan.crn ? ` · CRN ${plan.crn}` : ''}
                    </Text>
                  ) : null}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ─── Empty State Popup ─────────────────────────── */}
      {!plan && (
        <Modal
          visible={showPopup}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowPopup(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalIconBox}>
                <Ic name="plate" size={24} color={T.forest} />
              </View>
              <Text style={styles.modalTitle}>Eita pois!</Text>
              <Text style={styles.modalText}>
                Tu ainda não registrou o plano alimentar... let's que bora lá!
              </Text>
              <View style={styles.modalBtns}>
                <Pressable
                  style={[styles.modalBtn, { backgroundColor: T.surfaceAlt, borderColor: T.hair }]}
                  onPress={() => setShowPopup(false)}
                >
                  <Text style={[styles.modalBtnText, { color: T.inkSoft }]}>Depois</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, { backgroundColor: T.forest, borderColor: T.forest }]}
                  onPress={() => {
                    setShowPopup(false);
                    router.push('/onboarding');
                  }}
                >
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Bora lá!</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── MealCard Component ──────────────────────────────────

interface MealCardProps {
  meal: {
    id: string;
    time: string;
    name: string;
    icon: string;
    current?: string;
    alts?: number;
    cal?: number;
    eaten?: boolean;
    active?: boolean;
  };
  onPress: () => void;
  onCheckToggle?: () => void;
}

function MealCard({ meal, onPress, onCheckToggle }: MealCardProps) {
  const active = meal.active;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.mealCard,
        active && styles.mealCardActive,
        { opacity: pressed ? 0.95 : 1 },
      ]}
    >
      {/* Row 1: Time + Icon + Name + Check */}
      <View style={styles.mealRow1}>
        <View style={[styles.mealIconWrap, active && styles.mealIconActive]}>
          <Ic
            name={meal.icon}
            size={16}
            color={active ? T.forestInk : T.inkSoft}
          />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.mealNameRow}>
            <Text style={[styles.mealTime, active && styles.mealTimeActive]}>
              {meal.time}
            </Text>
            <Text style={[styles.mealName, active && { color: T.forestInk }]}>
              {meal.name}
            </Text>
          </View>
        </View>
        {/* Checkbox — separate Pressable to prevent card navigation */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onCheckToggle?.();
          }}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          {meal.eaten ? (
            <View style={styles.checkDone}>
              <Ic name="check" size={16} color="#f4f1e8" strokeWidth={2.2} />
            </View>
          ) : (
            <View style={[styles.checkEmpty, active && styles.checkEmptyActive]} />
          )}
        </Pressable>
      </View>

      {/* Current selection */}
      <Text style={[styles.mealCurrent, active && { color: 'rgba(244,241,232,0.92)' }]}>
        {meal.current}
      </Text>

      {/* Row 3: Alts + Macros + CTA */}
      <View style={styles.mealRow3}>
        <View style={styles.mealChips}>
          <View style={[styles.mealChip, active && styles.mealChipActive]}>
            <Ic name="swap" size={11} color={active ? T.forestInk : T.inkSoft} />
            <Text style={[styles.mealChipText, active && { color: T.forestInk }]}>
              {meal.alts} combinações
            </Text>
          </View>
          <View style={[styles.mealChip, active && styles.mealChipActive]}>
            <Text style={[styles.mealCalText, active && { color: T.forestInk }]}>
              {meal.cal}
            </Text>
            <Text style={[styles.mealCalUnit, active && { color: T.forestInk }]}>kcal</Text>
          </View>
        </View>
        <View style={styles.mealCta}>
          <Text style={[styles.mealCtaText, active && { color: T.forestInk }]}>
            Abrir
          </Text>
          <Ic
            name="chevR"
            size={14}
            color={active ? T.forestInk : T.forest}
            strokeWidth={2.2}
          />
        </View>
      </View>
    </Pressable>
  );
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
  },
  scroll: {
    paddingBottom: 100,
  },

  // Header
  header: {
    paddingHorizontal: 22,
    paddingTop: 50,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {},
  dayLabel: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 12,
    color: T.inkMute,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  greeting: {
    fontFamily: 'InstrumentSerif',
    fontSize: 38,
    lineHeight: 42,
    color: T.ink,
    marginTop: 6,
    letterSpacing: -0.6,
  },
  greetingName: {
    fontFamily: 'InstrumentSerif-Italic',
    color: T.forest,
  },

  // Progress Ring
  ringOuter: {
    alignItems: 'center',
  },
  ringWrap: {
    width: 56,
    height: 56,
    position: 'relative',
  },
  ringText: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCount: {
    fontFamily: 'Manrope-Bold',
    fontSize: 15,
    color: T.ink,
    lineHeight: 18,
  },
  ringLabel: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 9,
    color: T.inkMute,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },

  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 6,
    zIndex: 10,
  },
  
  // Tooltip
  tooltip: {
    position: 'absolute',
    top: 36,
    right: 0,
    width: 180,
    backgroundColor: T.ink,
    padding: 12,
    borderRadius: 12,
    zIndex: 99,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  tooltipText: {
    fontFamily: 'Manrope-Medium',
    fontSize: 12,
    color: '#fff',
    lineHeight: 17,
  },
  tooltipArrow: {
    position: 'absolute',
    top: -4,
    right: 24,
    width: 10,
    height: 10,
    backgroundColor: T.ink,
    transform: [{ rotate: '45deg' }],
  },

  // Meal list
  mealList: {
    paddingHorizontal: 18,
    paddingTop: 4,
    gap: 12,
  },

  // Meal Card
  mealCard: {
    backgroundColor: T.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.hairSoft,
    padding: 16,
  },
  mealCardActive: {
    backgroundColor: T.forest,
    borderColor: 'transparent',
    borderWidth: 0,
    elevation: 8,
    shadowColor: 'rgba(45,74,43,0.25)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },

  mealRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  mealIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 100,
    backgroundColor: T.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealIconActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  mealNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  mealTime: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: T.inkMute,
    textTransform: 'uppercase',
  },
  mealTimeActive: {
    color: 'rgba(244,241,232,0.7)',
  },
  mealName: {
    fontFamily: 'InstrumentSerif',
    fontSize: 22,
    lineHeight: 24,
    color: T.ink,
    letterSpacing: -0.2,
  },
  checkDone: {
    width: 32,
    height: 32,
    borderRadius: 100,
    backgroundColor: T.ok,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkEmpty: {
    width: 32,
    height: 32,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: T.hair,
  },
  checkEmptyActive: {
    borderColor: 'rgba(244,241,232,0.4)',
  },

  mealCurrent: {
    fontFamily: 'Manrope-Medium',
    fontSize: 13.5,
    lineHeight: 20,
    color: T.ink,
    marginBottom: 12,
  },

  mealRow3: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mealChips: {
    flexDirection: 'row',
    gap: 6,
  },
  mealChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: T.surfaceAlt,
  },
  mealChipActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  mealChipText: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 11.5,
    color: T.inkSoft,
    letterSpacing: 0.2,
  },
  mealCalText: {
    fontFamily: 'JetBrainsMono',
    fontSize: 11,
    color: T.inkSoft,
    fontVariant: ['tabular-nums'],
  },
  mealCalUnit: {
    fontFamily: 'JetBrainsMono',
    fontSize: 11,
    color: T.inkSoft,
    opacity: 0.7,
  },
  mealCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mealCtaText: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 12.5,
    color: T.forest,
  },

  // Notes
  notesWrap: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 10,
  },
  notesCard: {
    borderWidth: 1,
    borderColor: T.hair,
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  notesTitle: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    color: T.inkSoft,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  notesText: {
    fontFamily: 'Manrope',
    fontSize: 13,
    color: T.inkSoft,
    lineHeight: 19,
  },
  // Empty State
  emptyState: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: T.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: T.hair,
    marginTop: 10,
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
  // Modal Popup
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: T.bg,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: T.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: 'InstrumentSerif',
    fontSize: 28,
    color: T.ink,
    marginBottom: 8,
  },
  modalText: {
    fontFamily: 'Manrope',
    fontSize: 15,
    color: T.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  modalBtnText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 15,
  },
});
