import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import { AuthProvider } from '@/contexts/AuthContext'
import { initOfflineDb, startOfflineSync } from '@/lib/offline'
import { setupNotificationHandler } from '@/lib/notifications'
// Side-effect import: registra el background location task a top-level del
// módulo. Necesario para que iOS encuentre el callback cuando reactiva la app
// en background sin montar React.
import '@/lib/location'

function routeForNotificationData(
  data: Record<string, unknown> | null | undefined,
): string | null {
  if (!data) return null
  const type = typeof data.type === 'string' ? data.type : null
  const routeId = typeof data.routeId === 'string' ? data.routeId : null
  const stopId = typeof data.stopId === 'string' ? data.stopId : null
  if (type === 'route_assigned' && routeId) return `/(app)/route/${routeId}`
  if (type === 'stop_updated' && stopId) return `/(app)/stop/${stopId}`
  if (routeId) return `/(app)/route/${routeId}`
  return null
}

export default function RootLayout() {
  useEffect(() => {
    setupNotificationHandler()
  }, [])

  // Deep link when the user taps a push. Handles both warm-start
  // (addNotificationResponseReceivedListener) and cold-start
  // (getLastNotificationResponseAsync) cases.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined
        const target = routeForNotificationData(data)
        if (target) router.push(target as never)
      },
    )

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined
        const target = routeForNotificationData(data)
        if (target) router.push(target as never)
      })
      .catch(() => {})

    return () => sub.remove()
  }, [])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    ;(async () => {
      try {
        await initOfflineDb()
        unsubscribe = startOfflineSync()
      } catch (err) {
        console.warn('[RootLayout] offline init failed:', err)
      }
    })()
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
