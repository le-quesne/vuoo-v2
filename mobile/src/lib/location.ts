import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { supabase } from './supabase'

export const LOCATION_TASK_NAME = 'vuoo-gps-tracking'

const ACTIVE_ROUTE_KEY = 'vuoo_active_route_id'
const ACTIVE_DRIVER_KEY = 'vuoo_active_driver_id'

// Expo Go ("storeClient") no permite background location ni TaskManager.
// En ese caso caemos a foreground tracking con watchPositionAsync — funciona
// mientras el usuario mantenga la app abierta.
const isExpoGo = Constants.executionEnvironment === 'storeClient'

interface LocationTaskData {
  locations?: Location.LocationObject[]
}

interface DriverLocationRow {
  driver_id: string
  route_id: string | null
  lat: number
  lng: number
  accuracy: number | null
  speed: number | null
  heading: number | null
  battery: number | null
  recorded_at: string
}

function toRow(
  loc: Location.LocationObject,
  driverId: string,
  routeId: string | null,
): DriverLocationRow {
  return {
    driver_id: driverId,
    route_id: routeId,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? null,
    speed: loc.coords.speed ?? null,
    heading: loc.coords.heading ?? null,
    battery: null,
    recorded_at: new Date(loc.timestamp).toISOString(),
  }
}

async function insertLocationRows(rows: DriverLocationRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase.from('driver_locations').insert(rows)
  if (error) {
    console.warn('[location] insert error:', error.message)
  }
}

// IMPORTANTE: defineTask DEBE ejecutarse en top-level del módulo, NO dentro de
// un useEffect. Cuando iOS reactiva la app en background para entregar location
// updates, ejecuta el bundle JS sin montar React — si el registro está dentro
// de un componente, el task no existe y iOS desactiva el tracking en silencio.
// Ref: https://docs.expo.dev/versions/latest/sdk/task-manager/
if (!isExpoGo) {
  try {
    TaskManager.defineTask<LocationTaskData>(
      LOCATION_TASK_NAME,
      async ({ data, error }) => {
        if (error) {
          console.warn('[location task] error:', error.message)
          return
        }
        const locations = data?.locations
        if (!locations || locations.length === 0) return

        try {
          const [routeId, driverId] = await Promise.all([
            AsyncStorage.getItem(ACTIVE_ROUTE_KEY),
            AsyncStorage.getItem(ACTIVE_DRIVER_KEY),
          ])
          if (!driverId) return
          await insertLocationRows(locations.map((l) => toRow(l, driverId, routeId)))
        } catch (e) {
          console.warn('[location task] unexpected error:', e)
        }
      },
    )
  } catch (e) {
    console.warn('[location] defineTask failed:', e)
  }
}

let foregroundSubscription: Location.LocationSubscription | null = null

async function startForegroundFallback(
  routeId: string,
  driverId: string,
): Promise<boolean> {
  if (foregroundSubscription) return true
  try {
    foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 20,
        timeInterval: 5000,
      },
      (loc) => {
        insertLocationRows([toRow(loc, driverId, routeId)]).catch((e) =>
          console.warn('[location fg] insert threw:', e),
        )
      },
    )
    return true
  } catch (e) {
    console.warn('[location] startForegroundFallback failed:', e)
    return false
  }
}

async function stopForegroundFallback(): Promise<void> {
  if (foregroundSubscription) {
    try {
      foregroundSubscription.remove()
    } catch (e) {
      console.warn('[location] stopForegroundFallback failed:', e)
    }
    foregroundSubscription = null
  }
}

export type TrackingMode = 'background' | 'foreground-only' | 'denied'

/**
 * Pide permisos y arranca el tracking GPS:
 * - `background`: dev client / standalone con permiso "Siempre" — el task
 *   sigue corriendo aunque el usuario salga de la app, e iOS muestra el
 *   indicador azul/verde de uso de ubicación.
 * - `foreground-only`: Expo Go o permiso "Mientras se usa" — solo se rastrea
 *   con la app abierta. La UI debería avisar al usuario.
 * - `denied`: el usuario rechazó el permiso de foreground.
 */
export async function startTracking(
  routeId: string,
  driverId: string,
): Promise<TrackingMode> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync()
    if (fg.status !== 'granted') return 'denied'

    await AsyncStorage.setItem(ACTIVE_ROUTE_KEY, routeId)
    await AsyncStorage.setItem(ACTIVE_DRIVER_KEY, driverId)

    if (isExpoGo) {
      const ok = await startForegroundFallback(routeId, driverId)
      return ok ? 'foreground-only' : 'denied'
    }

    const bg = await Location.requestBackgroundPermissionsAsync()
    if (bg.status !== 'granted') {
      // Sin permiso "Siempre" no podemos correr el background task. Caemos a
      // foreground watcher para que al menos haya tracking con la app abierta.
      const ok = await startForegroundFallback(routeId, driverId)
      return ok ? 'foreground-only' : 'denied'
    }

    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME,
    ).catch(() => false)
    if (!alreadyStarted) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 50,
        timeInterval: 10000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.AutomotiveNavigation,
        foregroundService: {
          notificationTitle: 'Ruta activa',
          notificationBody: 'Seguimiento de ubicacion',
          notificationColor: '#3b82f6',
        },
      })
    }
    return 'background'
  } catch (e) {
    console.warn('[location] startTracking failed:', e)
    return 'denied'
  }
}

export async function stopTracking(): Promise<void> {
  await stopForegroundFallback()

  if (!isExpoGo) {
    try {
      const started = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME,
      ).catch(() => false)
      if (started) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)
      }
    } catch (e) {
      console.warn('[location] stopTracking (bg) failed:', e)
    }
  }

  try {
    await AsyncStorage.multiRemove([ACTIVE_ROUTE_KEY, ACTIVE_DRIVER_KEY])
  } catch (e) {
    console.warn('[location] failed clearing AsyncStorage keys:', e)
  }
}

export async function isTrackingActive(): Promise<boolean> {
  if (foregroundSubscription) return true
  if (isExpoGo) return false
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
  } catch {
    return false
  }
}
