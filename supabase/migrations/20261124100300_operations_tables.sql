-- RouteSync Phase 3 — scheduling, ordering, routing and audit tables.

create table public.scheduling_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.profiles (id) on delete set null,
  restaurant_id uuid references public.restaurants (id) on delete set null,
  status public.run_status not null default 'pending',
  algorithm text not null default 'csp-backtracking',
  input_snapshot jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index scheduling_runs_status_idx on public.scheduling_runs (status, created_at desc);
create index scheduling_runs_restaurant_idx on public.scheduling_runs (restaurant_id, created_at desc);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete restrict,
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  delivery_address_id uuid references public.customer_addresses (id) on delete set null,
  status public.order_status not null default 'pending',
  priority public.order_priority not null default 'normal',
  subtotal_minor integer not null default 0 check (subtotal_minor >= 0),
  delivery_fee_minor integer not null default 0 check (delivery_fee_minor >= 0),
  discount_minor integer not null default 0 check (discount_minor >= 0),
  total_minor integer not null default 0 check (total_minor >= 0),
  currency char(3) not null default 'INR',
  requested_at timestamptz not null default now(),
  delivery_window_start timestamptz not null,
  delivery_window_end timestamptz not null,
  prep_time_minutes integer not null default 20 check (prep_time_minutes between 1 and 240),
  delivery_address_line text not null,
  delivery_latitude numeric(9, 6) check (delivery_latitude is null or delivery_latitude between -90 and 90),
  delivery_longitude numeric(9, 6) check (delivery_longitude is null or delivery_longitude between -180 and 180),
  delivery_contact_phone text,
  special_instructions text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (delivery_window_end > delivery_window_start),
  check (total_minor = subtotal_minor + delivery_fee_minor - discount_minor),
  check ((delivery_latitude is null) = (delivery_longitude is null))
);

create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_restaurant_idx on public.orders (restaurant_id, created_at desc);
create index orders_status_window_idx on public.orders (status, delivery_window_start);
create index orders_requested_idx on public.orders (requested_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  item_name text not null,
  unit_price_minor integer not null check (unit_price_minor >= 0),
  quantity integer not null check (quantity > 0),
  line_total_minor integer generated always as (unit_price_minor * quantity) stored,
  notes text,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);
create unique index order_items_unique_menu_item_idx
  on public.order_items (order_id, menu_item_id)
  where menu_item_id is not null;

create table public.delivery_routes (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders (id) on delete restrict,
  shift_id uuid references public.rider_shifts (id) on delete set null,
  scheduling_run_id uuid references public.scheduling_runs (id) on delete set null,
  status public.route_status not null default 'planned',
  planned_start timestamptz,
  planned_end timestamptz,
  total_distance_meters integer check (total_distance_meters is null or total_distance_meters >= 0),
  total_duration_seconds integer check (total_duration_seconds is null or total_duration_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_end is null or planned_start is null or planned_end >= planned_start)
);

create index delivery_routes_rider_idx on public.delivery_routes (rider_id, status);
create index delivery_routes_shift_idx on public.delivery_routes (shift_id);
create index delivery_routes_run_idx on public.delivery_routes (scheduling_run_id);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  rider_id uuid not null references public.riders (id) on delete restrict,
  route_id uuid references public.delivery_routes (id) on delete set null,
  scheduling_run_id uuid references public.scheduling_runs (id) on delete set null,
  status public.assignment_status not null default 'proposed',
  is_current boolean not null default true,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  planned_pickup_at timestamptz,
  planned_delivery_at timestamptz,
  replaced_by_assignment_id uuid references public.assignments (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    planned_delivery_at is null or planned_pickup_at is null
    or planned_delivery_at >= planned_pickup_at
  )
);

create unique index assignments_one_current_per_order_idx
  on public.assignments (order_id)
  where is_current;
create index assignments_rider_idx on public.assignments (rider_id, is_current);
create index assignments_route_idx on public.assignments (route_id);
create index assignments_run_idx on public.assignments (scheduling_run_id);

create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.delivery_routes (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  stop_sequence integer not null check (stop_sequence > 0),
  stop_type public.stop_type not null,
  status public.stop_status not null default 'pending',
  planned_arrival timestamptz,
  planned_departure timestamptz,
  actual_arrival timestamptz,
  actual_departure timestamptz,
  address_line text,
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, stop_sequence),
  unique (route_id, order_id, stop_type),
  check (planned_departure is null or planned_arrival is null or planned_departure >= planned_arrival),
  check ((latitude is null) = (longitude is null))
);

create index route_stops_route_idx on public.route_stops (route_id, stop_sequence);
create index route_stops_order_idx on public.route_stops (order_id);

create table public.rider_locations (
  id bigserial primary key,
  rider_id uuid not null references public.riders (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  accuracy_meters numeric(8, 2) check (accuracy_meters is null or accuracy_meters >= 0),
  recorded_at timestamptz not null default now(),
  source public.location_source not null default 'gps',
  created_at timestamptz not null default now()
);

create index rider_locations_rider_time_idx
  on public.rider_locations (rider_id, recorded_at desc);
create index rider_locations_assignment_idx on public.rider_locations (assignment_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  type public.notification_type not null default 'system',
  channel public.notification_channel not null default 'in_app',
  title text not null,
  body text not null,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications (user_id, read_at, created_at desc);
create index notifications_order_idx on public.notifications (order_id);

create table public.constraint_violations (
  id uuid primary key default gen_random_uuid(),
  scheduling_run_id uuid not null references public.scheduling_runs (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  rider_id uuid references public.riders (id) on delete set null,
  assignment_id uuid references public.assignments (id) on delete set null,
  constraint_type text not null,
  severity public.violation_severity not null default 'error',
  message text not null,
  details jsonb not null default '{}'::jsonb,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index constraint_violations_run_idx
  on public.constraint_violations (scheduling_run_id, created_at desc);
create index constraint_violations_order_idx on public.constraint_violations (order_id);

create table public.audit_logs (
  id bigserial primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role public.app_role,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
