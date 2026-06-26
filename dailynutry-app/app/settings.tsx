import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../constants/tokens';
import { Ic } from '../constants/icons';
import { Button } from '../components/ui';
import { useDietStore } from '../stores/diet-store';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { geminiApiKey, setGeminiApiKey, gatewayUrl, gatewayApiKey, setGatewayConfig } = useDietStore();

  const [key, setKey] = useState(geminiApiKey || '');
  const [gwUrl, setGwUrl] = useState(gatewayUrl || '');
  const [gwKey, setGwKey] = useState(gatewayApiKey || '');

  const handleSave = () => {
    setGeminiApiKey(key.trim());
    setGatewayConfig(gwUrl, gwKey);
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ic name="chevL" size={18} color={T.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Configurações</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gateway de IA (recomendado)</Text>
          <Text style={styles.sectionDesc}>
            Aponte para o gateway DailyNutry. Ele esconde as chaves de IA, faz fallback entre
            provedores, valida a resposta e controla custo. Se configurado, é usado no lugar do
            Gemini direto.
          </Text>

          <TextInput
            style={styles.input}
            value={gwUrl}
            onChangeText={setGwUrl}
            placeholder="http://192.168.0.10:4000"
            placeholderTextColor={T.inkMute}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={gwKey}
            onChangeText={setGwKey}
            placeholder="x-api-key do gateway"
            placeholderTextColor={T.inkMute}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gemini direto (legado / fallback)</Text>
          <Text style={styles.sectionDesc}>
            Para importar planos do Dietbox via foto, o app utiliza a API Gemini Vision do Google. 
            Cole sua API Key abaixo. Ela fica salva apenas localmente no seu celular.
          </Text>
          
          <TextInput
            style={styles.input}
            value={key}
            onChangeText={setKey}
            placeholder="AIzaSy..."
            placeholderTextColor={T.inkMute}
            autoCapitalize="none"
            autoCorrect={false}
          />
          
          <Button 
            variant="primary" 
            size="md" 
            onPress={handleSave}
            style={{ marginTop: 12 }}
          >
            Salvar
          </Button>
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
    marginBottom: 16,
  },
  input: {
    backgroundColor: T.bg,
    borderWidth: 1,
    borderColor: T.hair,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'JetBrainsMono',
    fontSize: 13,
    color: T.ink,
  },
});
