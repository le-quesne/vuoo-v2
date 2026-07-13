import { supabase } from '@/lib/supabase'

export interface ResolvedDepot {
  lat: number
  lng: number
  address: string | null
}

// Precedencia de depot (espejo de backend-railway/src/routes/vroom.ts):
// depot propio del vehículo (vehicles.depot_id, vía FK a `depots`) > override
// legacy ad-hoc (vehicles.depot_lat/lng). Ya no hay fallback a nivel de org.
export async function resolveDepotForVehicle(vehicleId: string): Promise<ResolvedDepot | null> {
  const { data } = await supabase
    .from('vehicles')
    .select('depot_lat, depot_lng, depot:depots(lat, lng, address)')
    .eq('id', vehicleId)
    .maybeSingle()

  if (!data) return null

  // El embed `depot:depots(...)` es a-uno (vehicles.depot_id → depots.id),
  // pero sin tipos de Database generados el cliente infiere un array — se
  // normaliza a objeto por las dudas.
  const depotRaw = data.depot as unknown as
    | { lat: number; lng: number; address: string | null }
    | { lat: number; lng: number; address: string | null }[]
    | null
  const depot = Array.isArray(depotRaw) ? (depotRaw[0] ?? null) : depotRaw
  if (depot) return { lat: depot.lat, lng: depot.lng, address: depot.address }

  const lat = data.depot_lat as number | null
  const lng = data.depot_lng as number | null
  if (typeof lat === 'number' && typeof lng === 'number') {
    return { lat, lng, address: null }
  }
  return null
}
