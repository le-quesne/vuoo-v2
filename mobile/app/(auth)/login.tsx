import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthContext'
import VuooLogo from '@/components/VuooLogo'
import { colors, spacing, radius, shadow } from '@/theme'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignIn() {
    if (!email || !password) {
      setError('Ingresa email y contrasena')
      return
    }
    setError(null)
    setLoading(true)
    const { error: signInError } = await signIn(email.trim(), password)
    setLoading(false)
    if (signInError) {
      setError(signInError)
      return
    }
    router.replace('/(app)/(tabs)')
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <VuooLogo size={72} color="#ffffff" />
            <Text style={styles.heroSub}>App del conductor</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Iniciar sesion</Text>
            <Text style={styles.cardSub}>
              Ingresa tus credenciales para ver tus rutas de hoy.
            </Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="conductor@ejemplo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              style={styles.input}
              placeholderTextColor={colors.textLight}
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>Contrasena</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              editable={!loading}
              style={styles.input}
              placeholderTextColor={colors.textLight}
            />

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={handleSignIn}
              disabled={loading}
              style={({ pressed }) => [
                styles.button,
                loading && styles.buttonDisabled,
                pressed && !loading && styles.buttonPressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Iniciar sesion</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.footer}>
            Si aun no tienes credenciales, contacta a tu dispatcher.
          </Text>

          <Pressable
            onPress={() => router.push('/(auth)/demo')}
            style={({ pressed }) => [styles.demoLink, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.demoLinkText}>Probar con cuenta demo</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy950 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  heroSub: {
    fontSize: 14,
    color: '#cbd5e1', // slate-300
    marginTop: spacing.xs,
    letterSpacing: 0.2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.elevated,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  cardSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '500' },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonPressed: { backgroundColor: colors.primaryDark },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  footer: {
    marginTop: spacing.xl,
    textAlign: 'center',
    color: '#cbd5e1', // slate-300
    fontSize: 12,
    paddingHorizontal: spacing.lg,
  },
  demoLink: {
    marginTop: spacing.md,
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  demoLinkText: {
    color: '#94a3b8',
    fontSize: 12,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
})
