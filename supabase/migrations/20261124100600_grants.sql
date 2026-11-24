-- RouteSync Phase 3 — explicit API grants only.
-- Automatic grants for future tables must remain disabled in the Supabase project.
-- RLS is the authorization layer; grants only expose the required operations.

revoke all on schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;

-- Public restaurant/menu catalogue (RLS limits rows to active restaurants/items).
grant select on public.restaurants to anon;
grant select on public.menu_categories to anon;
grant select on public.menu_items to anon;

-- Authenticated users may attempt reads on all application tables; RLS filters rows.
grant select on all tables in schema public to authenticated;

-- Profiles: users may edit only presentation fields. Role is never a grantable column.
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

-- Restaurants: owners update their own presentation/operations fields, never owner_id.
grant insert, delete on public.restaurants to authenticated;
grant update (
  name, description, cuisine_type, phone, email, address_line, landmark,
  city, state, pincode, latitude, longitude, default_prep_time_minutes,
  opening_time, closing_time, is_active
) on public.restaurants to authenticated;

grant insert, update, delete on public.menu_categories to authenticated;
grant insert, update, delete on public.menu_items to authenticated;
grant insert, update, delete on public.customer_addresses to authenticated;

-- Riders: self-service availability/location only; capacity and verification are trusted.
grant insert, delete on public.riders to authenticated;
grant update (
  vehicle_type, vehicle_number, is_available,
  current_latitude, current_longitude, last_location_at
) on public.riders to authenticated;

grant insert, update, delete on public.rider_shifts to authenticated;

-- Orders: only status fields are updateable; totals/items are server-controlled.
grant insert, delete on public.orders to authenticated;
grant update (status, cancellation_reason) on public.orders to authenticated;

grant insert, update, delete on public.order_items to authenticated;
grant insert, update, delete on public.assignments to authenticated;
grant insert, update, delete on public.delivery_routes to authenticated;
grant insert, update, delete on public.route_stops to authenticated;

grant delete on public.rider_locations to authenticated;
grant update (latitude, longitude, accuracy_meters, recorded_at, source)
  on public.rider_locations to authenticated;
grant insert (
  rider_id, assignment_id, latitude, longitude, accuracy_meters, recorded_at, source
) on public.rider_locations to authenticated;

grant insert on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

grant insert, update, delete on public.scheduling_runs to authenticated;
grant insert, update, delete on public.constraint_violations to authenticated;

-- Audit logs are read-only for admins; only trusted server code writes them.
-- No INSERT/UPDATE/DELETE grant is issued for audit_logs.

grant usage, select on all sequences in schema public to authenticated;

-- Trusted role provisioning RPC. Self-service callers are rejected inside the function.
revoke all on function public.admin_set_user_role(uuid, public.app_role, text)
  from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.app_role, text)
  to authenticated, service_role;

-- Policy helpers are callable by policy evaluation but not exposed as PostgREST RPCs.
grant execute on all functions in schema private to anon, authenticated, service_role;

-- Trusted backend service-role permissions.
grant usage on schema public to service_role;

revoke all privileges on all tables
in schema public from service_role;

grant select, insert, update, delete
on all tables in schema public to service_role;

revoke all privileges on all sequences
in schema public from service_role;

grant usage, select
on all sequences in schema public to service_role;