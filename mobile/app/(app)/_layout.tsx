import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Stack, router } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { colors } from '@/theme'

export default function AppLayout() {
  const { user, driver, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/(auth)/login')
    }
  }, [user, loading])

  if (loading || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  if (!driver) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy950 },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="route/[id]/index"
        options={{ title: 'Ruta', headerBackTitle: 'Volver' }}
      />
      <Stack.Screen
        name="route/[id]/done"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="stop/[id]"
        options={{ title: 'Parada', headerBackTitle: 'Volver' }}
      />
      <Stack.Screen
        name="profile/edit"
        options={{ title: 'Editar perfil', headerBackTitle: 'Volver' }}
      />
    </Stack>
  )
}
