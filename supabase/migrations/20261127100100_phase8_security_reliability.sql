-- Phase 8: additive security, concurrency and route-integrity corrections.

-- Direct browser writes bypassed the validated, service-role-only location RPC.
drop policy if exists rider_locations_insert_own on public.rider_locations;
revoke insert, update, delete on public.rider_locations from authenticated;
revoke insert (rider_id, assignment_id, latitude, longitude, accuracy_meters, recorded_at, source)
  on public.rider_locations from authenticated;
revoke update (latitude, longitude, accuracy_meters, recorded_at, source)
  on public.rider_locations from authenticated;
revoke update on public.riders from authenticated;
revoke update (vehicle_type, vehicle_number, is_available, current_latitude, current_longitude, last_location_at)
  on public.riders from authenticated;
grant update (vehicle_type, vehicle_number) on public.riders to authenticated;

do $$
begin
  if has_column_privilege('authenticated', 'public.riders', 'is_available', 'UPDATE')
    or has_column_privilege('authenticated', 'public.riders', 'current_latitude', 'UPDATE')
    or has_column_privilege('authenticated', 'public.riders', 'current_longitude', 'UPDATE')
    or has_column_privilege('authenticated', 'public.riders', 'last_location_at', 'UPDATE')
    or has_any_column_privilege('authenticated', 'public.rider_locations', 'INSERT')
    or has_any_column_privilege('authenticated', 'public.rider_locations', 'UPDATE')
    or has_table_privilege('authenticated', 'public.rider_locations', 'DELETE')
    then
    raise exception 'Authenticated rider location or availability privileges remain too broad.';
  end if;
  if not has_column_privilege('authenticated', 'public.riders', 'vehicle_type', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.riders', 'vehicle_number', 'UPDATE') then
    raise exception 'Authenticated rider vehicle privileges are missing.';
  end if;
end;
$$;

create or replace function public.record_rider_location(
  p_rider_id uuid,
  p_assignment_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_meters numeric default null,
  p_source text default 'gps'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_rider public.riders%rowtype;
  v_assignment public.assignments%rowtype;
  v_source public.location_source;
  v_location_id bigint;
  v_recorded_at timestamptz := now();
begin
  if p_rider_id is null then
    raise exception 'A delivery partner account is required.' using errcode = '42501';
  end if;
  if p_assignment_id is null then
    raise exception 'A current assignment is required to share a location.' using errcode = '23514';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude < -90 or p_latitude > 90
    or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Enter valid latitude and longitude.' using errcode = '22023';
  end if;
  if p_accuracy_meters is not null and (p_accuracy_meters < 0 or p_accuracy_meters > 100000) then
    raise exception 'Location accuracy is outside the accepted range.' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('gps', 'manual', 'simulated') then
    raise exception 'Choose a valid location source.' using errcode = '22023';
  end if;
  v_source := p_source::public.location_source;

  select * into v_profile
  from public.profiles
  where id = p_rider_id and is_active = true and role = 'rider';
  if not found then
    raise exception 'An active delivery partner account is required.' using errcode = '42501';
  end if;

  -- Assignment before rider matches lifecycle RPC lock ordering and closes the
  -- race where a rejected assignment could receive another location sample.
  select * into v_assignment
  from public.assignments
  where id = p_assignment_id and rider_id = p_rider_id
  for update;
  if not found then
    raise exception 'This assignment belongs to another delivery partner.' using errcode = '42501';
  end if;
  if not v_assignment.is_current or v_assignment.status not in ('accepted', 'active') then
    raise exception 'This assignment is no longer active.' using errcode = '23514';
  end if;

  select * into v_rider
  from public.riders
  where id = p_rider_id
  for update;
  if not found then
    raise exception 'The delivery partner profile is incomplete.' using errcode = '23514';
  end if;
  if v_rider.verification_status <> 'verified' then
    raise exception 'Only a verified delivery partner can share a location.' using errcode = '42501';
  end if;

  insert into public.rider_locations (
    rider_id, assignment_id, latitude, longitude, accuracy_meters, recorded_at, source
  ) values (
    p_rider_id, p_assignment_id, p_latitude, p_longitude, p_accuracy_meters,
    v_recorded_at, v_source
  ) returning id into v_location_id;

  update public.riders
  set current_latitude = p_latitude,
      current_longitude = p_longitude,
      last_location_at = v_recorded_at,
      updated_at = v_recorded_at
  where id = p_rider_id;

  return jsonb_build_object(
    'location_id', v_location_id, 'rider_id', p_rider_id,
    'assignment_id', p_assignment_id, 'latitude', p_latitude,
    'longitude', p_longitude, 'accuracy_meters', p_accuracy_meters,
    'source', v_source, 'recorded_at', v_recorded_at
  );
end;
$$;

revoke all on function public.record_rider_location(uuid, uuid, numeric, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.record_rider_location(uuid, uuid, numeric, numeric, numeric, text)
  to service_role;

-- Becoming unavailable releases proposed/accepted work atomically while
-- preserving active, picked-up deliveries.
create or replace function public.set_rider_availability(p_rider_id uuid, p_is_available boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.assignments%rowtype;
  v_order public.orders%rowtype;
  v_rider public.riders%rowtype;
  v_released uuid[] := '{}'::uuid[];
  v_now timestamptz := now();
  v_previous_available boolean;
begin
  if p_is_available is null then
    raise exception 'Availability must be true or false.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_rider_id and role = 'rider' and is_active) then
    raise exception 'An active delivery partner account is required.' using errcode = '42501';
  end if;

  if not p_is_available then
    -- Lock every currently visible order first, matching lifecycle and scheduler
    -- order. The second pass after the advisory lock catches assignments that
    -- committed while this transaction was waiting for the rider coordinator.
    perform 1 from public.orders
    where id in (
      select order_id from public.assignments
      where rider_id = p_rider_id and is_current and status in ('proposed', 'accepted')
    ) order by id for update;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('routesync:rider-assignment:' || p_rider_id::text, 0)
  );

  if not p_is_available then
    perform 1 from public.orders
    where id in (
      select order_id from public.assignments
      where rider_id = p_rider_id and is_current and status in ('proposed', 'accepted')
    ) order by id for update;
    perform 1 from public.assignments
    where rider_id = p_rider_id and is_current and status in ('proposed', 'accepted')
    order by order_id, id for update;
  end if;

  select * into v_rider from public.riders where id = p_rider_id for update;
  if not found then
    raise exception 'The delivery partner profile is incomplete.' using errcode = '23514';
  end if;
  v_previous_available := v_rider.is_available;
  update public.riders set is_available = p_is_available, updated_at = v_now
  where id = p_rider_id returning * into v_rider;

  if not p_is_available then
    for v_assignment in
      select * from public.assignments
      where rider_id = p_rider_id and is_current and status in ('proposed', 'accepted') order by id
    loop
      select * into v_order from public.orders where id = v_assignment.order_id;
      update public.assignments
      set is_current = false, status = 'reassigned', reason = 'Rider became unavailable', updated_at = v_now
      where id = v_assignment.id;
      insert into public.assignment_events (assignment_id, from_status, to_status, actor_id, actor_role, reason, metadata)
      values (v_assignment.id, v_assignment.status, 'reassigned', p_rider_id, 'rider',
        'Rider became unavailable', jsonb_build_object('source', 'rider_availability'));
      update public.orders
      set status = case when status = 'assigned' then 'ready'::public.order_status else status end,
          updated_at = v_now
      where id = v_assignment.order_id and picked_up_at is null;
      if v_order.status = 'assigned' then
        insert into public.order_status_events (
          order_id, from_status, to_status, actor_id, actor_role, reason, metadata
        ) values (
          v_order.id, 'assigned', 'ready', p_rider_id, 'rider', 'Rider became unavailable',
          jsonb_build_object('source', 'rider_availability', 'released_assignment_id', v_assignment.id)
        );
      end if;
      if v_assignment.assigned_by is not null and v_assignment.assigned_by <> p_rider_id then
        insert into public.notifications (user_id, order_id, type, channel, title, body, metadata)
        values (
          v_assignment.assigned_by, v_order.id, 'assignment', 'in_app',
          'Delivery assignment released',
          format('The delivery partner became unavailable for order %s.', left(v_order.id::text, 8)),
          jsonb_build_object('source', 'rider_availability', 'assignment_id', v_assignment.id)
        );
      end if;
      insert into public.notifications (user_id, order_id, type, channel, title, body, metadata)
      values (
        v_order.customer_id, v_order.id, 'assignment', 'in_app',
        'Delivery partner is being updated',
        format('A new delivery partner will be assigned to order %s.', left(v_order.id::text, 8)),
        jsonb_build_object('source', 'rider_availability', 'released_assignment_id', v_assignment.id)
      );
      v_released := array_append(v_released, v_assignment.id);
    end loop;
  end if;
  if v_previous_available is distinct from p_is_available or cardinality(v_released) > 0 then
    insert into public.audit_logs (
      actor_id, actor_role, action, entity_type, entity_id, before_state, after_state, metadata
    ) values (
      p_rider_id, 'rider',
      case when v_previous_available is distinct from p_is_available
        then 'rider.availability_changed' else 'rider.availability_reconciled' end,
      'riders', p_rider_id::text,
      jsonb_build_object('is_available', v_previous_available),
      jsonb_build_object('is_available', p_is_available),
      jsonb_build_object('released_assignment_ids', to_jsonb(v_released))
    );
  end if;
  return jsonb_build_object('rider', to_jsonb(v_rider), 'released_assignment_ids', to_jsonb(v_released));
end;
$$;

revoke all on function public.set_rider_availability(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_rider_availability(uuid, boolean) to service_role;

-- Serialize overlap checks per rider so concurrent inserts cannot both pass.
create or replace function private.prevent_shift_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.rider_id::text, 0));
  if new.status in ('scheduled', 'active') and exists (
    select 1 from public.rider_shifts s
    where s.rider_id = new.rider_id
      and s.id is distinct from new.id
      and s.status in ('scheduled', 'active')
      and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'Rider shifts may not overlap.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Coordinate assignment creation with availability changes and lock the
-- selected shift in both persist_schedule passes. Exact occurrence checks make
-- this fail closed if a deployed definition differs from the applied sources.
do $$
declare
  v_definition text;
  v_assign_definition text;
  v_shift_old constant text := 'order by ends_at - make_interval(mins => break_minutes) desc limit 1;';
  v_shift_new constant text := 'order by ends_at - make_interval(mins => break_minutes) desc limit 1 for update;';
  v_riders_old constant text := '  perform 1 from public.riders
    where id in (select (value ->> ''rider_id'')::uuid from jsonb_array_elements(p_plan))
    order by id for update;';
  v_riders_new constant text := '  perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(''routesync:rider-assignment:'' || selected.id::text, 0))
    from (select distinct (value ->> ''rider_id'')::uuid as id from jsonb_array_elements(p_plan)) selected
    order by selected.id;
  perform 1 from public.riders
    where id in (select (value ->> ''rider_id'')::uuid from jsonb_array_elements(p_plan))
    order by id for update;';
  v_assign_old constant text := '  select * into v_rider
  from public.riders
  where id = p_rider_id
  for update;';
  v_assign_new constant text := '  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(''routesync:rider-assignment:'' || p_rider_id::text, 0)
  );
  select * into v_rider
  from public.riders
  where id = p_rider_id
  for update;';
begin
  select pg_get_functiondef('public.persist_schedule(uuid,text,uuid[],jsonb,jsonb,jsonb)'::regprocedure)
    into v_definition;
  if (length(v_definition) - length(replace(v_definition, v_shift_old, ''))) / length(v_shift_old) <> 2 then
    raise exception 'persist_schedule expected exactly two shift-lock targets.';
  end if;
  if (length(v_definition) - length(replace(v_definition, v_riders_old, ''))) / length(v_riders_old) <> 1 then
    raise exception 'persist_schedule expected exactly one rider-lock target.';
  end if;
  v_definition := replace(v_definition, v_shift_old, v_shift_new);
  v_definition := replace(v_definition, v_riders_old, v_riders_new);
  execute v_definition;

  select pg_get_functiondef('public.assign_rider(uuid,uuid,uuid,text,uuid)'::regprocedure)
    into v_assign_definition;
  if (length(v_assign_definition) - length(replace(v_assign_definition, v_assign_old, ''))) / length(v_assign_old) <> 1 then
    raise exception 'assign_rider expected exactly one rider-lock target.';
  end if;
  v_assign_definition := replace(v_assign_definition, v_assign_old, v_assign_new);
  execute v_assign_definition;
end;
$$;

revoke all on function public.persist_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb)
  to service_role;
revoke all on function public.assign_rider(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_rider(uuid, uuid, uuid, text, uuid)
  to service_role;

-- Enforce that assignments, routes and stops refer to the same rider/order.
-- Table-specific functions avoid missing-field access through a polymorphic NEW.
create or replace function private.validate_assignment_route()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and exists (
    select 1 from public.route_stops s where s.assignment_id = old.id
  ) and (new.order_id is distinct from old.order_id or new.route_id is distinct from old.route_id) then
    raise exception 'A routed assignment cannot change its order or route.' using errcode = '23514';
  end if;
  if new.route_id is not null then
    perform 1 from public.delivery_routes r
    where r.id = new.route_id and r.rider_id = new.rider_id
    for share;
    if not found then
      raise exception 'Assignment rider does not match its route.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.validate_route_stop_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assignment_id is not null then
    perform 1 from public.assignments a
    where a.id = new.assignment_id and a.route_id = new.route_id
      and a.order_id = new.order_id and a.is_current
    for share;
    if not found then
      raise exception 'Route stop does not match its assignment.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.validate_delivery_route_rider()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rider_id is distinct from old.rider_id and exists (
    select 1 from public.assignments a where a.route_id = old.id
  ) then
    raise exception 'A route with assignments cannot change riders.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger assignments_validate_route
  before insert or update of order_id, rider_id, route_id on public.assignments
  for each row execute function private.validate_assignment_route();
create trigger route_stops_validate_assignment
  before insert or update of route_id, order_id, assignment_id on public.route_stops
  for each row execute function private.validate_route_stop_assignment();
create trigger delivery_routes_validate_rider
  before update of rider_id on public.delivery_routes
  for each row execute function private.validate_delivery_route_rider();

-- Keep operational route records aligned with the current assignment only.
-- Separate trigger functions avoid referencing fields absent from either table.
create or replace function private.sync_order_route_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_route_id uuid;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select a.id, a.route_id into v_assignment_id, v_route_id
  from public.assignments a
  where a.order_id = new.id and a.is_current
    and a.status in ('proposed', 'accepted', 'active', 'completed')
  order by a.created_at desc, a.id
  limit 1;

  if v_assignment_id is null then
    return new;
  end if;

  if new.status = 'picked_up' then
    update public.route_stops
    set status = 'completed',
        actual_arrival = coalesce(actual_arrival, new.picked_up_at, now()),
        actual_departure = coalesce(actual_departure, new.picked_up_at, now()),
        updated_at = now()
    where assignment_id = v_assignment_id and stop_type = 'pickup'
      and status in ('pending', 'arrived');
    update public.delivery_routes set status = 'active', updated_at = now()
    where id = v_route_id and status = 'planned';
  elsif new.status = 'delivered' then
    update public.route_stops
    set status = 'completed',
        actual_arrival = coalesce(actual_arrival, new.delivered_at, now()),
        actual_departure = coalesce(actual_departure, new.delivered_at, now()),
        updated_at = now()
    where assignment_id = v_assignment_id and stop_type = 'dropoff'
      and status in ('pending', 'arrived');
    update public.delivery_routes r set status = 'completed', updated_at = now()
    where r.id = v_route_id and r.status in ('planned', 'active')
      and not exists (
        select 1 from public.route_stops s
        join public.assignments a on a.id = s.assignment_id
        where s.route_id = r.id and a.is_current
          and a.status in ('proposed', 'accepted', 'active')
          and s.status in ('pending', 'arrived')
      );
  elsif new.status in ('cancelled', 'rejected') then
    update public.route_stops set status = 'skipped', updated_at = now()
    where assignment_id = v_assignment_id and status in ('pending', 'arrived');
  end if;
  return new;
end;
$$;

create or replace function private.sync_assignment_route_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('rejected', 'cancelled', 'reassigned')
    and (old.status is distinct from new.status or old.is_current is distinct from new.is_current) then
    update public.route_stops set status = 'skipped', updated_at = now()
    where assignment_id = new.id and status in ('pending', 'arrived');
    if new.route_id is not null then
      update public.delivery_routes r
      set status = case
            when exists (
              select 1 from public.route_stops s
              where s.route_id = r.id and s.stop_type = 'dropoff' and s.status = 'completed'
            ) then 'completed'::public.route_status
            else 'cancelled'::public.route_status
          end,
          updated_at = now()
      where r.id = new.route_id and r.status in ('planned', 'active')
        and not exists (
          select 1 from public.assignments a
          where a.route_id = r.id and a.is_current
            and a.status in ('proposed', 'accepted', 'active')
        );
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_sync_route_lifecycle
  after update of status on public.orders
  for each row execute function private.sync_order_route_lifecycle();
create trigger assignments_sync_route_lifecycle
  after update of status, is_current on public.assignments
  for each row execute function private.sync_assignment_route_lifecycle();

-- Inactive sessions must not retain tenant access through direct Supabase RLS.
create or replace function private.owns_restaurant(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_role() = 'restaurant'::public.app_role and exists (
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.owner_id = auth.uid()
  );
$$;

create or replace function private.can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and (
      private.is_admin()
      or (private.current_role() = 'customer'::public.app_role and o.customer_id = auth.uid())
      or (private.current_role() = 'restaurant'::public.app_role and exists (
        select 1 from public.restaurants r where r.id = o.restaurant_id and r.owner_id = auth.uid()
      ))
      or (private.current_role() = 'rider'::public.app_role and exists (
        select 1 from public.assignments a
        where a.order_id = o.id and a.is_current and a.rider_id = auth.uid()
      ))
    )
  );
$$;

create or replace function private.can_operate_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and (
      private.is_admin()
      or (private.current_role() = 'restaurant'::public.app_role and exists (
        select 1 from public.restaurants r where r.id = o.restaurant_id and r.owner_id = auth.uid()
      ))
      or (private.current_role() = 'rider'::public.app_role and exists (
        select 1 from public.assignments a where a.order_id = o.id and a.is_current
          and a.rider_id = auth.uid() and a.status in ('proposed', 'accepted', 'active')
      ))
    )
  );
