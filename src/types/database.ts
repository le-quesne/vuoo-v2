export type StopStatus = 'pending' | 'completed' | 'cancelled' | 'incomplete'
export type RouteStatus = 'not_started' | 'in_transit' | 'completed'
export type FuelType = 'gasoline' | 'diesel' | 'electric' | 'hybrid'
export type OrgRole = 'owner' | 'admin' | 'member'

export interface Organization {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface OrganizationMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  created_at: string
}

export interface Vehicle {
  id: string
  name: string
  license_plate: string | null
  brand: string | null
  model: string | null
  capacity_weight_kg: number
  capacity_volume_m3: number | null
  price_per_km: number | null
  price_per_hour: number | null
  fuel_type: FuelType
  avg_consumption: number | null
  time_window_start: string | null
  time_window_end: string | null
  created_at: string
  user_id: string
  org_id: string
}

export interface Plan {
  id: string
  name: string
  date: string
  created_at: string
  user_id: string
  org_id: string
}

export interface Stop {
  id: string
  plan_id: string | null
  route_id: string | null
  vehicle_id: string | null
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  status: StopStatus
  duration_minutes: number
  weight_kg: number | null
  volume_m3: number | null
  time_window_start: string | null
  time_window_end: string | null
  order_index: number | null
  execution_date: string | null
  report_location: string | null
  report_time: string | null
  report_comments: string | null
  report_signature_url: string | null
  report_images: string[] | null
  cancellation_reason: string | null
  delivery_attempts: number
  created_at: string
  user_id: string
  org_id: string
}

export interface Route {
  id: string
  plan_id: string
  vehicle_id: string
  status: RouteStatus
  total_distance_km: number | null
  total_duration_minutes: number | null
  created_at: string
  user_id: string
  org_id: string
  // joined
  vehicle?: Vehicle
  stops?: Stop[]
}

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: Organization
        Insert: Omit<Organization, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Organization>
        Relationships: []
      }
      organization_members: {
        Row: OrganizationMember
        Insert: Omit<OrganizationMember, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<OrganizationMember>
        Relationships: []
      }
      vehicles: {
        Row: Vehicle
        Insert: Omit<Vehicle, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Vehicle>
        Relationships: []
      }
      plans: {
        Row: Plan
        Insert: Omit<Plan, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Plan>
        Relationships: []
      }
      stops: {
        Row: Stop
        Insert: Omit<Stop, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Stop>
        Relationships: []
      }
      routes: {
        Row: Route
        Insert: Omit<Route, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Route>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      admin_list_users: {
        Args: Record<string, never>
        Returns: { id: string; email: string; created_at: string; is_super_admin: boolean; org_count: number }[]
      }
      admin_get_org_stats: {
        Args: Record<string, never>
        Returns: { org_id: string; org_name: string; org_slug: string; org_created_at: string; member_count: number; plan_count: number; stop_count: number; vehicle_count: number; route_count: number }[]
      }
      is_super_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      user_org_ids: {
        Args: Record<string, never>
        Returns: string[]
      }
    }
    Enums: {
      org_role: OrgRole
    }
    CompositeTypes: Record<string, never>
  }
}
