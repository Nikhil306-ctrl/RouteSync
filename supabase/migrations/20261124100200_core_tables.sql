-- RouteSync Phase 3 — identity, catalogue and resource tables.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'customer',
  email text,
  full_name text not null default '',
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role) where is_active;
create index profiles_email_idx on public.profiles (lower(email)) where email is not null;

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  cuisine_type text,
  phone text,
  email text,
  address_line text not null,
  landmark text,
  city text not null default 'Belagavi',
  state text not null default 'Karnataka',
  pincode text check (pincode is null or pincode ~ '^[0-9]{6}$'),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  default_prep_time_minutes integer not null default 20
    check (default_prep_time_minutes between 1 and 240),
  opening_time time,
  closing_time time,
  is_active boolean not null default true,
  rating numeric(2, 1) not null default 0 check (rating between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

create index restaurants_city_idx on public.restaurants (city) where is_active;
create index restaurants_owner_idx on public.restaurants (owner_id);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

create index menu_categories_restaurant_idx
  on public.menu_categories (restaurant_id, display_order);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid references public.menu_categories (id) on delete set null,
  name text not null,
  description text,
  price_minor integer not null check (price_minor >= 0),
  currency char(3) not null default 'INR',
  is_vegetarian boolean not null default true,
  is_available boolean not null default true,
  prep_time_minutes integer not null default 15
    check (prep_time_minutes between 1 and 240),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

create index menu_items_restaurant_idx
  on public.menu_items (restaurant_id, category_id, is_available);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  phone text,
  address_line1 text not null,
  address_line2 text,
  landmark text,
  city text not null default 'Belagavi',
  state text not null default 'Karnataka',
  pincode text check (pincode is null or pincode ~ '^[0-9]{6}$'),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

create index customer_addresses_customer_idx on public.customer_addresses (customer_id);
create unique index customer_addresses_one_default_idx
  on public.customer_addresses (customer_id)
  where is_default;

create table public.riders (
  id uuid primary key references public.profiles (id) on delete cascade,
  vehicle_type text not null default 'bike',
  vehicle_number text unique,
  max_concurrent_orders integer not null default 1
    check (max_concurrent_orders between 1 and 10),
  is_available boolean not null default false,
  verification_status public.verification_status not null default 'pending',
  current_latitude numeric(9, 6) check (current_latitude is null or current_latitude between -90 and 90),
  current_longitude numeric(9, 6) check (current_longitude is null or current_longitude between -180 and 180),
  last_location_at timestamptz,
  rating numeric(2, 1) not null default 0 check (rating between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((current_latitude is null) = (current_longitude is null))
);

create index riders_available_idx on public.riders (is_available, verification_status);

create table public.rider_shifts (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 120),
  status public.shift_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index rider_shifts_rider_idx on public.rider_shifts (rider_id, starts_at);
create index rider_shifts_status_idx on public.rider_shifts (status, starts_at);