$$;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles for select to authenticated
  using ((id = auth.uid() and private.current_role() is not null) or private.is_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() and private.current_role() is not null)
  with check (id = auth.uid() and private.current_role() is not null);

drop policy if exists restaurants_owner_update on public.restaurants;
create policy restaurants_owner_update on public.restaurants for update to authenticated
  using (private.owns_restaurant(id) or private.is_admin())
  with check (private.owns_restaurant(id) or private.is_admin());

drop policy if exists customer_addresses_select_own on public.customer_addresses;
create policy customer_addresses_select_own on public.customer_addresses for select to authenticated
  using ((customer_id = auth.uid() and private.current_role() = 'customer') or private.is_admin());
drop policy if exists customer_addresses_insert_own on public.customer_addresses;
create policy customer_addresses_insert_own on public.customer_addresses for insert to authenticated
  with check ((customer_id = auth.uid() and private.current_role() = 'customer') or private.is_admin());
drop policy if exists customer_addresses_update_own on public.customer_addresses;
create policy customer_addresses_update_own on public.customer_addresses for update to authenticated
  using ((customer_id = auth.uid() and private.current_role() = 'customer') or private.is_admin())
  with check ((customer_id = auth.uid() and private.current_role() = 'customer') or private.is_admin());
drop policy if exists customer_addresses_delete_own on public.customer_addresses;
create policy customer_addresses_delete_own on public.customer_addresses for delete to authenticated
  using ((customer_id = auth.uid() and private.current_role() = 'customer') or private.is_admin());

