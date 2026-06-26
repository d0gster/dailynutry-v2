import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../../constants/tokens';
import { Ic } from '../../constants/icons';
import { Button } from '../../components/ui';
import { useDietStore } from '../../stores/diet-store';
import { parseDietboxImages } from '../../constants/dietbox-parser';
import { parseViaGateway } from '../../constants/gateway-client';

export default function ImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { geminiApiKey, gatewayUrl, gatewayApiKey, setPendingPlan } = useDietStore();
  const useGateway = Boolean(gatewayUrl && gatewayApiKey);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [progressText, setProgressText] = useState('');

  const pickImage = async (useCamera: boolean) => {
    try {
      setPicking(true);
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: 'images',
        base64: false,
        quality: 0.3,
      };

      let result;
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permissão', 'Precisamos de acesso à câmera para escanear a dieta.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true });
      }

      if (!result.canceled) {
        const newImages = result.assets.map(a => a.uri);
        setImages(prev => [...prev, ...newImages]);
      }
    } finally {
      setPicking(false);
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleProcess = async () => {
    // Prefer the AI gateway; fall back to the legacy direct-Gemini path so the
    // app keeps working even without a gateway configured.
    if (!useGateway && !geminiApiKey) {
      Alert.alert(
        'Configuração ausente',
        'Configure o Gateway de IA ou a chave do Gemini nas configurações antes de importar.',
        [{ text: 'Configurar', onPress: () => router.push('/settings') }, { text: 'Cancelar', style: 'cancel' }]
      );
      return;
    }

    if (images.length === 0) {
      Alert.alert('Aviso', 'Adicione pelo menos uma foto da sua dieta.');
      return;
    }

    setLoading(true);
    setProgressText('Lendo imagens da galeria...');
    try {
      const base64Images = await Promise.all(
        images.map(async (uri) => {
          const b64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64',
          });
          return `data:image/jpeg;base64,${b64}`;
        })
      );

      const plan = useGateway
        ? await parseViaGateway(base64Images, gatewayUrl!, gatewayApiKey!, setProgressText)
        : await parseDietboxImages(base64Images, geminiApiKey!, setProgressText);
      setPendingPlan(plan);
      router.push('/import/confirm');
    } catch (err: any) {
      Alert.alert('Erro ao processar', err.message || 'Ocorreu um erro desconhecido.');
    } finally {
      setLoading(false);
      setProgressText('');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} disabled={loading}>
          <Ic name="chevL" size={18} color={T.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Importar Plano</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={styles.desc}>
          Tire fotos das folhas impressas pelo Dietbox. Tente pegar a página inteira, com boa iluminação.
        </Text>

        {/* Photos Grid */}
        <View style={styles.grid}>
          {images.map((img, i) => (
            <View key={i} style={styles.imgWrap}>
              <Image source={{ uri: img }} style={styles.img} />
              <Pressable style={styles.removeBtn} onPress={() => removeImage(i)}>
                <Ic name="x" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
          
          {images.length < 5 && (
            <Pressable style={styles.addBtn} onPress={() => pickImage(true)}>
              <Ic name="cam" size={24} color={T.inkMute} />
              <Text style={styles.addText}>Tirar Foto</Text>
            </Pressable>
          )}
        </View>

        {images.length < 5 && (
          <Pressable style={styles.galleryBtn} onPress={() => pickImage(false)}>
            <Text style={styles.galleryText}>ou escolher da galeria</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button 
          variant="primary" 
          size="md" 
          full 
          onPress={handleProcess}
          disabled={images.length === 0 || loading || picking}
          icon={loading ? <ActivityIndicator size="small" color="#fff" /> : <Ic name="sparkles" size={16} color="#f4f1e8" />}
        >
          {loading ? 'Processando...' : 'Processar Dieta'}
        </Button>
      </View>

      {/* Loading Overlays */}
      {(loading || picking) && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={T.forest} />
            <Text style={styles.loadingText}>
              {picking ? 'Carregando imagens...' : progressText || 'Analisando o plano...'}
            </Text>
            {loading && (
              <Text style={styles.loadingSubText}>
                Isso pode levar alguns segundos dependendo do tamanho da dieta. A IA está lendo todas as linhas e criando a estrutura de dados.
              </Text>
            )}
          </View>
        </View>
      )}
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
  desc: {
    fontFamily: 'Manrope',
    fontSize: 14,
    color: T.inkSoft,
    lineHeight: 20,
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  imgWrap: {
    width: '48%',
    aspectRatio: 3/4,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: T.hair,
  },
  img: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: '48%',
    aspectRatio: 3/4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.hair,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surfaceAlt,
    gap: 8,
  },
  addText: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 12,
    color: T.inkMute,
  },
  galleryBtn: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  galleryText: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 13,
    color: T.inkSoft,
    textDecorationLine: 'underline',
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.hairSoft,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 999,
  },
  loadingBox: {
    backgroundColor: T.surface,
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    width: '100%',
  },
  loadingText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 16,
    color: T.ink,
    marginTop: 16,
    textAlign: 'center',
  },
  loadingSubText: {
    fontFamily: 'Manrope',
    fontSize: 13,
    color: T.inkSoft,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
});
