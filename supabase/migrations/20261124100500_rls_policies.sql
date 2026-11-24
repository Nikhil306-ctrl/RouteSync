-- RouteSync Phase 3 — row-level security for every application table.

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.riders enable row level security;
alter table public.rider_shifts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.assignments enable row level security;
alter table public.delivery_routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.rider_locations enable row level security;
alter table public.notifications enable row level security;
alter table public.scheduling_runs enable row level security;
alter table public.constraint_violations enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: own row or admin. Role changes only via trusted RPC/service.
create policy profiles_select_own_or_admin
  on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_admin());

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_update
  on public.profiles for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- Restaurants: public active catalogue; owners manage their own; admin manages all.
create policy restaurants_public_or_owner_select
  on public.restaurants for select to anon, authenticated
  using (is_active or owner_id = auth.uid() or private.is_admin());

create policy restaurants_admin_insert
  on public.restaurants for insert to authenticated
  with check (private.is_admin());

create policy restaurants_owner_update
  on public.restaurants for update to authenticated
  using (owner_id = auth.uid() or private.is_admin())
  with check (owner_id = auth.uid() or private.is_admin());

create policy restaurants_admin_delete
  on public.restaurants for delete to authenticated
  using (private.is_admin());

-- Menu categories: public for active restaurants, owner/admin otherwise.
create policy menu_categories_select
  on public.menu_categories for select to anon, authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id
        and (
          (r.is_active and menu_categories.is_active)
          or r.owner_id = auth.uid()
          or private.is_admin()
        )
    )
  );

create policy menu_categories_owner_insert
  on public.menu_categories for insert to authenticated
  with check (private.owns_restaurant(restaurant_id) or private.is_admin());

create policy menu_categories_owner_update
  on public.menu_categories for update to authenticated
  using (private.owns_restaurant(restaurant_id) or private.is_admin())
  with check (private.owns_restaurant(restaurant_id) or private.is_admin());

create policy menu_categories_owner_delete
  on public.menu_categories for delete to authenticated
  using (private.owns_restaurant(restaurant_id) or private.is_admin());

-- Menu items: public for active restaurants/items, owner/admin otherwise.
create policy menu_items_select
  on public.menu_items for select to anon, authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id
        and (
          (r.is_active and menu_items.is_available)
          or r.owner_id = auth.uid()
          or private.is_admin()
        )
    )
  );

create policy menu_items_owner_insert
  on public.menu_items for insert to authenticated
  with check (private.owns_restaurant(restaurant_id) or private.is_admin());

create policy menu_items_owner_update
  on public.menu_items for update to authenticated
  using (private.owns_restaurant(restaurant_id) or private.is_admin())
  with check (private.owns_restaurant(restaurant_id) or private.is_admin());

create policy menu_items_owner_delete
  on public.menu_items for delete to authenticated
  using (private.owns_restaurant(restaurant_id) or private.is_admin());

-- Customer addresses: strictly own rows.
create policy customer_addresses_select_own
  on public.customer_addresses for select to authenticated
  using (customer_id = auth.uid() or private.is_admin());

create policy customer_addresses_insert_own
  on public.customer_addresses for insert to authenticated
  with check (customer_id = auth.uid() or private.is_admin());

create policy customer_addresses_update_own
  on public.customer_addresses for update to authenticated
  using (customer_id = auth.uid() or private.is_admin())
  with check (customer_id = auth.uid() or private.is_admin());

create policy customer_addresses_delete_own
  on public.customer_addresses for delete to authenticated
  using (customer_id = auth.uid() or private.is_admin());

-- Riders: own resource row or admin. Capacity/verification are protected by grants.
create policy riders_select_own_or_admin
  on public.riders for select to authenticated
  using (id = auth.uid() or private.is_admin());

create policy riders_update_own_or_admin
  on public.riders for update to authenticated
  using (id = auth.uid() or private.is_admin())
  with check (id = auth.uid() or private.is_admin());

create policy riders_admin_insert
  on public.riders for insert to authenticated
  with check (private.is_admin());

create policy riders_admin_delete
  on public.riders for delete to authenticated
  using (private.is_admin());

-- Shifts: rider reads own; only admin writes.
create policy rider_shifts_select_own_or_admin
  on public.rider_shifts for select to authenticated
  using (rider_id = auth.uid() or private.is_admin());

create policy rider_shifts_admin_insert
  on public.rider_shifts for insert to authenticated
  with check (private.is_admin());

create policy rider_shifts_admin_update
  on public.rider_shifts for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy rider_shifts_admin_delete
  on public.rider_shifts for delete to authenticated
  using (private.is_admin());