drop policy if exists riders_select_own_or_admin on public.riders;
create policy riders_select_own_or_admin on public.riders for select to authenticated
  using ((id = auth.uid() and private.current_role() = 'rider') or private.is_admin());
drop policy if exists riders_update_own_or_admin on public.riders;
create policy riders_update_own_or_admin on public.riders for update to authenticated
  using ((id = auth.uid() and private.current_role() = 'rider') or private.is_admin())
  with check ((id = auth.uid() and private.current_role() = 'rider') or private.is_admin());
drop policy if exists rider_shifts_select_own_or_admin on public.rider_shifts;
create policy rider_shifts_select_own_or_admin on public.rider_shifts for select to authenticated
  using ((rider_id = auth.uid() and private.current_role() = 'rider') or private.is_admin());
drop policy if exists rider_locations_select_own_or_admin on public.rider_locations;
create policy rider_locations_select_own_or_admin on public.rider_locations for select to authenticated
  using ((rider_id = auth.uid() and private.current_role() = 'rider') or private.is_admin());

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using ((user_id = auth.uid() and private.current_role() is not null) or private.is_admin());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using ((user_id = auth.uid() and private.current_role() is not null) or private.is_admin())
  with check ((user_id = auth.uid() and private.current_role() is not null) or private.is_admin());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using ((user_id = auth.uid() and private.current_role() is not null) or private.is_admin());

create index if not exists rider_locations_assignment_time_idx
  on public.rider_locations (assignment_id, recorded_at desc);
create index if not exists rider_locations_recorded_at_idx
  on public.rider_locations (recorded_at desc);
create index if not exists assignments_order_created_idx
  on public.assignments (order_id, created_at desc);
