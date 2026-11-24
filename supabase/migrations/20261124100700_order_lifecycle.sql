-- RouteSync Phase 5 — trusted order lifecycle.
--
-- Additive only: existing Phase 3 objects keep their meaning. New business
-- writes are restricted to SECURITY DEFINER functions that are callable by the
-- Worker service role after the Hono API has verified the caller's profile.
-- Browser clients keep read access through RLS and lose direct order/assignment
-- write grants.

-- ---------------------------------------------------------------------------
-- 1. Order lifecycle metadata
-- ---------------------------------------------------------------------------

alter table public.orders
  add column payment_method text not null default 'cash_on_delivery'
    check (payment_method in ('cash_on_delivery')),
  add column checkout_idempotency_key text,
  add column restaurant_accepted_at timestamptz,
  add column preparation_started_at timestamptz,
  add column ready_at timestamptz,
  add column picked_up_at timestamptz,
  add column delivered_at timestamptz,
  add column cancelled_at timestamptz,
  add column estimated_ready_at timestamptz;

create unique index orders_customer_idempotency_idx
  on public.orders (customer_id, checkout_idempotency_key)
  where checkout_idempotency_key is not null;

-- Existing demonstration rows may already be past these states. Backfill only
-- timestamps; no status is changed.
update public.orders
set ready_at = coalesce(ready_at, updated_at)
where status in ('ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered');

update public.orders
set picked_up_at = coalesce(picked_up_at, updated_at)
where status in ('picked_up', 'out_for_delivery', 'delivered');

update public.orders
set delivered_at = coalesce(delivered_at, updated_at)
where status = 'delivered';

update public.orders
set cancelled_at = coalesce(cancelled_at, updated_at)
where status in ('cancelled', 'rejected');

-- ---------------------------------------------------------------------------
-- 2. Status and assignment history
-- ---------------------------------------------------------------------------

