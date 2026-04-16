import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { colors } from '@/theme'

export default function Index() {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (user) {
      router.replace('/(app)/(tabs)')
    } else {
      router.replace('/(auth)/login')
    }
  }, [user, loading])

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  )
}