-- Orders: customer/restaurant/rider relevant rows; server/admin writes.
create policy orders_select_related
  on public.orders for select to authenticated
  using (private.can_view_order(id));

create policy orders_admin_insert
  on public.orders for insert to authenticated
  with check (private.is_admin());

create policy orders_related_update
  on public.orders for update to authenticated
  using (private.can_operate_order(id))
  with check (private.can_operate_order(id));

create policy orders_admin_delete
  on public.orders for delete to authenticated
  using (private.is_admin());

-- Order lines follow parent-order visibility; creation is server/admin controlled.
create policy order_items_select_related
  on public.order_items for select to authenticated
  using (private.can_view_order(order_id));

create policy order_items_admin_insert
  on public.order_items for insert to authenticated
  with check (private.is_admin());

create policy order_items_admin_update
  on public.order_items for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy order_items_admin_delete
  on public.order_items for delete to authenticated
  using (private.is_admin());

-- Assignments and routes: read only to the affected customer/restaurant/rider.
create policy assignments_select_related
  on public.assignments for select to authenticated
  using (private.can_view_order(order_id));

create policy assignments_admin_insert
  on public.assignments for insert to authenticated
  with check (private.is_admin());

create policy assignments_admin_update
  on public.assignments for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy assignments_admin_delete
  on public.assignments for delete to authenticated
  using (private.is_admin());

create policy delivery_routes_select_rider_or_admin
  on public.delivery_routes for select to authenticated
  using (rider_id = auth.uid() or private.is_admin());

create policy delivery_routes_admin_insert
  on public.delivery_routes for insert to authenticated
  with check (private.is_admin());

create policy delivery_routes_admin_update
  on public.delivery_routes for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy delivery_routes_admin_delete
  on public.delivery_routes for delete to authenticated
  using (private.is_admin());

create policy route_stops_select_related
  on public.route_stops for select to authenticated
  using (private.can_view_order(order_id));

create policy route_stops_admin_insert
  on public.route_stops for insert to authenticated
  with check (private.is_admin());

create policy route_stops_admin_update
  on public.route_stops for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy route_stops_admin_delete
  on public.route_stops for delete to authenticated
  using (private.is_admin());

-- Location history: rider reads/writes own; admin manages.
create policy rider_locations_select_own_or_admin
  on public.rider_locations for select to authenticated
  using (rider_id = auth.uid() or private.is_admin());

create policy rider_locations_insert_own
  on public.rider_locations for insert to authenticated
  with check (
    private.is_admin()
    or (
      rider_id = auth.uid()
      and (
        assignment_id is null
        or exists (
          select 1 from public.assignments a
          where a.id = assignment_id
            and a.rider_id = auth.uid()
        )
      )
    )
  );

create policy rider_locations_admin_update
  on public.rider_locations for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy rider_locations_admin_delete
  on public.rider_locations for delete to authenticated
  using (private.is_admin());

-- Notifications: recipient sees and marks read; admin manages.
create policy notifications_select_own
  on public.notifications for select to authenticated
  using (user_id = auth.uid() or private.is_admin());

create policy notifications_update_own
  on public.notifications for update to authenticated
  using (user_id = auth.uid() or private.is_admin())
  with check (user_id = auth.uid() or private.is_admin());

create policy notifications_admin_insert
  on public.notifications for insert to authenticated
  with check (private.is_admin());

create policy notifications_delete_own
  on public.notifications for delete to authenticated
  using (user_id = auth.uid() or private.is_admin());

-- Scheduling and audit internals are admin-only.
create policy scheduling_runs_admin_select
  on public.scheduling_runs for select to authenticated
  using (private.is_admin());

create policy scheduling_runs_admin_insert
  on public.scheduling_runs for insert to authenticated
  with check (private.is_admin());

create policy scheduling_runs_admin_update
  on public.scheduling_runs for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy scheduling_runs_admin_delete
  on public.scheduling_runs for delete to authenticated
  using (private.is_admin());

create policy constraint_violations_admin_select
  on public.constraint_violations for select to authenticated
  using (private.is_admin());

create policy constraint_violations_admin_insert
  on public.constraint_violations for insert to authenticated
  with check (private.is_admin());

create policy constraint_violations_admin_update
  on public.constraint_violations for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy constraint_violations_admin_delete
  on public.constraint_violations for delete to authenticated
  using (private.is_admin());

create policy audit_logs_admin_select
  on public.audit_logs for select to authenticated
  using (private.is_admin());
