import { useEffect } from 'react'
import { View, ActivityIndicator, Text, Pressable } from 'react-native'
import { Stack, router } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { colors } from '@/theme'

export default function AppLayout() {
  const { user, driver, driverError, loading, refreshDriver, signOut } = useAuth()

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

  // Usuario autenticado pero sin driver cargado: puede ser un error de red al
  // cargar el perfil, o una cuenta sin conductor asignado. NUNCA mostramos un
  // spinner infinito (Apple 2.1(a)): ofrecemos reintentar o cerrar sesión.
  if (!driver) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          gap: 16,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>
          {driverError ? 'No pudimos cargar tu perfil' : 'Sin conductor asignado'}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21 }}>
          {driverError
            ? 'Revisa tu conexión a internet e inténtalo de nuevo.'
            : 'Tu cuenta aún no tiene un conductor asignado. Contacta a tu empresa.'}
        </Text>
        <Pressable
          onPress={() => refreshDriver()}
          style={{
            backgroundColor: colors.primary,
            paddingVertical: 12,
            paddingHorizontal: 28,
            borderRadius: 10,
            marginTop: 4,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Reintentar</Text>
        </Pressable>
        <Pressable onPress={() => signOut()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>Cerrar sesión</Text>
        </Pressable>
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
