import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../constants/tokens';
import { Ic } from '../constants/icons';
import { useDietStore } from '../stores/diet-store';
import { useSettingsStore } from '../stores/settings-store';

// ─── Model Picker Modal ────────────────────────────────────────────────────

interface PickerProps {
  visible: boolean;
  onClose: () => void;
}

function ModelPickerModal({ visible, onClose }: PickerProps) {
  const insets = useSafeAreaInsets();
  const { cachedModels, cachedDefaultModel, modelOverride, setModelOverride } =
    useSettingsStore();

  const options: { label: string; value: string | null; sub?: string }[] = [
    {
      label: 'Automático',
      value: null,
      sub: `Usa o padrão do servidor (${cachedDefaultModel})`,
    },
    ...cachedModels.map((m) => ({
      label: m.displayName,
      value: m.id,
      sub: m.id,
    })),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pk.overlay} onPress={onClose}>
        <Pressable
          style={[pk.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={pk.handle} />
          <Text style={pk.title}>Modelo de IA</Text>

          {cachedModels.length === 0 ? (
            <View style={pk.emptyWrap}>
              <Text style={pk.emptyText}>
                Nenhum modelo carregado.{'\n'}Use o botão &quot;Testar&quot; primeiro
                para descobrir os modelos disponíveis na sua API key.
              </Text>
            </View>
          ) : (
            <FlatList
              data={options}
              keyExtractor={(item) => item.value ?? '__auto__'}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => {
                const isActive = item.value === modelOverride;
                return (
                  <Pressable
                    style={[pk.option, isActive && pk.optionActive]}
                    onPress={() => {
                      setModelOverride(item.value);
                      onClose();
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[pk.optionLabel, isActive && pk.optionLabelActive]}>
                        {item.label}
                      </Text>
                      {item.sub ? (
                        <Text style={pk.optionSub} numberOfLines={1}>
                          {item.sub}
                        </Text>
                      ) : null}
                    </View>
                    {isActive && <Ic name="check" size={18} color={T.forest} />}
                  </Pressable>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const pk = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.hair,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: T.sansBold,
    fontSize: 17,
    color: T.ink,
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: T.radius.md,
    marginBottom: 2,
  },
  optionActive: {
    backgroundColor: T.forest + '12',
  },
  optionLabel: {
    fontFamily: T.sans,
    fontSize: 15,
    color: T.ink,
  },
  optionLabelActive: {
    fontFamily: T.sansBold,
    color: T.forest,
  },
  optionSub: {
    fontFamily: T.sans,
    fontSize: 11,
    color: T.inkMute,
    marginTop: 2,
  },
  emptyWrap: {
    paddingVertical: 24,
    paddingHorizontal: 8,
  },
  emptyText: {
    fontFamily: T.sans,
    fontSize: 13,
    color: T.inkSoft,
    textAlign: 'center',
    lineHeight: 19,
  },
});

// ─── Settings Screen ───────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clearAllData } = useDietStore();
  const { modelOverride, cachedModels, lastTestedAt } = useSettingsStore();

  const [pickerVisible, setPickerVisible] = useState(false);

  // Resolve the display label for the currently selected model
  const displayLabel = modelOverride
    ? cachedModels.find((m) => m.id === modelOverride)?.displayName ?? modelOverride
    : 'Automático';

  const hasModels = cachedModels.length > 0;

  // Format the last tested timestamp
  const testedLabel = lastTestedAt
    ? `Testado em ${new Date(lastTestedAt).toLocaleDateString('pt-BR')} às ${new Date(lastTestedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : 'Nunca testado';

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ic name="chevL" size={18} color={T.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Configurações</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* ── Conexão Section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conexão</Text>
          <Text style={styles.sectionDesc}>
            O app detecta automaticamente o gateway de IA na mesma rede local.
            As chaves dos provedores (Gemini, OpenAI, Anthropic) ficam seguras no servidor.
          </Text>

          {/* Model selector */}
          <View style={styles.modelRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Modelo Gemini</Text>
              <Pressable
                style={[styles.dropdown, !hasModels && styles.dropdownDisabled]}
                onPress={() => {
                  if (hasModels) {
                    setPickerVisible(true);
                  } else {
                    Alert.alert(
                      'Modelos não carregados',
                      'Clique em "Testar" primeiro para descobrir quais modelos estão disponíveis na sua API key.',
                    );
                  }
                }}
              >
                <Text
                  style={[styles.dropdownText, !hasModels && styles.dropdownTextDisabled]}
                  numberOfLines={1}
                >
                  {displayLabel}
                </Text>
                <Ic name="chevDown" size={14} color={hasModels ? T.inkSoft : T.inkMute} />
              </Pressable>
            </View>

            <Pressable
              style={styles.testBtn}
              onPress={() => router.push('/models')}
            >
              <Ic name="search" size={15} color={T.forestInk} />
              <Text style={styles.testBtnText}>Testar</Text>
            </Pressable>
          </View>

          <Text style={styles.testedHint}>
            {testedLabel}
            {hasModels ? ` · ${cachedModels.length} modelo${cachedModels.length !== 1 ? 's' : ''}` : ''}
          </Text>
        </View>

        {/* ── Dados Section ── */}
        <View style={[styles.section, { borderColor: T.danger + '30' }]}>
          <Text style={styles.sectionTitle}>Dados</Text>
          <Text style={styles.sectionDesc}>
            Apaga todo o cache do aplicativo: plano alimentar, progresso e preferências.
            O app volta ao estado inicial.
          </Text>
          <Pressable
            style={styles.dangerBtn}
            onPress={() => {
              Alert.alert(
                'Apagar todos os dados?',
                'Isso vai remover o plano, progresso e preferências. Essa ação não pode ser desfeita.',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Apagar',
                    style: 'destructive',
                    onPress: () => {
                      clearAllData();
                      router.replace('/');
                    },
                  },
                ],
              );
            }}
          >
            <Ic name="x" size={16} color={T.danger} />
            <Text style={styles.dangerBtnText}>Apagar dados</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Model picker modal */}
      <ModelPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
      />
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
  },
  section: {
    backgroundColor: T.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.hairSoft,
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: 'Manrope-Bold',
    fontSize: 15,
    color: T.ink,
    marginBottom: 6,
  },
  sectionDesc: {
    fontFamily: 'Manrope',
    fontSize: 13,
    color: T.inkSoft,
    lineHeight: 18,
  },
  // ── Model selector ──
  modelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  fieldLabel: {
    fontFamily: T.sansBold,
    fontSize: 12,
    color: T.inkSoft,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.bg,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.hair,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
  },
  dropdownDisabled: {
    borderColor: T.hairSoft,
    backgroundColor: T.surfaceAlt + '80',
  },
  dropdownText: {
    fontFamily: T.sans,
    fontSize: 14,
    color: T.ink,
    flex: 1,
    marginRight: 8,
  },
  dropdownTextDisabled: {
    color: T.inkMute,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: T.forest,
    borderRadius: T.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
  },
  testBtnText: {
    fontFamily: T.sansBold,
    fontSize: 13,
    color: T.forestInk,
  },
  testedHint: {
    fontFamily: T.sans,
    fontSize: 11,
    color: T.inkMute,
    marginTop: 8,
  },
  // ── Danger ──
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.danger + '12',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  dangerBtnText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 14,
    color: T.danger,
  },
});
