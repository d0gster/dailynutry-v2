/**
 * DailyNutry — Models Screen
 *
 * Fetches and displays available Gemini models from the gateway.
 * Accessed from Settings > "Testar disponibilidade".
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../constants/tokens';
import { Ic } from '../constants/icons';
import { fetchModels, GatewayModel } from '../constants/gateway-client';
import { useSettingsStore } from '../stores/settings-store';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; defaultModel: string; models: GatewayModel[] };

export default function ModelsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setCachedModels } = useSettingsStore();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchModels();
        if (!cancelled) {
          // Persist to store so Settings dropdown can use them without re-fetching
          setCachedModels(data.models, data.defaultModel);
          setState({
            status: 'ok',
            defaultModel: data.defaultModel,
            models: data.models,
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          setState({ status: 'error', message: err.message || 'Erro desconhecido' });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [setCachedModels]);

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ic name="chevL" size={18} color={T.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Modelos Disponíveis</Text>
        <View style={{ width: 40 }} />
      </View>

      {state.status === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={T.forest} />
          <Text style={styles.loadingText}>Testando modelos na sua API key...</Text>
          <Text style={[styles.loadingText, { fontSize: 12, marginTop: 4 }]}>
            Cada modelo é testado com uma chamada real.{'\n'}Isso pode levar alguns segundos.
          </Text>
        </View>
      )}

      {state.status === 'error' && (
        <View style={styles.center}>
          <View style={styles.errorBadge}>
            <Ic name="x" size={20} color={T.danger} />
          </View>
          <Text style={styles.errorTitle}>Falha na consulta</Text>
          <Text style={styles.errorMsg}>{state.message}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              setState({ status: 'loading' });
              fetchModels()
                .then((data) => {
                  setCachedModels(data.models, data.defaultModel);
                  setState({ status: 'ok', defaultModel: data.defaultModel, models: data.models });
                })
                .catch((err) =>
                  setState({ status: 'error', message: err.message }),
                );
            }}
          >
            <Text style={styles.retryText}>Tentar novamente</Text>
          </Pressable>
        </View>
      )}

      {state.status === 'ok' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>
            {state.models.length} modelo{state.models.length !== 1 ? 's' : ''} com suporte a visão
          </Text>
          <Text style={styles.envHint}>
            Padrão do .env: <Text style={styles.envModel}>{state.defaultModel}</Text>
          </Text>

          {state.models.map((m) => {
            const isDefault = m.id === state.defaultModel;
            return (
              <View
                key={m.id}
                style={[styles.card, isDefault && styles.cardDefault]}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.modelId}>{m.id}</Text>
                  {isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>PADRÃO</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.modelName}>{m.displayName}</Text>
                {m.description ? (
                  <Text style={styles.modelDesc} numberOfLines={2}>
                    {m.description}
                  </Text>
                ) : null}
                <View style={styles.limits}>
                  <View style={styles.limitChip}>
                    <Ic name="upload" size={12} color={T.inkSoft} />
                    <Text style={styles.limitText}>
                      {formatTokens(m.inputTokenLimit)} entrada
                    </Text>
                  </View>
                  <View style={styles.limitChip}>
                    <Ic name="edit" size={12} color={T.inkSoft} />
                    <Text style={styles.limitText}>
                      {formatTokens(m.outputTokenLimit)} saída
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
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
    fontSize: 22,
    color: T.ink,
  },
  // ── Loading / Error ──
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontFamily: T.sans,
    fontSize: 14,
    color: T.inkSoft,
    marginTop: 16,
  },
  errorBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: T.danger + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  errorTitle: {
    fontFamily: T.sansBold,
    fontSize: 16,
    color: T.ink,
    marginBottom: 6,
  },
  errorMsg: {
    fontFamily: T.sans,
    fontSize: 13,
    color: T.inkSoft,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: T.radius.md,
    backgroundColor: T.forest,
  },
  retryText: {
    fontFamily: T.sansBold,
    fontSize: 14,
    color: T.forestInk,
  },
  // ── List ──
  content: {
    paddingHorizontal: 22,
  },
  subtitle: {
    fontFamily: T.sansBold,
    fontSize: 14,
    color: T.ink,
    marginBottom: 4,
  },
  envHint: {
    fontFamily: T.sans,
    fontSize: 12,
    color: T.inkSoft,
    marginBottom: 16,
  },
  envModel: {
    fontFamily: T.mono,
    color: T.forest,
  },
  // ── Card ──
  card: {
    backgroundColor: T.surface,
    borderRadius: T.radius.xl,
    borderWidth: 1,
    borderColor: T.hairSoft,
    padding: 16,
    marginBottom: 12,
  },
  cardDefault: {
    borderColor: T.forest + '50',
    backgroundColor: T.cream + '60',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modelId: {
    fontFamily: T.mono,
    fontSize: 13,
    color: T.ink,
    flex: 1,
  },
  defaultBadge: {
    backgroundColor: T.forest,
    borderRadius: T.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    fontFamily: T.sansBold,
    fontSize: 10,
    color: T.forestInk,
    letterSpacing: 0.5,
  },
  modelName: {
    fontFamily: T.sansBold,
    fontSize: 15,
    color: T.ink,
    marginBottom: 4,
  },
  modelDesc: {
    fontFamily: T.sans,
    fontSize: 12,
    color: T.inkSoft,
    lineHeight: 16,
    marginBottom: 8,
  },
  limits: {
    flexDirection: 'row',
    gap: 10,
  },
  limitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.surfaceAlt,
    borderRadius: T.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  limitText: {
    fontFamily: T.sans,
    fontSize: 11,
    color: T.inkSoft,
  },
});
