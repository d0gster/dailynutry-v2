import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../../constants/tokens';
import { Ic } from '../../constants/icons';
import { Button, Card, Chip } from '../../components/ui';
import { useDietStore } from '../../stores/diet-store';
import { DietPlan } from '../../constants/foods';

export default function ConfirmPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pendingPlan, setPlan, setPendingPlan } = useDietStore();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const toggleExpand = (index: number) => {
    setExpanded(prev => ({ ...prev, [index]: !prev[index] }));
  };

  if (!pendingPlan) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.desc}>Nenhum plano para confirmar.</Text>
        <Button variant="secondary" onPress={() => router.back()}>Voltar</Button>
      </View>
    );
  }

  const handleSave = () => {
    // Generate IDs and missing data for a complete DietPlan if necessary
    const finalPlan: DietPlan = {
      id: `plan-${Date.now()}`,
      patientName: pendingPlan.patientName || 'Paciente',
      nutritionistName: pendingPlan.nutritionistName || 'Nutricionista',
      crn: pendingPlan.crn || '',
      planDate: pendingPlan.planDate || new Date().toLocaleDateString('pt-BR'),
      notes: pendingPlan.notes || [],
      meals: (pendingPlan.meals || []).map((m, i) => ({
        ...m,
        id: m.id || `meal-${i}`,
        time: m.time || '00:00',
        name: m.name || `Refeição ${i+1}`,
        icon: m.icon || 'plate',
        groups: m.groups || [],
      })),
    };

    setPlan(finalPlan);
    setPendingPlan(null);
    Alert.alert('Sucesso!', 'Plano importado com sucesso.');
    router.replace('/');
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ic name="chevL" size={18} color={T.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Revisar Plano</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        
        <Card style={styles.infoCard}>
          <Text style={styles.patientName}>{pendingPlan.patientName}</Text>
          <Text style={styles.nutriName}>Nutri: {pendingPlan.nutritionistName}</Text>
          {pendingPlan.planDate && <Text style={styles.dateText}>Data: {pendingPlan.planDate}</Text>}
        </Card>

        <Text style={styles.sectionTitle}>Refeições Encontradas ({pendingPlan.meals?.length || 0})</Text>

        {pendingPlan.meals?.map((meal, i) => (
          <View key={i} style={styles.mealContainer}>
            <Pressable 
              style={styles.mealRow} 
              onPress={() => toggleExpand(i)}
            >
              <View style={styles.mealTimeBox}>
                <Text style={styles.mealTime}>{meal.time}</Text>
              </View>
              <View style={styles.mealInfo}>
                <Text style={styles.mealName}>{meal.name}</Text>
                <Text style={styles.mealGroupsCount}>
                  {meal.groups?.reduce((acc, g) => acc + g.items.length, 0)} itens em {meal.groups?.length} grupos
                </Text>
              </View>
              <Ic name={expanded[i] ? 'chevU' : 'chevD'} size={20} color={T.inkMute} />
            </Pressable>
            
            {expanded[i] && (
              <View style={styles.expandedContent}>
                {meal.notes && (
                  <View style={styles.mealNotesBox}>
                    <Ic name="alert" size={14} color="#6e521c" />
                    <Text style={styles.mealNotes}>{meal.notes}</Text>
                  </View>
                )}
                {meal.groups?.map((group, gi) => (
                  <View key={gi} style={styles.groupBox}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    {group.items.map((item, ii) => (
                      <View key={ii} style={styles.itemRow}>
                        <View style={styles.itemDot} />
                        <Text style={styles.itemText}>
                          {item.rawQty > 0 ? `${item.rawQty}${item.unit} ` : ''}
                          <Text style={styles.itemName}>{item.name}</Text>
                          {item.householdMeasure ? ` (${item.householdMeasure})` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {pendingPlan.notes && pendingPlan.notes.length > 0 && (
          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>Observações Gerais</Text>
            {pendingPlan.notes.map((note, i) => (
              <Text key={i} style={styles.noteItem}>• {note}</Text>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button 
          variant="primary" 
          size="md" 
          full 
          onPress={handleSave}
          icon={<Ic name="check" size={18} color="#f4f1e8" />}
        >
          Salvar Plano Alimentar
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 20,
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
  headerTitle: {
    fontFamily: 'InstrumentSerif',
    fontSize: 24,
    color: T.ink,
  },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 40,
  },
  desc: {
    fontFamily: 'Manrope',
    fontSize: 14,
    color: T.inkSoft,
  },
  infoCard: {
    marginBottom: 24,
  },
  patientName: {
    fontFamily: 'Manrope-Bold',
    fontSize: 18,
    color: T.ink,
    marginBottom: 4,
  },
  nutriName: {
    fontFamily: 'Manrope',
    fontSize: 14,
    color: T.inkSoft,
  },
  dateText: {
    fontFamily: 'Manrope',
    fontSize: 12,
    color: T.inkMute,
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: 'Manrope-Bold',
    fontSize: 14,
    color: T.inkMute,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  mealContainer: {
    borderBottomWidth: 1,
    borderBottomColor: T.hairSoft,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  mealTimeBox: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: T.surfaceAlt,
    borderWidth: 1,
    borderColor: T.hair,
  },
  mealTime: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 13,
    color: T.ink,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 15,
    color: T.ink,
  },
  mealGroupsCount: {
    fontFamily: 'Manrope',
    fontSize: 12,
    color: T.inkSoft,
    marginTop: 2,
  },
  expandedContent: {
    paddingLeft: 64, // Aligned with the text
    paddingRight: 16,
    paddingBottom: 16,
  },
  mealNotesBox: {
    flexDirection: 'row',
    backgroundColor: T.cream,
    padding: 10,
    borderRadius: 8,
    gap: 8,
    marginBottom: 12,
  },
  mealNotes: {
    flex: 1,
    fontFamily: 'Manrope',
    fontSize: 12,
    color: '#8a6e38',
    lineHeight: 16,
  },
  groupBox: {
    marginBottom: 12,
  },
  groupName: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    color: T.inkMute,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingRight: 12,
  },
  itemDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.forest,
    marginTop: 8,
    marginRight: 8,
  },
  itemText: {
    flex: 1,
    fontFamily: 'Manrope',
    fontSize: 13,
    color: T.inkSoft,
    lineHeight: 20,
  },
  itemName: {
    fontFamily: 'Manrope-SemiBold',
    color: T.ink,
  },
  notesBox: {
    marginTop: 24,
    backgroundColor: T.cream,
    padding: 16,
    borderRadius: 12,
  },
  notesTitle: {
    fontFamily: 'Manrope-Bold',
    fontSize: 13,
    color: '#6e521c',
    marginBottom: 8,
  },
  noteItem: {
    fontFamily: 'Manrope',
    fontSize: 13,
    color: '#8a6e38',
    marginBottom: 4,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.hairSoft,
  },
});
