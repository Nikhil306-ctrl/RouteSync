-- Phase 6: trusted, atomic CSP plan persistence. Apply after 20261124100700.
-- Geographic routes are estimates (18 km/h Haversine), not road navigation.
alter table public.assignments add column scheduling_explanation jsonb;

-- Existing Phase 3 table-level SELECT would expose explanations to every order
-- participant. Retain the prior public assignment fields, never the score.
revoke select on public.assignments from authenticated;
grant select (id, order_id, rider_id, route_id, scheduling_run_id, status, is_current,
  assigned_by, assigned_at, accepted_at, completed_at, planned_pickup_at,
  planned_delivery_at, replaced_by_assignment_id, reason, created_at, updated_at)
  on public.assignments to authenticated;
revoke insert, update, delete on public.delivery_routes from authenticated;
revoke insert, update, delete on public.route_stops from authenticated;
revoke insert, update, delete on public.scheduling_runs from authenticated;
revoke insert, update, delete on public.constraint_violations from authenticated;
grant update (is_resolved) on public.constraint_violations to authenticated;

create or replace function public.persist_schedule(
  p_actor_id uuid, p_source text, p_order_ids uuid[], p_plan jsonb,
  p_metrics jsonb, p_rejections jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_rider public.riders%rowtype;
  v_shift public.rider_shifts%rowtype;
  v_item jsonb;
  v_stop jsonb;
  v_id uuid;
  v_rider_id uuid;
  v_route_id uuid;
  v_assignment_id uuid;
  v_run_id uuid;
  v_load integer;
  v_count integer;
  v_sequence integer;
  v_last timestamptz;
  v_pickup timestamptz;
  v_delivery timestamptz;
  v_prev_lat numeric;
  v_prev_lon numeric;
  v_km double precision;
  v_total_km double precision;
  v_prev_time timestamptz;
  v_assigned uuid[] := '{}';
  v_unscheduled uuid[] := '{}';
  v_ids uuid[];
  v_seen_riders uuid[] := '{}';
  v_now timestamptz := clock_timestamp();
begin
  if p_source is null or p_source not in ('automatic', 'admin', 'manual')
     or jsonb_typeof(p_plan) is distinct from 'array'
     or jsonb_typeof(p_metrics) is distinct from 'object'
     or jsonb_typeof(p_rejections) is distinct from 'array'
     or p_order_ids is null or cardinality(p_order_ids) not between 1 and 30
     or array_position(p_order_ids, null) is not null
     or (select count(distinct id) from unnest(p_order_ids) id) <> cardinality(p_order_ids)
     or jsonb_array_length(p_plan) > 30 then
    raise exception 'Invalid scheduling request.' using errcode = '22023';
  end if;
  if p_actor_id is not null then
    select * into v_actor from public.profiles where id = p_actor_id and is_active;
    if not found or (p_source = 'automatic' and v_actor.role <> 'restaurant')
      or (p_source <> 'automatic' and v_actor.role <> 'admin') then
      raise exception 'Scheduling actor is not authorized.' using errcode = '42501';
    end if;
  else
    raise exception 'Scheduling actor is required.' using errcode = '42501';
  end if;
  -- All lifecycle writers lock the order before the rider. Sorting both sets
  -- avoids opposing batch lock cycles; override does not lock the old rider.
  perform 1 from public.orders where id = any(p_order_ids) order by id for update;
  -- Validate the *entire* request, including unscheduled IDs, before recording
  -- any run or violation. An override has already released its old assignment.
  foreach v_id in array p_order_ids loop
    select * into v_order from public.orders where id = v_id;
    if not found then raise exception 'Requested order does not exist.' using errcode = 'P0002'; end if;
    if v_order.status not in ('confirmed', 'preparing', 'ready') or v_order.picked_up_at is not null
       or v_order.delivery_latitude is null or v_order.delivery_longitude is null
       or v_order.estimated_ready_at is null or v_order.delivery_window_end <= v_now
       or v_order.estimated_ready_at >= v_order.delivery_window_end
       or exists (select 1 from public.assignments where order_id = v_id and is_current) then
      raise exception 'Requested order is not eligible for scheduling.' using errcode = '40001';
    end if;
    if not exists (select 1 from public.restaurants r where r.id = v_order.restaurant_id
      and r.latitude is not null and r.longitude is not null
      and (p_source <> 'automatic' or r.owner_id = p_actor_id)) then
      raise exception 'Restaurant location or ownership is invalid.' using errcode = '42501';
    end if;
  end loop;
  -- Do not let malformed route IDs reach the cast inside the locking query.
  for v_item in select value from jsonb_array_elements(p_plan) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or jsonb_typeof(v_item -> 'rider_id') is distinct from 'string'
      or (v_item ->> 'rider_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(v_item -> 'order_ids') is distinct from 'array'
      or jsonb_typeof(v_item -> 'stops') is distinct from 'array'
      or jsonb_typeof(v_item -> 'distance_meters') is distinct from 'number'
      or (v_item ->> 'distance_meters')::numeric < 0
      or jsonb_typeof(v_item -> 'score') is distinct from 'number'
      or (v_item ->> 'score')::numeric < 0
      or jsonb_typeof(v_item -> 'breakdown') is distinct from 'object' then
      raise exception 'Invalid route structure.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_item -> 'order_ids') as x(value)
      where jsonb_typeof(x.value) is distinct from 'string'
        or x.value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'Invalid route order ID.' using errcode = '22023';
    end if;
    for v_stop in select value from jsonb_array_elements(v_item -> 'stops') loop
      if jsonb_typeof(v_stop) is distinct from 'object'
        or jsonb_typeof(v_stop -> 'order_id') is distinct from 'string'
        or (v_stop ->> 'order_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(v_stop -> 'stop_type') is distinct from 'string'
        or (v_stop ->> 'stop_type') not in ('pickup', 'dropoff')
        or jsonb_typeof(v_stop -> 'planned_arrival') is distinct from 'string'
        or (v_stop ->> 'planned_arrival') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$'
        or jsonb_typeof(v_stop -> 'planned_departure') is distinct from 'string'
        or (v_stop ->> 'planned_departure') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$'
        or jsonb_typeof(v_stop -> 'latitude') is distinct from 'number'
        or jsonb_typeof(v_stop -> 'longitude') is distinct from 'number'
        or (v_stop ->> 'latitude')::numeric not between -90 and 90
        or (v_stop ->> 'longitude')::numeric not between -180 and 180
        or jsonb_typeof(v_stop -> 'address_line') is distinct from 'string'
        or nullif(trim(v_stop ->> 'address_line'), '') is null then
        raise exception 'Invalid route stop.' using errcode = '22023';
      end if;
    end loop;
  end loop;
  perform 1 from public.riders
    where id in (select (value ->> 'rider_id')::uuid from jsonb_array_elements(p_plan))
    order by id for update;

  for v_item in select value from jsonb_array_elements(p_plan) loop
    v_rider_id := (v_item ->> 'rider_id')::uuid;
    if v_rider_id = any(v_seen_riders) then
      raise exception 'Only one route per rider may be persisted per run.' using errcode = '22023';
    end if;
    v_seen_riders := array_append(v_seen_riders, v_rider_id);
    select * into v_rider from public.riders where id = v_rider_id;
    if not found or not v_rider.is_available or v_rider.verification_status <> 'verified'
      or v_rider.current_latitude is null or v_rider.current_longitude is null
      or not exists (select 1 from public.profiles where id = v_rider_id and role = 'rider' and is_active) then
      raise exception 'Rider is no longer eligible.' using errcode = '40001';
    end if;
    select * into v_shift from public.rider_shifts where rider_id = v_rider_id
      and status in ('scheduled', 'active') and starts_at <= v_now
      and ends_at - make_interval(mins => break_minutes) > v_now
      order by ends_at - make_interval(mins => break_minutes) desc limit 1;
    if not found then raise exception 'Shift is no longer eligible.' using errcode = '40001'; end if;
    select count(*) into v_load from public.assignments a join public.orders o on o.id = a.order_id
      where a.rider_id = v_rider_id and a.is_current and a.status in ('proposed', 'accepted', 'active')
      and o.status not in ('cancelled', 'rejected', 'delivered');
    v_count := jsonb_array_length(v_item -> 'order_ids');
    if v_count < 1 or v_count > 3 or v_load <> 0 or v_count > v_rider.max_concurrent_orders then
      raise exception 'Rider capacity or existing commitment changed.' using errcode = '40001';
    end if;
    v_ids := array(select jsonb_array_elements_text(v_item -> 'order_ids')::uuid);
    if array_position(v_ids, null) is not null or (select count(distinct x) from unnest(v_ids) x) <> v_count then
      raise exception 'Duplicate order in route.' using errcode = '22023'; end if;
    foreach v_id in array v_ids loop
      select * into v_order from public.orders where id = v_id;
      if not found or not (v_id = any(p_order_ids)) or v_id = any(v_assigned)
        or v_order.status not in ('confirmed', 'preparing', 'ready')
        or v_order.estimated_ready_at is null or v_order.delivery_latitude is null
        or exists (select 1 from public.assignments where order_id = v_id and is_current)
        or (p_source = 'automatic' and (v_actor.id is null or not exists
          (select 1 from public.restaurants where id = v_order.restaurant_id and owner_id = v_actor.id))) then
        raise exception 'Order is no longer eligible for scheduling.' using errcode = '40001';
      end if;
    end loop;
    v_sequence := 0; v_last := null; v_total_km := 0;
    v_prev_lat := v_rider.current_latitude; v_prev_lon := v_rider.current_longitude;
    v_prev_time := v_now;
    if jsonb_array_length(v_item -> 'stops') <> 2 * v_count then
      raise exception 'Route must include exactly two stops per order.' using errcode = '22023'; end if;
    for v_stop in select value from jsonb_array_elements(v_item -> 'stops') loop
      v_sequence := v_sequence + 1;
      v_id := (v_stop ->> 'order_id')::uuid;
      if not (v_id = any(v_ids)) or (v_stop ->> 'stop_type') not in ('pickup', 'dropoff') then
        raise exception 'Route stop does not belong to route.' using errcode = '22023'; end if;
      select * into v_order from public.orders where id = v_id;
      v_pickup := (v_stop ->> 'planned_arrival')::timestamptz;
      if v_pickup is null or v_pickup < v_prev_time or
        v_pickup > v_shift.ends_at - make_interval(mins => v_shift.break_minutes) then
        raise exception 'Route timing conflicts with shift.' using errcode = '40001'; end if;
      if v_stop ->> 'stop_type' = 'pickup' then
        if v_pickup < v_order.estimated_ready_at or not exists
          (select 1 from public.restaurants where id = v_order.restaurant_id
            and latitude is not null and longitude is not null) or
          (select count(*) from jsonb_array_elements(v_item -> 'stops') s where s ->> 'order_id' = v_id::text and s ->> 'stop_type' = 'pickup') <> 1 then
          raise exception 'Pickup readiness or location changed.' using errcode = '40001'; end if;
      else
        if not exists (select 1 from jsonb_array_elements(v_item -> 'stops') with ordinality s(value, n)
          where s.value ->> 'order_id' = v_id::text and s.value ->> 'stop_type' = 'pickup' and s.n < v_sequence)
          or v_pickup < v_order.delivery_window_start or v_pickup > v_order.delivery_window_end
          or (select count(*) from jsonb_array_elements(v_item -> 'stops') s where s ->> 'order_id' = v_id::text and s ->> 'stop_type' = 'dropoff') <> 1 then
          raise exception 'Delivery precedence or deadline changed.' using errcode = '40001'; end if;
      end if;
      -- Validate the stop coordinate against the current restaurant/order location.
      if (v_stop ->> 'latitude')::numeric is distinct from
          (case when v_stop ->> 'stop_type' = 'pickup' then (select latitude from public.restaurants where id = v_order.restaurant_id) else v_order.delivery_latitude end)
        or (v_stop ->> 'longitude')::numeric is distinct from
          (case when v_stop ->> 'stop_type' = 'pickup' then (select longitude from public.restaurants where id = v_order.restaurant_id) else v_order.delivery_longitude end) then
        raise exception 'Stop location changed.' using errcode = '40001'; end if;
      -- Great-circle lower bound; a planned leg may never be faster than the estimate.
      v_km := 12742 * asin(least(1, sqrt(power(sin(radians(((v_stop ->> 'latitude')::numeric - v_prev_lat)::double precision) / 2), 2)
        + cos(radians(v_prev_lat::double precision)) * cos(radians((v_stop ->> 'latitude')::double precision))
        * power(sin(radians(((v_stop ->> 'longitude')::numeric - v_prev_lon)::double precision) / 2), 2))));
      if v_pickup < v_prev_time + (v_km / 18 * interval '1 hour') - interval '2 seconds' then
        raise exception 'Route travel time is infeasible.' using errcode = '40001'; end if;
      v_total_km := v_total_km + v_km;
      v_prev_time := (v_stop ->> 'planned_departure')::timestamptz;
      if v_prev_time is null or v_prev_time < v_pickup + interval '2 minutes' or
        v_prev_time > v_shift.ends_at - make_interval(mins => v_shift.break_minutes) then
        raise exception 'Route stop service time is infeasible.' using errcode = '40001'; end if;
      v_prev_lat := (v_stop ->> 'latitude')::numeric;
      v_prev_lon := (v_stop ->> 'longitude')::numeric;
      v_last := v_prev_time;
    end loop;
    if abs(coalesce((v_item ->> 'distance_meters')::integer, -1) - round(v_total_km * 1000)) > 10 then
      raise exception 'Route distance does not match stops.' using errcode = '40001'; end if;
    v_assigned := v_assigned || v_ids;
  end loop;

  insert into public.scheduling_runs(requested_by, status, algorithm, input_snapshot, metrics, started_at, completed_at)
    values (p_actor_id, (case when cardinality(v_assigned) = 0 then 'infeasible' else 'completed' end)::public.run_status,
      'csp-backtracking-geographic-estimate', jsonb_build_object('order_ids', p_order_ids, 'source', p_source),
      p_metrics, now(), now()) returning id into v_run_id;

  for v_item in select value from jsonb_array_elements(p_plan) loop
    v_rider_id := (v_item ->> 'rider_id')::uuid;
    v_ids := array(select jsonb_array_elements_text(v_item -> 'order_ids')::uuid);
    select (s.value ->> 'planned_departure')::timestamptz into v_last
      from jsonb_array_elements(v_item -> 'stops') with ordinality s(value, n)
      order by s.n desc limit 1;
    select * into v_shift from public.rider_shifts where rider_id = v_rider_id and status in ('scheduled', 'active')
      and starts_at <= v_now and ends_at - make_interval(mins => break_minutes) > v_now
      order by ends_at - make_interval(mins => break_minutes) desc limit 1;
    insert into public.delivery_routes(rider_id, shift_id, scheduling_run_id, planned_start, planned_end, total_distance_meters, total_duration_seconds)
      values (v_rider_id, v_shift.id, v_run_id, now(), v_last, (v_item ->> 'distance_meters')::integer,
        extract(epoch from (v_last - now()))::integer) returning id into v_route_id;
    foreach v_id in array v_ids loop
      select * into v_order from public.orders where id = v_id;
      select (s.value ->> 'planned_arrival')::timestamptz into v_pickup from jsonb_array_elements(v_item -> 'stops') s
        where s.value ->> 'order_id' = v_id::text and s.value ->> 'stop_type' = 'pickup';
      select (s.value ->> 'planned_arrival')::timestamptz into v_delivery from jsonb_array_elements(v_item -> 'stops') s
        where s.value ->> 'order_id' = v_id::text and s.value ->> 'stop_type' = 'dropoff';
      insert into public.assignments(order_id, rider_id, route_id, scheduling_run_id, assigned_by, planned_pickup_at, planned_delivery_at, scheduling_explanation)
        values (v_id, v_rider_id, v_route_id, v_run_id, p_actor_id, v_pickup, v_delivery,
          jsonb_build_object('source', p_source, 'score', v_item -> 'score', 'breakdown', v_item -> 'breakdown', 'batch_size', cardinality(v_ids)))
        returning id into v_assignment_id;
      insert into public.assignment_events(assignment_id, to_status, actor_id, actor_role, metadata)
        values (v_assignment_id, 'proposed', p_actor_id, case when p_source = 'automatic' then 'restaurant'::public.app_role else 'admin'::public.app_role end,
          jsonb_build_object('source', p_source, 'run_id', v_run_id));
      insert into public.notifications(user_id, order_id, type, channel, title, body, metadata)
        values (v_rider_id, v_id, 'assignment', 'in_app', 'New delivery proposal',
          'Review and accept your planned delivery.', jsonb_build_object('assignment_id', v_assignment_id, 'run_id', v_run_id));
      insert into public.notifications(user_id, order_id, type, channel, title, body, metadata)
        values (v_order.customer_id, v_id, 'assignment', 'in_app', 'Delivery partner proposed',
          'A delivery partner has been asked to accept your order.', jsonb_build_object('assignment_id', v_assignment_id));
    end loop;
    v_sequence := 0;
    for v_stop in select value from jsonb_array_elements(v_item -> 'stops') loop
      v_sequence := v_sequence + 1;
      v_id := (v_stop ->> 'order_id')::uuid;
      insert into public.route_stops(route_id, order_id, assignment_id, stop_sequence, stop_type, planned_arrival, planned_departure, address_line, latitude, longitude)
        values (v_route_id, v_id, (select id from public.assignments where order_id = v_id and route_id = v_route_id),
          v_sequence, (v_stop ->> 'stop_type')::public.stop_type, (v_stop ->> 'planned_arrival')::timestamptz,
          (v_stop ->> 'planned_departure')::timestamptz, v_stop ->> 'address_line',
          (v_stop ->> 'latitude')::numeric, (v_stop ->> 'longitude')::numeric);
    end loop;
  end loop;
  for v_id in select distinct unnest(p_order_ids) loop
    if not (v_id = any(v_assigned)) and not exists (select 1 from public.assignments where order_id = v_id and is_current) then
      v_unscheduled := array_append(v_unscheduled, v_id);
      insert into public.constraint_violations(scheduling_run_id, order_id, constraint_type, message, details)
        values (v_run_id, v_id, 'no_feasible_assignment', 'No feasible rider and route were found.',
          jsonb_build_object('rejections', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(p_rejections) x where x ->> 'order_id' = v_id::text)));
    end if;
  end loop;
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, metadata)
    values (p_actor_id, case when p_source = 'automatic' then 'restaurant'::public.app_role else 'admin'::public.app_role end,
      'schedule.completed', 'scheduling_runs', v_run_id::text, jsonb_build_object('assigned', v_assigned, 'unscheduled', v_unscheduled));
  return jsonb_build_object('id', v_run_id, 'assigned', v_assigned, 'unscheduled', v_unscheduled);
end;
$$;

revoke all on function public.persist_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persist_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb) to service_role;

