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

let taskDefined = false
let foregroundSubscription: Location.LocationSubscription | null = null

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

export function defineLocationTask(): void {
  if (taskDefined || isExpoGo) return
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
    taskDefined = true
  } catch (e) {
    console.warn('[location] defineLocationTask failed:', e)
  }
}

export function initLocationTask(): void {
  defineLocationTask()
}

async function startForegroundTracking(
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
        // Fire and forget; errors son logueados dentro de insertLocationRows
        insertLocationRows([toRow(loc, driverId, routeId)]).catch((e) =>
          console.warn('[location fg] insert threw:', e),
        )
      },
    )
    return true
  } catch (e) {
    console.warn('[location] startForegroundTracking failed:', e)
    return false
  }
}

async function stopForegroundTracking(): Promise<void> {
  if (foregroundSubscription) {
    try {
      foregroundSubscription.remove()
    } catch (e) {
      console.warn('[location] stopForegroundTracking failed:', e)
    }
    foregroundSubscription = null
  }
}

/**
 * Pide permisos y arranca el tracking GPS:
 * - En Expo Go: solo foreground (watchPositionAsync).
 * - En dev client / standalone: background via TaskManager.
 * Retorna `true` si al menos un modo arrancó correctamente.
 */
export async function startTracking(
  routeId: string,
  driverId: string,
): Promise<boolean> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync()
    if (fg.status !== 'granted') {
      console.warn('[location] foreground permission denied')
      return false
    }

    await AsyncStorage.setItem(ACTIVE_ROUTE_KEY, routeId)
    await AsyncStorage.setItem(ACTIVE_DRIVER_KEY, driverId)

    if (isExpoGo) {
      return await startForegroundTracking(routeId, driverId)
    }

    // Dev client / standalone: arrancamos foreground primero (feedback inmediato)
    // y además background task para cuando la app se minimice.
    const fgOk = await startForegroundTracking(routeId, driverId)

    try {
      const bg = await Location.requestBackgroundPermissionsAsync()
      if (bg.status !== 'granted') {
        console.warn('[location] background permission denied — solo foreground')
        return fgOk
      }

      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME,
      ).catch(() => false)
      if (alreadyStarted) return true

      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 50,
        timeInterval: 10000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Ruta activa',
          notificationBody: 'Seguimiento de ubicacion',
          notificationColor: '#3b82f6',
        },
      })
      return true
    } catch (e) {
      console.warn('[location] background task failed, keeping foreground:', e)
      return fgOk
    }
  } catch (e) {
    console.warn('[location] startTracking failed:', e)
    return false
  }
}

export async function stopTracking(): Promise<void> {
  await stopForegroundTracking()

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
