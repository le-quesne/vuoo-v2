// Copia de /src/types/database.ts — mantener sincronizado manualmente
// hasta que se setee un monorepo con shared/.

export type StopStatus = 'pending' | 'completed' | 'cancelled' | 'incomplete'
export type RouteStatus = 'not_started' | 'in_transit' | 'completed'
export type DriverStatus = 'active' | 'inactive' | 'on_leave'
export type DriverAvailability = 'off_shift' | 'online' | 'on_break' | 'busy'

export interface Organization {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface Vehicle {
  id: string
  name: string
  license_plate: string | null
  brand: string | null
  model: string | null
  capacity_weight_kg: number
  org_id: string
  created_at: string
}

export interface Driver {
  id: string
  org_id: string
  user_id: string | null
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  avatar_url: string | null
  license_number: string | null
  license_expiry: string | null
  national_id: string | null
  status: DriverStatus
  availability: DriverAvailability
  availability_updated_at: string | null
  default_vehicle_id: string | null
  time_window_start: string | null
  time_window_end: string | null
  working_days: number[]
  notes: string | null
  created_at: string
}

export interface Plan {
  id: string
  name: string
  date: string
  org_id: string
  created_at: string
}

export interface Stop {
  id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  duration_minutes: number
  weight_kg: number | null
  time_window_start: string | null
  time_window_end: string | null
  org_id: string
  created_at: string
}

export interface PlanStop {
  id: string
  stop_id: string
  plan_id: string | null
  route_id: string | null
  vehicle_id: string | null
  order_index: number | null
  status: StopStatus
  execution_date: string | null
  report_location: string | null
  report_time: string | null
  report_comments: string | null
  report_signature_url: string | null
  report_images: string[] | null
  cancellation_reason: string | null
  delivery_attempts: number
  org_id: string
  created_at: string
}

export type PlanStopWithStop = PlanStop & { stop: Stop }

export interface Route {
  id: string
  plan_id: string
  vehicle_id: string
  driver_id: string | null
  status: RouteStatus
  total_distance_km: number | null
  total_duration_minutes: number | null
  org_id: string
  created_at: string
  plan?: Plan
  vehicle?: Vehicle | null
}

export interface RouteWithProgress extends Route {
  stops_total: number
  stops_completed: number
}