-- Controlled manual override releases an unpicked proposal/acceptance and
-- installs its replacement in the SAME transaction. Any failed validation
-- rolls the old assignment and order state back as well.
create or replace function public.override_schedule(
  p_actor_id uuid, p_source text, p_order_ids uuid[], p_plan jsonb,
  p_metrics jsonb, p_rejections jsonb, p_expected_assignment_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.assignments%rowtype;
  v_order public.orders%rowtype;
  v_result jsonb;
  v_new uuid;
begin
  if p_source is distinct from 'manual' or p_order_ids is null or cardinality(p_order_ids) <> 1
    or p_order_ids[1] is null or p_expected_assignment_id is null
    or jsonb_typeof(p_plan) is distinct from 'array' or jsonb_array_length(p_plan) <> 1
    or nullif(trim(coalesce(p_reason, '')), '') is null or length(p_reason) > 280 or
    not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active) then
    raise exception 'An authorized dispatcher and override reason are required.' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_ids[1] for update;
  select * into v_old from public.assignments
    where id = p_expected_assignment_id and order_id = p_order_ids[1] and is_current for update;
  if not found or v_old.status not in ('proposed', 'accepted') or
    v_order.status not in ('confirmed', 'preparing', 'ready', 'assigned') or v_order.picked_up_at is not null then
    raise exception 'The current assignment changed or pickup already occurred.' using errcode = '40001';
  end if;
  -- Releasing one stop from a shared route would leave its remaining stop
  -- sequence and distance misleading. Require an unshared route for override.
  if v_old.route_id is not null and exists (
    select 1 from public.assignments where route_id = v_old.route_id
      and id <> v_old.id and is_current
  ) then
    raise exception 'A batched route cannot be overridden individually.' using errcode = '23514';
  end if;
  if v_old.route_id is not null and exists (
    select 1 from public.delivery_routes where id = v_old.route_id and status <> 'planned'
  ) then
    raise exception 'Only planned routes may be overridden.' using errcode = '23514';
  end if;
  -- Do not lock the old rider: order -> assignment -> target rider matches
  -- Phase 5 response order and avoids old/new rider inversion across overrides.
  update public.assignments set is_current = false, status = 'reassigned', reason = p_reason
    where id = v_old.id;
  if v_old.status = 'accepted' and v_order.status = 'assigned' then
    update public.orders set status = 'ready' where id = v_order.id;
    insert into public.order_status_events(order_id, from_status, to_status, actor_id, actor_role, reason, metadata)
      values (v_order.id, 'assigned', 'ready', p_actor_id, 'admin', p_reason,
        jsonb_build_object('source', 'schedule.override'));
  end if;
  v_result := public.persist_schedule(p_actor_id, 'manual', p_order_ids, p_plan, p_metrics, p_rejections);
  select id into v_new from public.assignments where order_id = v_order.id
    and is_current and scheduling_run_id = (v_result ->> 'id')::uuid;
  if v_new is null then raise exception 'An override requires a feasible replacement.' using errcode = '23514'; end if;
  update public.assignments set replaced_by_assignment_id = v_new where id = v_old.id;
  insert into public.assignment_events(assignment_id, from_status, to_status, actor_id, actor_role, reason, metadata)
    values (v_old.id, v_old.status, 'reassigned', p_actor_id, 'admin', p_reason,
      jsonb_build_object('replacement_assignment_id', v_new));
  if v_old.route_id is not null and not exists
    (select 1 from public.assignments where route_id = v_old.route_id and is_current) then
    update public.delivery_routes set status = 'cancelled' where id = v_old.route_id and status = 'planned';
    update public.route_stops set status = 'skipped' where route_id = v_old.route_id and status = 'pending';
  end if;
  insert into public.notifications(user_id, order_id, type, channel, title, body, metadata)
    values (v_old.rider_id, v_order.id, 'assignment', 'in_app', 'Assignment replaced',
      'Dispatch reassigned this delivery.', jsonb_build_object('assignment_id', v_old.id, 'replacement_assignment_id', v_new));
  return v_result;
end;
$$;
revoke all on function public.override_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.override_schedule(uuid, text, uuid[], jsonb, jsonb, jsonb, uuid, text)
  to service_role;
