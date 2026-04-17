export type StopStatus = 'pending' | 'completed' | 'cancelled' | 'incomplete'
export type RouteStatus = 'not_started' | 'in_transit' | 'completed'
export type FuelType = 'gasoline' | 'diesel' | 'electric' | 'hybrid'
export type OrgRole = 'owner' | 'admin' | 'member'
export type DriverStatus = 'active' | 'inactive' | 'on_leave'
export type OrderStatus =
  | 'pending'
  | 'scheduled'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'returned'
export type OrderSource = 'manual' | 'csv' | 'shopify' | 'vtex' | 'api' | 'whatsapp'
export type OrderPriority = 'urgent' | 'high' | 'normal' | 'low'

export interface Organization {
  id: string
  name: string
  slug: string
  created_at: string
  default_depot_lat: number | null
  default_depot_lng: number | null
  default_depot_address: string | null
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
  depot_lat: number | null
  depot_lng: number | null
  depot_address: string | null
  created_at: string
  user_id: string
  org_id: string
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
  default_vehicle_id: string | null
  time_window_start: string | null
  time_window_end: string | null
  working_days: number[]
  notes: string | null
  created_at: string
  // joined
  default_vehicle?: Vehicle | null
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
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  duration_minutes: number
  weight_kg: number | null
  volume_m3: number | null
  time_window_start: string | null
  time_window_end: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  delivery_instructions: string | null
  created_at: string
  user_id: string
  org_id: string
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
  tracking_token: string
  notification_preferences: NotificationPreferences
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
  name: string | null
  created_at: string
  user_id: string
  org_id: string
  // joined
  vehicle?: Vehicle
  driver?: Driver | null
}

export interface DriverLocation {
  id: string
  driver_id: string
  route_id: string | null
  lat: number
  lng: number
  accuracy: number | null
  speed: number | null
  heading: number | null
  battery: number | null
  recorded_at: string
  created_at: string
}

export interface NotificationPreferences {
  whatsapp: boolean
  sms: boolean
  email: boolean
}

export type NotificationChannel = 'whatsapp' | 'sms' | 'email'
export type NotificationEventType = 'scheduled' | 'in_transit' | 'arriving' | 'delivered' | 'failed' | 'survey'
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface NotificationLog {
  id: string
  org_id: string
  plan_stop_id: string
  channel: NotificationChannel
  event_type: NotificationEventType
  recipient: string
  template_id: string | null
  status: NotificationStatus
  error_message: string | null
  external_id: string | null
  sent_at: string | null
  created_at: string
}

export interface DeliveryFeedback {
  id: string
  org_id: string
  plan_stop_id: string
  driver_id: string | null
  rating: number
  comment: string | null
  submitted_at: string
}

export interface OrgNotificationSettings {
  id: string
  org_id: string
  whatsapp_enabled: boolean
  sms_enabled: boolean
  email_enabled: boolean
  whatsapp_phone_id: string | null
  whatsapp_token: string | null
  whatsapp_verified: boolean
  twilio_account_sid: string | null
  twilio_auth_token: string | null
  twilio_phone_number: string | null
  resend_api_key: string | null
  email_from_address: string | null
  email_from_name: string | null
  notify_on_scheduled: boolean
  notify_on_transit: boolean
  notify_on_arriving: boolean
  notify_on_delivered: boolean
  notify_on_failed: boolean
  send_survey: boolean
  survey_delay_min: number
  logo_url: string | null
  primary_color: string
  arriving_stops_threshold: number
  created_at: string
  updated_at: string
}

export interface OrderItem {
  name: string
  quantity: number
  sku?: string | null
  weight_kg?: number | null
  price?: number | null
}

