import React from 'react';
import { View, Text, StyleSheet, Pressable, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../../constants/tokens';
import { Ic } from '../../constants/icons';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ImageBackground 
      source={require('../../assets/images/onboarding_bg.png')} 
      style={styles.container}
      resizeMode="cover"
    >
      <View style={[styles.overlay, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
        
        {/* Header (Discrete Icon) */}
        <View style={styles.header}>
          <Pressable style={styles.closeBtn} onPress={() => router.back()}>
            <Ic name="x" size={18} color={T.inkMute} />
          </Pressable>
        </View>

        <View style={styles.content}>
          <View style={styles.titleBox}>
            <Text style={styles.title}>Novo Plano</Text>
            <Text style={styles.subtitle}>Como você prefere adicionar a sua dieta?</Text>
          </View>

          <View style={styles.btnGroup}>
            <Pressable 
              style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
              onPress={() => router.push('/import')}
            >
              <View style={[styles.iconBox, { backgroundColor: T.forest }]}>
                <Ic name="cam" size={24} color="#fff" />
              </View>
              <View style={styles.btnTextWrap}>
                <Text style={styles.btnTitle}>Importar via câmera</Text>
                <Text style={styles.btnDesc}>Escanear folha impressa (Dietbox)</Text>
              </View>
            </Pressable>

            <Pressable style={[styles.btn, styles.btnDisabled]}>
              <View style={[styles.iconBox, { backgroundColor: T.surfaceAlt }]}>
                <Ic name="file" size={24} color={T.inkMute} />
              </View>
              <View style={styles.btnTextWrap}>
                <Text style={[styles.btnTitle, { color: T.inkSoft }]}>Importar via arquivo</Text>
                <Text style={styles.btnDesc}>Em breve</Text>
              </View>
            </Pressable>

            <Pressable style={[styles.btn, styles.btnDisabled]}>
              <View style={[styles.iconBox, { backgroundColor: T.surfaceAlt }]}>
                <Ic name="edit" size={24} color={T.inkMute} />
              </View>
              <View style={styles.btnTextWrap}>
                <Text style={[styles.btnTitle, { color: T.inkSoft }]}>Digitar manualmente</Text>
                <Text style={styles.btnDesc}>Em breve</Text>
              </View>
            </Pressable>
          </View>
        </View>

      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F4', // Fallback color matching cream paper
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(250, 248, 244, 0.85)', // Semi-transparent to let background peek through
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 40,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  titleBox: {
    marginBottom: 40,
  },
  title: {
    fontFamily: 'InstrumentSerif',
    fontSize: 42,
    color: T.ink,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Manrope',
    fontSize: 16,
    color: T.inkSoft,
    lineHeight: 22,
  },
  btnGroup: {
    gap: 16,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.bg,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: T.hair,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  btnPressed: {
    backgroundColor: T.surface,
    transform: [{ scale: 0.98 }],
  },
  btnDisabled: {
    backgroundColor: 'transparent',
    borderColor: T.hairSoft,
    shadowOpacity: 0,
    elevation: 0,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  btnTextWrap: {
    flex: 1,
  },
  btnTitle: {
    fontFamily: 'Manrope-Bold',
    fontSize: 16,
    color: T.ink,
    marginBottom: 2,
  },
  btnDesc: {
    fontFamily: 'Manrope',
    fontSize: 13,
    color: T.inkMute,
  },
});
