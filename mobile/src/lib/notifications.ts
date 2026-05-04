import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

/**
 * Configura el handler global de notificaciones para que las muestre en
 * foreground. Debe llamarse una sola vez al inicio del app.
 */
export function setupNotificationHandler(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    })
  } catch (err) {
    console.warn('[notifications] setupNotificationHandler failed', err)
  }
}

/**
 * Registra el dispositivo para push notifications via Expo y guarda el token
 * en `device_tokens` para el `userId` indicado.
 *
 * Retorna el token Expo si todo sale bien, o `null` si falla / no aplica
 * (por ejemplo en simuladores).
 */
export async function registerForPushNotifications(
  userId: string,
): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.log('[notifications] Skipping push registration on simulator')
      return null
    }

    // 1. Permisos — SDK 55 expone el resultado con `granted: boolean`. El campo
    // `status` ya no es accesible en el tipo de TS porque el extends a
    // PermissionResponse no resuelve sin tener expo-modules-core como dep
    // explicita (Expo recomienda no instalarlo directo). El boolean nos basta.
    const existing = await Notifications.getPermissionsAsync()
    let granted = existing.granted
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync()
      granted = requested.granted
    }
    if (!granted) {
      console.log('[notifications] Push permission not granted')
      return null
    }

    // 2. Android channel
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6366f1',
        })
      } catch (channelErr) {
        console.warn(
          '[notifications] Failed to create Android channel',
          channelErr,
        )
      }
    }

    // 3. Token Expo
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
        ?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig
        ?.projectId
    let tokenResponse
    try {
      tokenResponse = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync()
    } catch (tokenErr) {
      console.warn('[notifications] getExpoPushTokenAsync failed', tokenErr)
      return null
    }

    const token = tokenResponse?.data
    if (!token) {
      console.log('[notifications] No token returned')
      return null
    }

    // 4. Persistir en Supabase
    const { error } = await supabase
      .from('device_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
        },
        { onConflict: 'user_id,token' },
      )

    if (error) {
      console.warn('[notifications] Failed to upsert device_token', error)
      return null
    }

    return token
  } catch (err) {
    console.warn('[notifications] registerForPushNotifications failed', err)
    return null
  }
}
