import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { T } from '../constants/tokens';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Esta tela não existe.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Voltar para o início</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: T.bg,
  },
  title: {
    fontFamily: 'Manrope-Bold',
    fontSize: 18,
    color: T.ink,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 14,
    color: T.forest,
  },
});
