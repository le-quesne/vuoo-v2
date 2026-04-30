import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthContext'
import VuooLogo from '@/components/VuooLogo'
import { colors, spacing, radius } from '@/theme'

/**
 * Demo auto-login screen.
 *
 * Triggered by deeplink: vuoo://demo  (or vuoo://demo?email=X&password=Y)
 *
 * Defaults to apple-review@vuoo.cl / apple2026 — the canonical Apple Review
 * credentials. Auto-signs in and navigates to the home tab. Designed so an
 * Apple reviewer can tap a TestFlight "What to Test" link and land logged in.
 */
const DEFAULT_EMAIL = 'apple-review@vuoo.cl'
const DEFAULT_PASSWORD = 'apple2026'

export default function DemoLoginScreen() {
  const { signIn } = useAuth()
  const params = useLocalSearchParams<{ email?: string; password?: string }>()
  const [error, setError] = useState<string | null>(null)
  const [trying, setTrying] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function attempt() {
      const email = (params.email ?? DEFAULT_EMAIL).trim()
      const password = (params.password ?? DEFAULT_PASSWORD).trim()
      const { error: signInError } = await signIn(email, password)
      if (cancelled) return
      if (signInError) {
        setError(signInError)
        setTrying(false)
        return
      }
      router.replace('/(app)/(tabs)')
    }

    void attempt()
    return () => {
      cancelled = true
    }
  }, [params.email, params.password, signIn])

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <VuooLogo size={72} color="#ffffff" />
        <Text style={styles.title}>Demo</Text>
        {trying && !error && (
          <>
            <ActivityIndicator color="#fff" style={{ marginTop: spacing.lg }} />
            <Text style={styles.subtitle}>Iniciando sesión demo…</Text>
          </>
        )}
        {error && (
          <>
            <Text style={[styles.subtitle, styles.errorText]}>{error}</Text>
            <Pressable
              style={styles.button}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Text style={styles.buttonText}>Volver al login manual</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy950 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: spacing.lg },
  subtitle: { color: '#cbd5e1', fontSize: 14, marginTop: spacing.md, textAlign: 'center' },
  errorText: { color: '#fecaca' },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
