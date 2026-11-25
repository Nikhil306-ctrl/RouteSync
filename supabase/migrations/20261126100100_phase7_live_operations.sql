-- Phase 7: live operations.
-- Adds two trusted, service-role-only RPCs:
--   * report_prep_delay  — kitchen delay releases a not-yet-picked-up assignment
--                          so the Worker cron can reschedule the order.
--   * record_rider_location — validated rider location writes for live tracking.
-- No tables or RLS policies change in this migration.

-- ---------------------------------------------------------------------------
-- 1. Preparation delay + automatic rescheduling
-- ---------------------------------------------------------------------------

create or replace function public.report_prep_delay(
  p_order_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_delay_minutes integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_assignment public.assignments%rowtype;
  v_previous_ready timestamptz;
  v_ready timestamptz;
  v_now timestamptz := now();
  v_delay integer := coalesce(p_delay_minutes, 0);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_owner_id uuid;
  v_released boolean := false;
  v_next_status public.order_status;
  v_assignment_status public.assignment_status;
begin
  if v_delay < 1 or v_delay > 240 then
    raise exception 'Preparation delay must be between 1 and 240 minutes.' using errcode = '22023';
  end if;
  if p_actor_role not in ('restaurant', 'admin') then
    raise exception 'Only the restaurant or a dispatcher can report a preparation delay.'
      using errcode = '42501';
  end if;
  if v_reason is not null and length(v_reason) > 280 then
    raise exception 'The delay reason may not exceed 280 characters.' using errcode = '22023';
  end if;
  if p_actor_id is null then
    raise exception 'An authenticated actor is required.' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_actor_id and is_active = true;

  if not found then
    raise exception 'An active account is required.' using errcode = '42501';
  end if;
  if p_actor_role = 'admin' and v_profile.role <> 'admin' then
    raise exception 'Only a dispatcher can report a delay as an admin.' using errcode = '42501';
  end if;
  if p_actor_role = 'restaurant' and v_profile.role <> 'restaurant' then
    raise exception 'Only a restaurant can report a kitchen delay.' using errcode = '42501';
  end if;

  -- Order first, then assignment: matches the lock order used by every other
  -- lifecycle RPC and avoids deadlocks with dispatch reassignment.
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  select owner_id into v_owner_id
  from public.restaurants
  where id = v_order.restaurant_id;

  if p_actor_role = 'restaurant' and v_owner_id is distinct from p_actor_id then
    raise exception 'This order belongs to another restaurant.' using errcode = '42501';
  end if;

  if v_order.status not in ('confirmed', 'preparing', 'ready', 'assigned')
    or v_order.picked_up_at is not null then
    raise exception 'Only an order that has not been picked up can be delayed.'
      using errcode = '23514';
  end if;

  v_previous_ready := coalesce(v_order.estimated_ready_at, v_now);
  v_ready := greatest(v_now, v_previous_ready) + make_interval(mins => v_delay);

  -- Never move readiness past the promised window; the scheduler would reject
  -- the order and the customer would lose the delivery guarantee.
  if v_order.delivery_window_end is not null and v_ready > v_order.delivery_window_end then
    raise exception 'The revised preparation time falls outside the delivery window.'
      using errcode = '23514';
  end if;

  select * into v_assignment
  from public.assignments
  where order_id = p_order_id and is_current = true
  order by created_at desc
  limit 1
  for update;

  if found then
    if v_assignment.status in ('active', 'completed') then
      raise exception 'The order is already with a delivery partner; report the delay through support.'
        using errcode = '23514';
    end if;
    if v_assignment.status not in ('proposed', 'accepted') then
      raise exception 'The current assignment can no longer be released.'
        using errcode = '23514';
    end if;

    v_assignment_status := v_assignment.status;
    update public.assignments
    set is_current = false,
        status = 'reassigned',
        reason = coalesce(v_reason, 'Preparation delayed'),
        updated_at = v_now
    where id = v_assignment.id;

    insert into public.assignment_events (
      assignment_id, from_status, to_status, actor_id, actor_role, reason, metadata
    )
    values (
      v_assignment.id, v_assignment_status, 'reassigned', p_actor_id,
      p_actor_role::public.app_role, coalesce(v_reason, 'Preparation delayed'),
      jsonb_build_object(
        'source', 'prep_delay', 'order_id', p_order_id,
        'delay_minutes', v_delay, 'estimated_ready_at', v_ready
      )
    );

    v_released := true;
  end if;

  v_next_status := case
    when v_released and v_order.status = 'assigned' then 'ready'::public.order_status
    else v_order.status
  end;

  update public.orders
  set status = v_next_status,
      estimated_ready_at = v_ready,
      prep_time_minutes = greatest(
        1,
        least(
          240,
          ceil(
            extract(epoch from (v_ready - coalesce(v_order.restaurant_accepted_at, v_now))) / 60
          )::integer
        )
      ),
      updated_at = v_now
  where id = p_order_id;

  insert into public.order_status_events (
    order_id, from_status, to_status, actor_id, actor_role, reason, metadata
  )
  values (
    p_order_id, v_order.status, v_next_status, p_actor_id,
    p_actor_role::public.app_role, coalesce(v_reason, 'Preparation delayed'),
    jsonb_build_object(
      'source', 'prep_delay', 'delay_minutes', v_delay,
      'previous_estimated_ready_at', v_previous_ready,
      'estimated_ready_at', v_ready, 'assignment_released', v_released
    )
  );

  if v_released then
    if v_assignment.route_id is not null then
      update public.route_stops
      set status = 'skipped', updated_at = v_now
      where route_id = v_assignment.route_id
        and order_id = p_order_id
        and status = 'pending';

      -- Only retire the route once no other current assignment uses it.
      if not exists (
        select 1 from public.assignments
        where route_id = v_assignment.route_id and is_current = true
      ) then
        update public.delivery_routes
        set status = 'cancelled', updated_at = v_now
        where id = v_assignment.route_id and status in ('planned', 'active');
      end if;
    end if;

    insert into public.notifications (
      user_id, order_id, type, channel, title, body, metadata
    )
    values (
      v_assignment.rider_id, p_order_id, 'delay', 'in_app',
      'Order removed from your route',
      format('Order %s was delayed by the kitchen and will be reassigned.',
        left(p_order_id::text, 8)),
      jsonb_build_object(
        'assignment_id', v_assignment.id, 'source', 'prep_delay',
        'delay_minutes', v_delay
      )
    );
  end if;

  insert into public.notifications (
    user_id, order_id, type, channel, title, body, metadata
  )
  values (
    v_order.customer_id, p_order_id, 'delay', 'in_app',
    'Your order needs a little longer',
    format('The restaurant needs about %s more minutes before order %s is ready.',
      v_delay, left(p_order_id::text, 8)),
    jsonb_build_object(
      'source', 'prep_delay', 'delay_minutes', v_delay,
      'estimated_ready_at', v_ready
    )
  );

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id,
    before_state, after_state, metadata
  )
  values (
    p_actor_id, p_actor_role::public.app_role, 'order.prep_delay', 'orders',
    p_order_id::text,
    jsonb_build_object(
      'status', v_order.status, 'estimated_ready_at', v_order.estimated_ready_at
    ),
    jsonb_build_object(
      'status', v_next_status, 'estimated_ready_at', v_ready
    ),
    jsonb_build_object(
      'delay_minutes', v_delay, 'reason', v_reason,
      'released_assignment_id', case when v_released then v_assignment.id end
    )
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'previous_estimated_ready_at', v_previous_ready,
    'estimated_ready_at', v_ready,
    'delay_minutes', v_delay,
    'status', v_next_status,
    'released', v_released,
    'released_assignment_id', case when v_released then v_assignment.id end,
    'rescheduling_pending', v_released
  );
