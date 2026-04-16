import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '@/contexts/AuthContext'
import { initOfflineDb, startOfflineSync } from '@/lib/offline'
import { setupNotificationHandler } from '@/lib/notifications'
import { initLocationTask } from '@/lib/location'

// Register the background location task once at module load. This must run
// before the OS may wake the app in the background to deliver location
// updates, so we keep it as a top-level side-effect rather than in an effect.
initLocationTask()

export default function RootLayout() {
  useEffect(() => {
    setupNotificationHandler()
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