export interface Order {
  id: string
  org_id: string
  order_number: string
  external_id: string | null
  source: OrderSource
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  address: string
  lat: number | null
  lng: number | null
  delivery_instructions: string | null
  items: OrderItem[]
  total_weight_kg: number
  total_volume_m3: number | null
  total_price: number | null
  currency: string
  service_duration_minutes: number
  time_window_start: string | null
  time_window_end: string | null
  priority: OrderPriority
  requires_signature: boolean
  requires_photo: boolean
  requested_date: string | null
  status: OrderStatus
  stop_id: string | null
  plan_stop_id: string | null
  internal_notes: string | null
  tags: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TrackingResponse {
  status: 'scheduled' | 'in_transit' | 'arriving' | 'delivered' | 'failed'
  stop: {
    address: string
    time_window_start: string | null
    time_window_end: string | null
    customer_name: string | null
    delivery_instructions: string | null
  }
  driver: {
    first_name: string
    vehicle_plate: string | null
  } | null
  eta: {
    estimated_arrival: string | null
    stops_before: number
  } | null
  location: {
    lat: number
    lng: number
    updated_at: string
  } | null
  pod: {
    photos: string[]
    signature_url: string | null
    completed_at: string | null
    location: string | null
  } | null
  org: {
    name: string
    logo_url: string | null
  }
}

// =============================================
// Analytics RPC return types
// =============================================

export interface AnalyticsSummary {
  total_plans: number
  total_routes: number
  total_stops: number
  stops_completed: number
  stops_cancelled: number
  stops_incomplete: number
  stops_pending: number
  total_distance_km: number
  total_duration_min: number
  total_vehicles: number
  total_drivers: number
  avg_rating: number | null
  total_feedback: number
}

export interface DailyTrendRow {
  day: string
  total_stops: number
  completed: number
  cancelled: number
  incomplete: number
  pending: number
  distance_km: number
  duration_min: number
}

export interface DriverPerformanceRow {
  driver_id: string
  driver_name: string
  total_stops: number
  completed: number
  cancelled: number
  incomplete: number
  success_rate: number
  avg_rating: number | null
  total_distance_km: number
  total_feedback: number
}

export interface CancellationReasonRow {
  reason: string
  count: number
  percentage: number
}

export interface FeedbackSummary {
  avg_rating: number | null
  total_responses: number
  rating_1: number
  rating_2: number
  rating_3: number
  rating_4: number
  rating_5: number
  nps: number
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
      plan_stops: {
        Row: PlanStop
        Insert: Omit<PlanStop, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<PlanStop>
        Relationships: []
      }
      routes: {
        Row: Route
        Insert: Omit<Route, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Route>
        Relationships: []
      }
      drivers: {
        Row: Driver
        Insert: Omit<Driver, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Driver>
        Relationships: []
      }
      driver_locations: {
        Row: DriverLocation
        Insert: Omit<DriverLocation, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<DriverLocation>
        Relationships: []
      }
      orders: {
        Row: Order
        Insert: Omit<Order, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Order>
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
        Returns: { org_id: string; org_name: string; org_slug: string; org_created_at: string; member_count: number; plan_count: number; stop_count: number; vehicle_count: number; route_count: number; driver_count: number }[]
      }
      is_super_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      user_org_ids: {
        Args: Record<string, never>
        Returns: string[]
      }
      generate_order_number: {
        Args: { p_org_id: string }
        Returns: string
      }
      get_analytics_summary: {
        Args: { p_org_id: string; p_from?: string | null; p_to?: string | null }
        Returns: AnalyticsSummary
      }
      get_daily_trend: {
        Args: { p_org_id: string; p_from: string; p_to: string }
        Returns: DailyTrendRow[]
      }
      get_driver_performance: {
        Args: { p_org_id: string; p_from?: string | null; p_to?: string | null }
        Returns: DriverPerformanceRow[]
      }
      get_cancellation_reasons: {
        Args: { p_org_id: string; p_from?: string | null; p_to?: string | null }
        Returns: CancellationReasonRow[]
      }
      get_feedback_summary: {
        Args: { p_org_id: string; p_from?: string | null; p_to?: string | null }
        Returns: FeedbackSummary
      }
    }
    Enums: {
      org_role: OrgRole
    }
    CompositeTypes: Record<string, never>
  }
}
