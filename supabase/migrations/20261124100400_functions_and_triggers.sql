-- RouteSync Phase 3 — trusted helpers, signup provisioning and integrity triggers.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Role is always read from the protected profiles table, never from user metadata.
create or replace function private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
  limit 1;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_role() = 'admin'::public.app_role, false);
$$;

create or replace function private.owns_restaurant(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurants r
    where r.id = p_restaurant_id
      and r.owner_id = auth.uid()
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
    select 1
    from public.orders o
    where o.id = p_order_id
      and (
        o.customer_id = auth.uid()
        or private.is_admin()
        or exists (
          select 1
          from public.restaurants r
          where r.id = o.restaurant_id
            and r.owner_id = auth.uid()
        )
        or exists (
          select 1
          from public.assignments a
          where a.order_id = o.id
            and a.is_current = true
            and a.rider_id = auth.uid()
        )
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
    select 1
    from public.orders o
    where o.id = p_order_id
      and (
        private.is_admin()
        or exists (
          select 1
          from public.restaurants r
          where r.id = o.restaurant_id
            and r.owner_id = auth.uid()
        )
        or exists (
          select 1
          from public.assignments a
          where a.order_id = o.id
            and a.is_current = true
            and a.rider_id = auth.uid()
            and a.status in ('proposed', 'accepted', 'active')
        )
      )
  );
$$;

-- Signup always creates a customer profile. Metadata cannot choose a role.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, email, full_name, phone)
  values (
    new.id,
    'customer'::public.app_role,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'customer'), '@', 1)
    ),
    new.phone
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function private.guard_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
    and auth.uid() is not null
    and coalesce(current_setting('app.allow_role_change', true), '') <> 'on'
  then
    raise exception 'Role changes require trusted server provisioning.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.prevent_shift_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('scheduled', 'active') then
    if exists (
      select 1
      from public.rider_shifts s
      where s.rider_id = new.rider_id
        and s.id is distinct from new.id
        and s.status in ('scheduled', 'active')
        and tstzrange(s.starts_at, s.ends_at, '[)')
            && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then
      raise exception 'Rider shifts may not overlap.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- Trusted role provisioning: admin session or service-role migration/seed.
create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role public.app_role,
  p_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.app_role := private.current_role();
  v_old_role public.app_role;
  v_result public.profiles;
begin
  if auth.role() is distinct from 'service_role' and not private.is_admin() then
    raise exception 'Not authorized to change roles.' using errcode = '42501';
  end if;

  if v_actor is not null and v_actor = p_user_id then
    raise exception 'Administrators cannot change their own role.' using errcode = '42501';
  end if;

  select role into v_old_role
  from public.profiles
  where id = p_user_id;

  if v_old_role is null then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  perform set_config('app.allow_role_change', 'on', true);

  update public.profiles
  set role = p_role, updated_at = now()
  where id = p_user_id
  returning * into v_result;

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id,
    before_state, after_state, metadata
  )
  values (
    v_actor, v_actor_role, 'profile.role_changed', 'profiles', p_user_id::text,
    jsonb_build_object('role', v_old_role),
    jsonb_build_object('role', p_role),
    jsonb_build_object('reason', p_reason)
  );

  return v_result;
end;
$$;

-- Authentication → customer profile provisioning.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Role changes to profiles are guarded even if column grants are misconfigured.
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function private.guard_profile_role();

-- Resource integrity: no overlapping active/scheduled rider shifts.
create trigger rider_shifts_prevent_overlap
  before insert or update on public.rider_shifts
  for each row execute function private.prevent_shift_overlap();

-- Keep timestamps in one place.
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger restaurants_set_updated_at before update on public.restaurants
  for each row execute function private.set_updated_at();
create trigger menu_categories_set_updated_at before update on public.menu_categories
  for each row execute function private.set_updated_at();
create trigger menu_items_set_updated_at before update on public.menu_items
  for each row execute function private.set_updated_at();
create trigger customer_addresses_set_updated_at before update on public.customer_addresses
  for each row execute function private.set_updated_at();
create trigger riders_set_updated_at before update on public.riders
  for each row execute function private.set_updated_at();
create trigger rider_shifts_set_updated_at before update on public.rider_shifts
  for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function private.set_updated_at();
create trigger delivery_routes_set_updated_at before update on public.delivery_routes
  for each row execute function private.set_updated_at();
create trigger assignments_set_updated_at before update on public.assignments
  for each row execute function private.set_updated_at();
create trigger route_stops_set_updated_at before update on public.route_stops
  for each row execute function private.set_updated_at();