create table public.order_status_events (
  id bigserial primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role public.app_role,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index order_status_events_order_idx
  on public.order_status_events (order_id, created_at, id);
create index order_status_events_created_idx
  on public.order_status_events (created_at desc);

create table public.assignment_events (
  id bigserial primary key,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  from_status public.assignment_status,
  to_status public.assignment_status not null,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role public.app_role,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index assignment_events_assignment_idx
  on public.assignment_events (assignment_id, created_at, id);
create index assignment_events_created_idx
  on public.assignment_events (created_at desc);

-- One current assignment per order already exists (Phase 3). Add an explicit
-- guard against two simultaneously active assignment records for one order.
create unique index assignments_one_active_per_order_idx
  on public.assignments (order_id)
  where status = 'active';

-- Backfill one timeline row per existing order so history is not invented by
-- the browser and older demonstration orders still render a timeline.
insert into public.order_status_events (
  order_id, from_status, to_status, actor_id, actor_role, reason, metadata, created_at
)
select
  o.id,
  null,
  o.status,
  null,
  null,
  'Backfilled from the existing order row.',
  jsonb_build_object('source', 'phase5_backfill'),
  o.created_at
from public.orders o
where not exists (
  select 1 from public.order_status_events e where e.order_id = o.id
);

alter table public.order_status_events enable row level security;
alter table public.assignment_events enable row level security;

create policy order_status_events_select_related
  on public.order_status_events for select to authenticated
  using (private.can_view_order(order_id));

create policy assignment_events_select_related
  on public.assignment_events for select to authenticated
  using (
    exists (
      select 1
      from public.assignments a
      where a.id = assignment_id
        and private.can_view_order(a.order_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Trusted helpers
-- ---------------------------------------------------------------------------

create or replace function private.restaurant_is_open(p_restaurant public.restaurants)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_restaurant.opening_time is null or p_restaurant.closing_time is null then true
    when p_restaurant.opening_time <= p_restaurant.closing_time then
      (now() at time zone 'Asia/Kolkata')::time >= p_restaurant.opening_time
      and (now() at time zone 'Asia/Kolkata')::time < p_restaurant.closing_time
    else
      (now() at time zone 'Asia/Kolkata')::time >= p_restaurant.opening_time
      or (now() at time zone 'Asia/Kolkata')::time < p_restaurant.closing_time
  end;
$$;

-- Flat, integer delivery pricing. Orders at or above INR 750 are delivered free.
create or replace function private.delivery_fee_minor(p_subtotal_minor integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_subtotal_minor >= 75000 then 0 else 3000 end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Server-side checkout quote
-- ---------------------------------------------------------------------------

create or replace function public.quote_order(
  p_customer_id uuid,
  p_restaurant_id uuid,
  p_address_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_address public.customer_addresses%rowtype;
  v_item public.menu_items%rowtype;
  v_entry jsonb;
  v_menu_id uuid;
  v_quantity integer;
  v_notes text;
  v_subtotal integer := 0;
  v_prep integer := 0;
  v_delivery_fee integer := 0;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_lines jsonb := '[]'::jsonb;
  v_line_count integer := 0;
  v_distinct_count integer := 0;
begin
  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
  then
    raise exception 'Add at least one menu item to the order.' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_customer_id and is_active = true;

  if not found or v_profile.role <> 'customer' then
    raise exception 'An active customer account is required.' using errcode = '42501';
  end if;

  select * into v_restaurant
  from public.restaurants
  where id = p_restaurant_id and is_active = true;

  if not found then
    raise exception 'This restaurant is not available.' using errcode = 'P0002';
  end if;

  if not private.restaurant_is_open(v_restaurant) then
    raise exception 'This restaurant is currently closed.' using errcode = '23514';
  end if;

  select * into v_address
  from public.customer_addresses
  where id = p_address_id and customer_id = p_customer_id;

  if not found then
    raise exception 'The delivery address does not belong to this customer.' using errcode = '42501';
  end if;

  select count(*), count(distinct entry ->> 'menu_item_id')
  into v_line_count, v_distinct_count
  from jsonb_array_elements(p_items) as entry;

  if v_line_count <> v_distinct_count then
    raise exception 'A menu item may appear only once per order.' using errcode = '22023';
  end if;

  for v_entry in select * from jsonb_array_elements(p_items)
  loop
    v_menu_id := nullif(trim(v_entry ->> 'menu_item_id'), '')::uuid;
    v_quantity := coalesce((v_entry ->> 'quantity')::integer, 0);
    v_notes := nullif(trim(coalesce(v_entry ->> 'notes', '')), '');

    if v_menu_id is null then
      raise exception 'Each order line must identify a menu item.' using errcode = '22023';
    end if;
    if v_quantity < 1 or v_quantity > 50 then
      raise exception 'Item quantities must be between 1 and 50.' using errcode = '22023';
    end if;
    if v_notes is not null and length(v_notes) > 280 then
      raise exception 'Item notes may not exceed 280 characters.' using errcode = '22023';
    end if;

    select * into v_item
    from public.menu_items
    where id = v_menu_id
      and restaurant_id = p_restaurant_id
      and is_available = true;

    if not found then
      raise exception 'A selected menu item is unavailable or belongs to another restaurant.'
        using errcode = '23514';
    end if;

    if v_item.category_id is not null and not exists (
      select 1
      from public.menu_categories c
      where c.id = v_item.category_id
        and c.restaurant_id = p_restaurant_id
        and c.is_active = true
    ) then
      raise exception 'A selected menu category is no longer available.' using errcode = '23514';
    end if;

    v_subtotal := v_subtotal + (v_item.price_minor * v_quantity);
    v_prep := greatest(v_prep, v_item.prep_time_minutes);

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'menu_item_id', v_item.id,
        'item_name', v_item.name,
        'unit_price_minor', v_item.price_minor,
        'quantity', v_quantity,
        'line_total_minor', v_item.price_minor * v_quantity,
        'notes', v_notes
      )
    );
  end loop;

  v_prep := greatest(v_prep, v_restaurant.default_prep_time_minutes);
  v_delivery_fee := private.delivery_fee_minor(v_subtotal);
  v_window_start := date_trunc('minute', now()) + make_interval(mins => v_prep + 10);
  v_window_end := v_window_start + interval '30 minutes';

  return jsonb_build_object(
    'restaurant_id', v_restaurant.id,
    'restaurant_name', v_restaurant.name,
    'restaurant_slug', v_restaurant.slug,
    'is_restaurant_open', true,
    'subtotal_minor', v_subtotal,
    'delivery_fee_minor', v_delivery_fee,
    'discount_minor', 0,
    'total_minor', v_subtotal + v_delivery_fee,
    'currency', 'INR',
    'prep_time_minutes', v_prep,
    'delivery_window_start', v_window_start,
    'delivery_window_end', v_window_end,
    'delivery_address_line', concat_ws(
      ', ',
      v_address.address_line1,
      v_address.address_line2,
      v_address.landmark,
      v_address.city,
      v_address.state,
      v_address.pincode
    ),
    'delivery_latitude', v_address.latitude,
    'delivery_longitude', v_address.longitude,
    'delivery_contact_phone', coalesce(v_address.phone, v_profile.phone),
    'items', v_lines,
    'payment_method', 'cash_on_delivery'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Atomic, idempotent order creation
-- ---------------------------------------------------------------------------

create or replace function public.create_order(
  p_customer_id uuid,
  p_restaurant_id uuid,
  p_address_id uuid,
  p_items jsonb,
  p_special_instructions text default null,
  p_idempotency_key text default null,
  p_payment_method text default 'cash_on_delivery'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.orders%rowtype;
  v_quote jsonb;
  v_order_id uuid;
  v_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_instructions text := nullif(trim(coalesce(p_special_instructions, '')), '');
  v_prep integer;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_item jsonb;
  v_owner_id uuid;
  v_customer_name text;
begin
  if coalesce(p_payment_method, 'cash_on_delivery') <> 'cash_on_delivery' then
    raise exception 'Only cash on delivery is supported in this phase.' using errcode = '22023';
  end if;

  if v_key is null or length(v_key) < 8 or length(v_key) > 120 then
    raise exception 'A valid checkout idempotency key is required.' using errcode = '22023';
  end if;

  if v_instructions is not null and length(v_instructions) > 280 then
    raise exception 'Delivery instructions may not exceed 280 characters.' using errcode = '22023';
  end if;

  -- Serialize retries for the same customer/key before checking for an existing
  -- order. The unique index remains the final guard.
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text || ':' || v_key, 0));

  select * into v_existing
  from public.orders
  where customer_id = p_customer_id
    and checkout_idempotency_key = v_key;

  if found then
    return jsonb_build_object(
      'order_id', v_existing.id,
      'status', v_existing.status,
      'duplicate', true
    );
  end if;

  v_quote := public.quote_order(p_customer_id, p_restaurant_id, p_address_id, p_items);

  v_prep := (v_quote ->> 'prep_time_minutes')::integer;
  v_window_start := (v_quote ->> 'delivery_window_start')::timestamptz;
  v_window_end := (v_quote ->> 'delivery_window_end')::timestamptz;

  select owner_id into v_owner_id
  from public.restaurants
  where id = p_restaurant_id;

  select full_name into v_customer_name
  from public.profiles
  where id = p_customer_id;

  insert into public.orders (
    customer_id, restaurant_id, delivery_address_id, status, priority,
    subtotal_minor, delivery_fee_minor, discount_minor, total_minor, currency,
    delivery_window_start, delivery_window_end, prep_time_minutes,
    delivery_address_line, delivery_latitude, delivery_longitude,
    delivery_contact_phone, special_instructions, payment_method,
    checkout_idempotency_key, estimated_ready_at
  )
  values (
    p_customer_id,
    p_restaurant_id,
    p_address_id,
    'pending'::public.order_status,
    'normal'::public.order_priority,
    (v_quote ->> 'subtotal_minor')::integer,
    (v_quote ->> 'delivery_fee_minor')::integer,
    (v_quote ->> 'discount_minor')::integer,
    (v_quote ->> 'total_minor')::integer,
    'INR',
    v_window_start,
    v_window_end,
    v_prep,
    v_quote ->> 'delivery_address_line',
    (v_quote ->> 'delivery_latitude')::numeric,
    (v_quote ->> 'delivery_longitude')::numeric,
    v_quote ->> 'delivery_contact_phone',
    v_instructions,
    'cash_on_delivery',
    v_key,
    now() + make_interval(mins => v_prep)
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(v_quote -> 'items')
  loop
    insert into public.order_items (
      order_id, menu_item_id, item_name, unit_price_minor, quantity, notes
    )
    values (
      v_order_id,
      (v_item ->> 'menu_item_id')::uuid,
      v_item ->> 'item_name',
      (v_item ->> 'unit_price_minor')::integer,
      (v_item ->> 'quantity')::integer,
      v_item ->> 'notes'
    );
  end loop;

  insert into public.order_status_events (
    order_id, from_status, to_status, actor_id, actor_role, metadata
  )
  values (
    v_order_id, null, 'pending'::public.order_status, p_customer_id,
    'customer'::public.app_role,
    jsonb_build_object('source', 'checkout', 'payment_method', 'cash_on_delivery')
  );

  insert into public.notifications (
    user_id, order_id, type, channel, title, body, metadata
  )
  values (
    v_owner_id,
    v_order_id,
    'order_status'::public.notification_type,
    'in_app'::public.notification_channel,
    'New order received',
    format('Order %s from %s is waiting for restaurant confirmation.',
      left(v_order_id::text, 8), coalesce(v_customer_name, 'a customer')),
    jsonb_build_object('status', 'pending', 'event', 'order.created')
  );

  insert into public.notifications (
    user_id, order_id, type, channel, title, body, metadata
  )
  values (
    p_customer_id,
    v_order_id,
    'order_status'::public.notification_type,
    'in_app'::public.notification_channel,
    'Order placed',
    format('Order %s was received by the restaurant. Payment is cash on delivery.',
      left(v_order_id::text, 8)),
    jsonb_build_object('status', 'pending', 'event', 'order.created')
  );

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, after_state, metadata
  )
  values (
    p_customer_id, 'customer'::public.app_role, 'order.created', 'orders',
    v_order_id::text,
    jsonb_build_object(
      'status', 'pending',
      'subtotal_minor', (v_quote ->> 'subtotal_minor')::integer,
      'delivery_fee_minor', (v_quote ->> 'delivery_fee_minor')::integer,
      'total_minor', (v_quote ->> 'total_minor')::integer
    ),
    jsonb_build_object('idempotency_key', v_key, 'payment_method', 'cash_on_delivery')
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'status', 'pending',
    'duplicate', false
  );
exception
  when unique_violation then
    select * into v_existing
    from public.orders
    where customer_id = p_customer_id
      and checkout_idempotency_key = v_key;

    if found then
      return jsonb_build_object(
        'order_id', v_existing.id,
        'status', v_existing.status,
        'duplicate', true
      );
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Explicit order status transition matrix
-- ---------------------------------------------------------------------------

create or replace function public.transition_order_status(
  p_order_id uuid,
  p_actor_id uuid,
  p_actor_role public.app_role,
  p_next public.order_status,
  p_expected_status public.order_status default null,
  p_reason text default null,
  p_prep_time_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_actor public.profiles%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_assignment public.assignments%rowtype;
  v_ready_assignment public.assignments%rowtype;
  v_affected_assignment public.assignments%rowtype;
  v_effective public.order_status := p_next;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_now timestamptz := now();
  v_prep integer;
  v_owner_id uuid;
  v_from public.order_status;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  if p_expected_status is not null and v_order.status <> p_expected_status then
    raise exception 'This order changed in another session. Refresh and try again.'
      using errcode = '40001';
  end if;

  select * into v_actor
  from public.profiles
  where id = p_actor_id and is_active = true;

  if not found or v_actor.role <> p_actor_role then
    raise exception 'An active account with the required role is needed.' using errcode = '42501';
  end if;

  select * into v_restaurant
  from public.restaurants
  where id = v_order.restaurant_id;

  if p_actor_role = 'customer' then
    if v_order.customer_id <> p_actor_id then
      raise exception 'This order does not belong to you.' using errcode = '42501';
    end if;
  elsif p_actor_role = 'restaurant' then
    if v_restaurant.owner_id <> p_actor_id then
      raise exception 'This order belongs to another restaurant.' using errcode = '42501';
    end if;
  elsif p_actor_role = 'rider' then
    select * into v_assignment
    from public.assignments
    where order_id = p_order_id
      and rider_id = p_actor_id
      and is_current = true
    for update;

    if not found then
      raise exception 'This order is not assigned to you.' using errcode = '42501';
    end if;
  elsif p_actor_role <> 'admin' then
    raise exception 'Unsupported order actor.' using errcode = '42501';
  end if;

  -- Read the current assignment after the order is locked. Other lifecycle
  -- RPCs also lock orders first, so this snapshot cannot change mid-transition.
  select * into v_affected_assignment
  from public.assignments
  where order_id = p_order_id and is_current = true
  limit 1;

  if v_reason is null and p_next in ('cancelled', 'rejected') then
    raise exception 'A cancellation or rejection reason is required.' using errcode = '22023';
  end if;

  v_from := v_order.status;

  if p_actor_role = 'customer' then
    if not (v_order.status in ('pending', 'confirmed') and p_next = 'cancelled') then
      raise exception 'Customers may cancel only before preparation starts.' using errcode = '23514';
    end if;
  elsif p_actor_role = 'restaurant' then
    if v_order.status = 'pending' and p_next = 'confirmed' then
      v_effective := 'confirmed';
    elsif v_order.status = 'pending' and p_next in ('rejected', 'cancelled') then
      v_effective := p_next;
    elsif v_order.status = 'confirmed' and p_next = 'preparing' then
      v_effective := 'preparing';
    elsif v_order.status = 'preparing' and p_next = 'ready' then
      v_effective := 'ready';
    elsif v_order.status in ('pending', 'confirmed', 'preparing', 'ready') and p_next = 'cancelled' then
      v_effective := 'cancelled';
    else
      raise exception 'The restaurant cannot apply that order transition.' using errcode = '23514';
    end if;
  elsif p_actor_role = 'admin' then
    if v_order.status = 'pending' and p_next in ('confirmed', 'rejected', 'cancelled') then
      v_effective := p_next;
    elsif v_order.status in ('confirmed', 'preparing', 'ready', 'assigned') and p_next = 'cancelled' then
      v_effective := 'cancelled';
    else
      raise exception 'The dispatcher cannot apply that order transition.' using errcode = '23514';
    end if;
  elsif p_actor_role = 'rider' then
    if v_order.status in ('ready', 'assigned') and p_next = 'picked_up' then
      if v_order.ready_at is null then
        raise exception 'Pickup is blocked until the restaurant marks the order ready.'
          using errcode = '23514';
      end if;
      if v_assignment.status not in ('accepted', 'active') then
        raise exception 'Accept the assignment before confirming pickup.' using errcode = '23514';
      end if;
      v_effective := 'picked_up';
    elsif v_order.status = 'picked_up' and p_next = 'out_for_delivery' then
      v_effective := 'out_for_delivery';
    elsif v_order.status = 'out_for_delivery' and p_next = 'delivered' then
      v_effective := 'delivered';
    else
      raise exception 'The delivery partner cannot apply that order transition.' using errcode = '23514';
    end if;
  end if;

  if p_actor_role = 'restaurant' and p_next = 'confirmed' then
    v_prep := coalesce(p_prep_time_minutes, v_order.prep_time_minutes);
    if v_prep < 1 or v_prep > 240 then
      raise exception 'Preparation time must be between 1 and 240 minutes.' using errcode = '22023';
    end if;
  else
    v_prep := v_order.prep_time_minutes;
  end if;

  -- If a rider has already accepted, a ready order becomes "assigned" at once.
  if p_actor_role = 'restaurant' and p_next = 'ready' then
    select * into v_ready_assignment
    from public.assignments
    where order_id = p_order_id
      and is_current = true
      and status in ('accepted', 'active')
    limit 1;

    if found then
      v_effective := 'assigned';
    end if;
  end if;

  update public.orders
  set
    status = v_effective,
    prep_time_minutes = v_prep,
    restaurant_accepted_at = case
      when v_effective = 'confirmed' then coalesce(restaurant_accepted_at, v_now)
      else restaurant_accepted_at end,
    preparation_started_at = case
      when v_effective = 'preparing' then coalesce(preparation_started_at, v_now)
      else preparation_started_at end,
    ready_at = case
      when v_effective in ('ready', 'assigned') then coalesce(ready_at, v_now)
      else ready_at end,
    picked_up_at = case
      when v_effective = 'picked_up' then coalesce(picked_up_at, v_now)
      else picked_up_at end,
    delivered_at = case
      when v_effective = 'delivered' then coalesce(delivered_at, v_now)
      else delivered_at end,
    cancelled_at = case
      when v_effective in ('cancelled', 'rejected') then coalesce(cancelled_at, v_now)
      else cancelled_at end,
    cancellation_reason = case
      when v_effective in ('cancelled', 'rejected') then v_reason
      else cancellation_reason end,
    estimated_ready_at = case
      when v_effective = 'confirmed' then v_now + make_interval(mins => v_prep)
      else estimated_ready_at end
  where id = p_order_id;

  if v_effective = 'picked_up' and v_assignment.id is not null then
    update public.assignments
    set status = 'active',
        accepted_at = coalesce(accepted_at, v_now)
    where id = v_assignment.id;

    insert into public.assignment_events (
      assignment_id, from_status, to_status, actor_id, actor_role, metadata
    )
    values (
      v_assignment.id, v_assignment.status, 'active', p_actor_id, p_actor_role,
      jsonb_build_object('source', 'rider.pickup', 'order_status', v_effective)
    );
  elsif v_effective = 'delivered' and v_assignment.id is not null then
    update public.assignments
    set status = 'completed',
        completed_at = v_now
    where id = v_assignment.id;

    insert into public.assignment_events (
      assignment_id, from_status, to_status, actor_id, actor_role, metadata
    )
    values (
      v_assignment.id, v_assignment.status, 'completed', p_actor_id, p_actor_role,
      jsonb_build_object('source', 'rider.delivered', 'order_status', v_effective)
    );
  end if;

  if v_effective in ('cancelled', 'rejected') and v_affected_assignment.id is not null then
    update public.assignments
    set status = 'cancelled'
    where id = v_affected_assignment.id
      and status in ('proposed', 'accepted', 'active');

    if found then
      insert into public.assignment_events (
        assignment_id, from_status, to_status, actor_id, actor_role, reason, metadata
      )
      values (
        v_affected_assignment.id, v_affected_assignment.status, 'cancelled',
        p_actor_id, p_actor_role, v_reason,
        jsonb_build_object('source', 'order.cancelled', 'order_status', v_effective)
      );
    end if;
  end if;

  if p_actor_role = 'restaurant' and p_next = 'ready' and v_effective = 'assigned' then
    insert into public.order_status_events (
      order_id, from_status, to_status, actor_id, actor_role, metadata
    )
    values (
      p_order_id, v_from, 'ready'::public.order_status, p_actor_id, p_actor_role,
      jsonb_build_object('source', 'restaurant')
    );

    insert into public.order_status_events (
      order_id, from_status, to_status, actor_id, actor_role, metadata
    )
    values (
      p_order_id, 'ready'::public.order_status, 'assigned'::public.order_status,
      p_actor_id, p_actor_role,
      jsonb_build_object('source', 'accepted_assignment')
    );
  else
    insert into public.order_status_events (
      order_id, from_status, to_status, actor_id, actor_role, reason, metadata
    )
    values (
      p_order_id, v_from, v_effective, p_actor_id, p_actor_role, v_reason,
      jsonb_build_object('source', 'trusted_api')
    );
  end if;

  select owner_id into v_owner_id
  from public.restaurants
  where id = v_order.restaurant_id;

  if v_order.customer_id <> p_actor_id then
    insert into public.notifications (
      user_id, order_id, type, channel, title, body, metadata
    )
    values (
      v_order.customer_id, p_order_id, 'order_status', 'in_app',
      format('Order %s updated', left(p_order_id::text, 8)),
      format('Your order is now %s.', replace(v_effective::text, '_', ' ')),
      jsonb_build_object('status', v_effective, 'previous_status', v_from)
    );
  end if;

  if v_owner_id <> p_actor_id then
    insert into public.notifications (
      user_id, order_id, type, channel, title, body, metadata
    )
    values (
      v_owner_id, p_order_id, 'order_status', 'in_app',
      format('Order %s updated', left(p_order_id::text, 8)),
      format('The order is now %s.', replace(v_effective::text, '_', ' ')),
      jsonb_build_object('status', v_effective, 'previous_status', v_from)
    );
  end if;

  if p_actor_role = 'restaurant' and p_next = 'ready' and v_ready_assignment.id is not null then
    insert into public.notifications (
      user_id, order_id, type, channel, title, body, metadata
    )
    values (
      v_ready_assignment.rider_id, p_order_id, 'assignment', 'in_app',
      'Order ready for pickup',
      format('Order %s is ready. You can now begin the delivery.', left(p_order_id::text, 8)),
      jsonb_build_object('assignment_id', v_ready_assignment.id, 'status', v_effective)
    );
  end if;

  if v_effective in ('cancelled', 'rejected')
    and v_affected_assignment.id is not null
    and v_affected_assignment.rider_id <> p_actor_id
  then
    insert into public.notifications (
      user_id, order_id, type, channel, title, body, metadata
    )
    values (
      v_affected_assignment.rider_id, p_order_id, 'assignment', 'in_app',
      'Delivery cancelled',
      format('Order %s was cancelled. No pickup is required.', left(p_order_id::text, 8)),
      jsonb_build_object('assignment_id', v_affected_assignment.id, 'status', 'cancelled')
    );
  end if;

  if v_assignment.id is not null and v_assignment.rider_id <> p_actor_id then
    insert into public.notifications (
      user_id, order_id, type, channel, title, body, metadata
    )
    values (
      v_assignment.rider_id, p_order_id, 'order_status', 'in_app',
      format('Delivery %s updated', left(p_order_id::text, 8)),
      format('The order is now %s.', replace(v_effective::text, '_', ' ')),
      jsonb_build_object('status', v_effective, 'previous_status', v_from)
    );
  end if;

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id,
    before_state, after_state, metadata
  )
  values (
    p_actor_id, p_actor_role, 'order.status_changed', 'orders', p_order_id::text,
    jsonb_build_object('status', v_from),
    jsonb_build_object('status', v_effective),
    jsonb_build_object('reason', v_reason, 'requested_status', p_next)
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'from_status', v_from,
    'status', v_effective,
    'previous_status', v_from
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Atomic manual rider assignment and controlled reassignment
-- ---------------------------------------------------------------------------

create or replace function public.assign_rider(
  p_order_id uuid,
  p_rider_id uuid,
  p_assigned_by uuid,
  p_reason text default null,
  p_expected_assignment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_admin public.profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_rider public.riders%rowtype;
  v_shift public.rider_shifts%rowtype;
  v_current public.assignments%rowtype;
  v_new public.assignments%rowtype;
  v_load integer := 0;
  v_now timestamptz := now();
  -- Phase 5 uses provisional timing until Phase 6 introduces route optimisation.
  v_dispatch_minutes constant integer := 5;
  v_travel_minutes constant integer := 25;
  v_pickup timestamptz;
  v_delivery timestamptz;
  v_restore_ready boolean := false;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  if v_order.status not in ('confirmed', 'preparing', 'ready', 'assigned') then
    if v_order.status in ('picked_up', 'out_for_delivery', 'delivered') then
      raise exception 'Assignments cannot be changed after pickup.' using errcode = '23514';
    end if;
    raise exception 'Orders can be assigned only after restaurant acceptance and before pickup.'
      using errcode = '23514';
  end if;

  select * into v_admin
  from public.profiles
  where id = p_assigned_by and is_active = true and role = 'admin';

  if not found then
    raise exception 'An active dispatcher account is required.' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_rider_id and is_active = true;

  if not found or v_profile.role <> 'rider' then
    raise exception 'The selected rider is not an active delivery partner.' using errcode = '23514';
  end if;

  -- Lock the rider row so concurrent dispatchers cannot both count the same
  -- free slot and exceed max_concurrent_orders on different orders.
  select * into v_rider
  from public.riders
  where id = p_rider_id
  for update;

  if not found then
    raise exception 'The selected rider has no delivery partner record.' using errcode = '23514';
  end if;

  if v_rider.verification_status <> 'verified' then
    raise exception 'The selected rider is not verified.' using errcode = '23514';
  end if;

  if not v_rider.is_available then
    raise exception 'The selected rider is currently unavailable.' using errcode = '23514';
  end if;

  select * into v_shift
  from public.rider_shifts
  where rider_id = p_rider_id
    and status in ('scheduled', 'active')
    and starts_at <= v_now
    and ends_at > v_now
  order by starts_at desc
  limit 1;

  if not found then
    raise exception 'The selected rider has no active shift covering the current time.'
      using errcode = '23514';
  end if;

  select * into v_current
  from public.assignments
  where order_id = p_order_id and is_current = true
  limit 1;

  if found then
    if p_expected_assignment_id is null or p_expected_assignment_id <> v_current.id then
      raise exception 'The current assignment changed. Refresh before reassigning.'
        using errcode = '40001';
    end if;

    if v_current.rider_id = p_rider_id
      and v_current.status in ('proposed', 'accepted', 'active')
    then
      return jsonb_build_object(
        'assignment_id', v_current.id,
        'status', v_current.status,
        'replaced_assignment_id', null,
        'duplicate', true
      );
    end if;
  elsif p_expected_assignment_id is not null then
    raise exception 'The current assignment changed. Refresh before assigning.'
      using errcode = '40001';
  end if;

  if v_current.id is not null and v_current.status in ('active', 'completed') then
    raise exception 'Assignments cannot be replaced after pickup.' using errcode = '23514';
  end if;

  -- An assigned order must always have an accepted current rider. When an
  -- accepted assignment is replaced before pickup, return the order to ready
  -- until the replacement rider accepts.
  if v_current.id is not null
    and v_current.status = 'accepted'
    and v_order.status = 'assigned'
  then
    v_restore_ready := true;
  end if;

  select count(*) into v_load
  from public.assignments a
  join public.orders o on o.id = a.order_id
  where a.rider_id = p_rider_id
    and a.is_current = true
    and a.status in ('proposed', 'accepted', 'active')
    and a.order_id <> p_order_id
    and o.status not in ('delivered', 'cancelled', 'rejected');

  if v_load >= v_rider.max_concurrent_orders then
    raise exception 'The selected rider is at capacity (% of % active orders).',
      v_load, v_rider.max_concurrent_orders
      using errcode = '23514';
  end if;

  v_pickup := greatest(
    v_now + make_interval(mins => v_dispatch_minutes),
    coalesce(v_order.estimated_ready_at, v_order.delivery_window_start - interval '15 minutes')
  );

  -- Provisional Phase 5 travel estimate: 25 minutes from pickup to delivery.
  -- The plan is never later than the delivery window; an infeasible window is
  -- rejected instead of storing an impossible planned delivery time.
  v_delivery := greatest(
    v_pickup + make_interval(mins => v_travel_minutes),
    v_order.delivery_window_start
  );

  if v_delivery > v_order.delivery_window_end then
    raise exception 'The planned delivery % falls outside the delivery window ending %.',
      v_delivery, v_order.delivery_window_end
      using errcode = '23514';
  end if;

  if v_shift.ends_at < v_delivery then
    raise exception 'The selected rider shift ends before the planned delivery.' using errcode = '23514';
  end if;

  if v_current.id is not null then
    update public.assignments
    set is_current = false,
        status = 'reassigned',
        reason = coalesce(v_reason, 'Reassigned by dispatcher')
    where id = v_current.id;
  end if;

  insert into public.assignments (
    order_id, rider_id, status, is_current, assigned_by, assigned_at,
    planned_pickup_at, planned_delivery_at, reason
  )
  values (
    p_order_id, p_rider_id, 'proposed', true, p_assigned_by, v_now,
    v_pickup, v_delivery, v_reason
  )
  returning * into v_new;

  if v_current.id is not null then
    update public.assignments
    set replaced_by_assignment_id = v_new.id
    where id = v_current.id;
  end if;

  insert into public.assignment_events (
    assignment_id, from_status, to_status, actor_id, actor_role, reason, metadata
  )
  values (
    v_new.id, null, 'proposed', p_assigned_by, 'admin', v_reason,
    jsonb_build_object(
      'source', 'dispatcher',
      'replaced_assignment_id', v_current.id,
      'planned_pickup_at', v_pickup,
      'planned_delivery_at', v_delivery
    )
  );

  if v_current.id is not null then
    insert into public.assignment_events (
      assignment_id, from_status, to_status, actor_id, actor_role, reason, metadata
    )
    values (
      v_current.id, v_current.status, 'reassigned', p_assigned_by, 'admin',
      coalesce(v_reason, 'Reassigned by dispatcher'),
      jsonb_build_object('source', 'dispatcher', 'replacement_assignment_id', v_new.id)
    );

    insert into public.notifications (
      user_id, order_id, type, channel, title, body, metadata
    )
    values (
      v_current.rider_id, p_order_id, 'assignment', 'in_app',
      'Assignment replaced',
      format('Order %s was reassigned to another delivery partner.', left(p_order_id::text, 8)),
      jsonb_build_object(
        'assignment_id', v_current.id,
        'replacement_assignment_id', v_new.id,
        'status', 'reassigned'
      )
    );
  end if;

  if v_restore_ready then
    update public.orders
    set status = 'ready'
    where id = p_order_id and status = 'assigned';

    if found then
      insert into public.order_status_events (
        order_id, from_status, to_status, actor_id, actor_role, reason, metadata
      )
      values (
        p_order_id, 'assigned', 'ready', p_assigned_by, 'admin', v_reason,
        jsonb_build_object('source', 'assignment.reassigned')
      );
    end if;
  end if;

  insert into public.notifications (
    user_id, order_id, type, channel, title, body, metadata
  )
  values (
    p_rider_id, p_order_id, 'assignment', 'in_app',
    'New delivery assignment',
    format('Order %s is ready for you to review. Accept it to begin the delivery.',
      left(p_order_id::text, 8)),
    jsonb_build_object('assignment_id', v_new.id, 'status', 'proposed')
  );

  insert into public.notifications (
    user_id, order_id, type, channel, title, body, metadata
  )
  values (
    v_order.customer_id, p_order_id, 'assignment', 'in_app',
    'Delivery partner requested',
    format('A delivery partner has been requested for order %s.', left(p_order_id::text, 8)),
    jsonb_build_object('assignment_id', v_new.id, 'status', 'proposed')
  );

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id,
    before_state, after_state, metadata
  )
  values (
    p_assigned_by, 'admin', 'assignment.created', 'assignments', v_new.id::text,
    jsonb_build_object('assignment_id', v_current.id, 'status', v_current.status),
    jsonb_build_object('assignment_id', v_new.id, 'rider_id', p_rider_id, 'status', 'proposed'),
    jsonb_build_object('order_id', p_order_id, 'reason', v_reason)
  );

  return jsonb_build_object(
    'assignment_id', v_new.id,
    'status', 'proposed',
    'replaced_assignment_id', v_current.id,
    'duplicate', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Rider acceptance / rejection
-- ---------------------------------------------------------------------------

create or replace function public.respond_assignment(
  p_assignment_id uuid,
  p_rider_id uuid,
  p_accept boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.assignments%rowtype;
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_rider public.riders%rowtype;
  v_shift public.rider_shifts%rowtype;
  v_order_id uuid;
  v_load integer := 0;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_now timestamptz := now();
begin
  if p_accept is null then
    raise exception 'Choose whether to accept or decline the assignment.' using errcode = '22023';
  end if;
  if not p_accept and v_reason is null then
    raise exception 'A reason is required when declining an assignment.' using errcode = '22023';
  end if;

  -- Resolve the order first, then lock it before the assignment. All other
  -- lifecycle RPCs lock orders before assignments; matching that order here
  -- avoids deadlocks with dispatch reassignment and cancellation.
  select order_id into v_order_id
  from public.assignments
  where id = p_assignment_id;

  if not found then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;

  select * into v_order
  from public.orders
  where id = v_order_id
  for update;

  select * into v_assignment
  from public.assignments
  where id = p_assignment_id
  for update;

  if v_assignment.rider_id <> p_rider_id then
    raise exception 'This assignment belongs to another delivery partner.' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_rider_id and is_active = true and role = 'rider';

  if not found then
    raise exception 'An active delivery partner account is required.' using errcode = '42501';
  end if;

  -- A repeated decline is idempotent even though rejection intentionally marks
  -- the assignment as no longer current. Ownership and input were checked above.
  if v_assignment.status = 'rejected' and not p_accept then
    return jsonb_build_object(
      'assignment_id', p_assignment_id, 'status', 'rejected', 'duplicate', true
    );
  end if;

  -- Every other response must still target the current assignment on an
  -- eligible, non-terminal order, including a repeated accept.
  if not v_assignment.is_current then
    raise exception 'This assignment is no longer current. Refresh before responding.'
      using errcode = '40001';
  end if;
  if v_order.status not in ('confirmed', 'preparing', 'ready', 'assigned') then
    raise exception 'This order can no longer be accepted for delivery.' using errcode = '23514';
  end if;

  if v_assignment.status = 'accepted' and p_accept then
    return jsonb_build_object(
      'assignment_id', p_assignment_id, 'status', 'accepted', 'duplicate', true
    );
  end if;
  if v_assignment.status <> 'proposed' then
    raise exception 'This assignment can no longer be accepted or rejected.' using errcode = '23514';
  end if;

  -- Declining must remain possible even if the rider has since gone offline;
  -- availability, verification, shift and capacity are revalidated on accept.
  if p_accept then
    -- Lock the rider after the order and assignment so capacity revalidation is
    -- serialised without changing the order-before-assignment lock order.
    select * into v_rider
    from public.riders
    where id = p_rider_id
    for update;

    if not found then
      raise exception 'The delivery partner has no rider record.' using errcode = '23514';
    end if;
    if v_rider.verification_status <> 'verified' then
      raise exception 'The delivery partner is not verified.' using errcode = '23514';
    end if;
    if not v_rider.is_available then
      raise exception 'The delivery partner is currently unavailable.' using errcode = '23514';
    end if;

    select * into v_shift
    from public.rider_shifts
    where rider_id = p_rider_id
      and status in ('scheduled', 'active')
      and starts_at <= v_now
      and ends_at > v_now
    order by starts_at desc
    limit 1;

    if not found then
      raise exception 'The delivery partner has no active shift covering the current time.'
        using errcode = '23514';
    end if;
    if v_assignment.planned_pickup_at is not null
      and v_shift.ends_at < v_assignment.planned_pickup_at
    then
      raise exception 'The delivery partner shift ends before the planned pickup.'
        using errcode = '23514';
    end if;
    if v_assignment.planned_delivery_at is not null
      and v_shift.ends_at < v_assignment.planned_delivery_at
    then
      raise exception 'The delivery partner shift ends before the planned delivery.'
        using errcode = '23514';
    end if;

    select count(*) into v_load
    from public.assignments a
    join public.orders o on o.id = a.order_id
    where a.rider_id = p_rider_id
      and a.is_current = true
      and a.status in ('proposed', 'accepted', 'active')
      and a.id <> p_assignment_id
      and o.status not in ('delivered', 'cancelled', 'rejected');

    if v_load >= v_rider.max_concurrent_orders then
      raise exception 'The delivery partner is at capacity (% of % active orders).',
        v_load, v_rider.max_concurrent_orders
        using errcode = '23514';
    end if;
  end if;

  if p_accept then
    update public.assignments
    set status = 'accepted', accepted_at = v_now
    where id = p_assignment_id;

    insert into public.assignment_events (
      assignment_id, from_status, to_status, actor_id, actor_role, metadata
    )
    values (
      p_assignment_id, 'proposed', 'accepted', p_rider_id, 'rider',
      jsonb_build_object('source', 'rider')
    );

    if v_order.status = 'ready' then
      update public.orders
      set status = 'assigned'
      where id = v_order.id;

      insert into public.order_status_events (
        order_id, from_status, to_status, actor_id, actor_role, metadata
      )
      values (
        v_order.id, 'ready', 'assigned', p_rider_id, 'rider',
        jsonb_build_object('source', 'assignment.accepted')
      );
    end if;

    insert into public.notifications (
      user_id, order_id, type, channel, title, body, metadata
    )
    values (
      v_order.customer_id, v_order.id, 'assignment', 'in_app',
      'Delivery partner accepted',
      format('A delivery partner accepted order %s.', left(v_order.id::text, 8)),
      jsonb_build_object('assignment_id', p_assignment_id, 'status', 'accepted')
    );

    insert into public.audit_logs (
      actor_id, actor_role, action, entity_type, entity_id,
      before_state, after_state, metadata
    )
    values (
      p_rider_id, 'rider', 'assignment.accepted', 'assignments', p_assignment_id::text,
      jsonb_build_object('status', 'proposed'),
      jsonb_build_object('status', 'accepted'),
      jsonb_build_object('order_id', v_order.id)
    );

    return jsonb_build_object('assignment_id', p_assignment_id, 'status', 'accepted');
  else
    update public.assignments
    set status = 'rejected',
        is_current = false,
        reason = coalesce(v_reason, reason)
    where id = p_assignment_id;

    insert into public.assignment_events (
      assignment_id, from_status, to_status, actor_id, actor_role, reason, metadata
    )
    values (
      p_assignment_id, 'proposed', 'rejected', p_rider_id, 'rider', v_reason,
      jsonb_build_object('source', 'rider')
    );

    if v_assignment.assigned_by is not null then
      insert into public.notifications (
        user_id, order_id, type, channel, title, body, metadata
      )
      values (
        v_assignment.assigned_by, v_order.id, 'assignment', 'in_app',
        'Assignment declined',
        format('A delivery partner declined order %s. Reassign it from dispatch.',
          left(v_order.id::text, 8)),
        jsonb_build_object('assignment_id', p_assignment_id, 'status', 'rejected')
      );
    end if;

    insert into public.audit_logs (
      actor_id, actor_role, action, entity_type, entity_id,
      before_state, after_state, metadata
    )
    values (
      p_rider_id, 'rider', 'assignment.rejected', 'assignments', p_assignment_id::text,
      jsonb_build_object('status', 'proposed'),
      jsonb_build_object('status', 'rejected'),
      jsonb_build_object('order_id', v_order.id, 'reason', v_reason)
    );

    return jsonb_build_object('assignment_id', p_assignment_id, 'status', 'rejected');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants and direct-write restrictions
-- ---------------------------------------------------------------------------

-- New history tables: read-only for signed-in users, trusted writes only.
revoke all on public.order_status_events from anon, authenticated;
revoke all on public.assignment_events from anon, authenticated;
grant select on public.order_status_events to authenticated;
grant select on public.assignment_events to authenticated;

grant select, insert, update, delete on public.order_status_events to service_role;
grant select, insert, update, delete on public.assignment_events to service_role;
grant usage, select on sequence public.order_status_events_id_seq to service_role;
grant usage, select on sequence public.assignment_events_id_seq to service_role;

-- Order, order-line, assignment and notification writes now go through the
-- Worker's verified service-role endpoints. A browser token can no longer forge
-- a status, total, order line, assignment or notification directly.
revoke insert, update, delete on public.orders from authenticated;
revoke insert, update, delete on public.order_items from authenticated;
revoke insert, update, delete on public.assignments from authenticated;
revoke insert on public.notifications from authenticated;

-- Phase 3 also granted UPDATE on two individual order columns. Column grants
-- are independent privileges, so revoke them explicitly even after the table
-- level REVOKE above. The read_at grant on notifications is intentionally kept.
revoke update (status, cancellation_reason) on public.orders from authenticated;

-- The trusted RPCs are not PostgREST endpoints for browser roles.
revoke all on function public.quote_order(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.create_order(uuid, uuid, uuid, jsonb, text, text, text)
  from public, anon, authenticated;
revoke all on function public.transition_order_status(
  uuid, uuid, public.app_role, public.order_status, public.order_status, text, integer
) from public, anon, authenticated;
revoke all on function public.assign_rider(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.respond_assignment(uuid, uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function public.quote_order(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.create_order(uuid, uuid, uuid, jsonb, text, text, text)
  to service_role;
grant execute on function public.transition_order_status(
  uuid, uuid, public.app_role, public.order_status, public.order_status, text, integer
) to service_role;
grant execute on function public.assign_rider(uuid, uuid, uuid, text, uuid) to service_role;
grant execute on function public.respond_assignment(uuid, uuid, boolean, text) to service_role;
grant execute on function private.restaurant_is_open(public.restaurants) to service_role;
grant execute on function private.delivery_fee_minor(integer) to service_role;
