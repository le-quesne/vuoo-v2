-- Vuoo V2 - Route Planning Database Schema

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Vehicles table
create table vehicles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  license_plate text,
  brand text,
  model text,
  capacity_weight_kg numeric not null default 0,
  capacity_volume_m3 numeric,
  price_per_km numeric,
  price_per_hour numeric,
  fuel_type text not null default 'gasoline' check (fuel_type in ('gasoline', 'diesel', 'electric', 'hybrid')),
  avg_consumption numeric,
  time_window_start time,
  time_window_end time,
  created_at timestamptz not null default now()
);

-- Plans table
create table plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  date date not null,
  created_at timestamptz not null default now()
);

-- Routes table (links a plan to a vehicle)
create table routes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  plan_id uuid references plans(id) on delete cascade not null,
  vehicle_id uuid references vehicles(id) on delete set null,
  status text not null default 'not_started' check (status in ('not_started', 'in_transit', 'completed')),
  total_distance_km numeric,
  total_duration_minutes numeric,
  created_at timestamptz not null default now()
);

-- Stops table
create table stops (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  plan_id uuid references plans(id) on delete set null,
  route_id uuid references routes(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled', 'incomplete')),
  duration_minutes integer not null default 15,
  weight_kg numeric,
  volume_m3 numeric,
  time_window_start time,
  time_window_end time,
  order_index integer,
  execution_date date,
  report_location text,
  report_time timestamptz,
  report_comments text,
  report_signature_url text,
  report_images text[],
  cancellation_reason text,
  delivery_attempts integer not null default 0,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_plans_user_date on plans(user_id, date);
create index idx_stops_plan on stops(plan_id);
create index idx_stops_route on stops(route_id);
create index idx_stops_vehicle on stops(vehicle_id);
create index idx_routes_plan on routes(plan_id);
create index idx_vehicles_user on vehicles(user_id);

-- Row Level Security
alter table vehicles enable row level security;
alter table plans enable row level security;
alter table routes enable row level security;
alter table stops enable row level security;

create policy "Users can manage own vehicles" on vehicles for all using (auth.uid() = user_id);
create policy "Users can manage own plans" on plans for all using (auth.uid() = user_id);
create policy "Users can manage own routes" on routes for all using (auth.uid() = user_id);
create policy "Users can manage own stops" on stops for all using (auth.uid() = user_id);
