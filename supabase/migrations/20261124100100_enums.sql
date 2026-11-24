-- RouteSync Phase 3 — shared enum types.
-- Apply migrations in filename order through the Supabase SQL Editor or CLI.

create type public.app_role as enum ('admin', 'restaurant', 'rider', 'customer');
create type public.shift_status as enum ('scheduled', 'active', 'completed', 'cancelled');
create type public.verification_status as enum ('pending', 'verified', 'rejected', 'suspended');
create type public.order_status as enum (
  'draft', 'pending', 'confirmed', 'preparing', 'ready', 'assigned',
  'picked_up', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'
);
create type public.order_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.assignment_status as enum (
  'proposed', 'accepted', 'rejected', 'active', 'completed', 'cancelled', 'reassigned'
);
create type public.route_status as enum ('planned', 'active', 'completed', 'cancelled');
create type public.stop_type as enum ('pickup', 'dropoff');
create type public.stop_status as enum ('pending', 'arrived', 'completed', 'skipped');
create type public.run_status as enum ('pending', 'running', 'completed', 'failed', 'infeasible');
create type public.notification_type as enum (
  'order_status', 'assignment', 'delay', 'system', 'auth', 'promotion'
);
create type public.notification_channel as enum ('in_app', 'email', 'push');
create type public.location_source as enum ('gps', 'manual', 'simulated');
create type public.violation_severity as enum ('info', 'warning', 'error', 'critical');