end;
$$;

revoke all on function public.report_prep_delay(uuid, uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.report_prep_delay(uuid, uuid, text, integer, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Rider location writes for live tracking
-- ---------------------------------------------------------------------------

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
  if p_latitude is null or p_longitude is null
    or p_latitude < -90 or p_latitude > 90
    or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Enter valid latitude and longitude.' using errcode = '22023';
  end if;
  if p_accuracy_meters is not null and (p_accuracy_meters < 0 or p_accuracy_meters > 100000) then
    raise exception 'Location accuracy is outside the accepted range.' using errcode = '22023';
  end if;
  if p_source not in ('gps', 'manual', 'simulated') then
    raise exception 'Choose a valid location source.' using errcode = '22023';
  end if;

  v_source := p_source::public.location_source;

  select * into v_profile
  from public.profiles
  where id = p_rider_id and is_active = true and role = 'rider';

  if not found then
    raise exception 'An active delivery partner account is required.' using errcode = '42501';
  end if;

  select * into v_rider
  from public.riders
  where id = p_rider_id
  for update;

  if not found then
    raise exception 'The delivery partner profile is incomplete.' using errcode = '23514';
  end if;
  if v_rider.verification_status in ('rejected', 'suspended') then
    raise exception 'This delivery partner account cannot share a location.'
      using errcode = '42501';
  end if;

  if p_assignment_id is not null then
    select * into v_assignment
    from public.assignments
    where id = p_assignment_id and rider_id = p_rider_id;

    if not found then
      raise exception 'This assignment belongs to another delivery partner.'
        using errcode = '42501';
    end if;
    if v_assignment.status in ('completed', 'cancelled', 'reassigned') then
      raise exception 'This assignment is no longer active.' using errcode = '23514';
    end if;
  end if;

  insert into public.rider_locations (
    rider_id, assignment_id, latitude, longitude, accuracy_meters, recorded_at, source
  )
  values (
    p_rider_id, p_assignment_id, p_latitude, p_longitude, p_accuracy_meters,
    v_recorded_at, v_source
  )
  returning id into v_location_id;

  update public.riders
  set current_latitude = p_latitude,
      current_longitude = p_longitude,
      last_location_at = v_recorded_at,
      updated_at = v_recorded_at
  where id = p_rider_id;

  return jsonb_build_object(
    'location_id', v_location_id,
    'rider_id', p_rider_id,
    'assignment_id', p_assignment_id,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'accuracy_meters', p_accuracy_meters,
    'source', v_source,
    'recorded_at', v_recorded_at
  );
end;
$$;

revoke all on function public.record_rider_location(uuid, uuid, numeric, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.record_rider_location(uuid, uuid, numeric, numeric, numeric, text)
  to service_role;
