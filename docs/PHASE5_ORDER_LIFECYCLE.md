# Phase 5 — Order Lifecycle Runbook

Everything below is **prepared, not executed**. No remote migration, reseed,
deployment, browser session or development server was started by the assistant.
Perform the remote steps yourself against the intended Supabase project.

Project root: `C:\Users\Nikhil\Desktop\RouteSync`

---

## 1. Scope and safety

Phase 5 adds a trusted complete order lifecycle on top of the Phase 3 schema:

- customer quote/checkout/COD order creation, cancellation and history;
- restaurant accept/reject, preparation, ready and cancellation transitions;
- admin order dashboard, manual rider assignment/reassignment and eligible-rider checks;
- rider assignment response, pickup, out-for-delivery and delivery;
- status/assignment event history, notifications and audit logs;
- Realtime enhancement with polling fallback in all four portals.

No landing-page file, 3D scene, logo animation, landing asset or reference document
was changed. Phase 6 was not started.

The browser never receives `SUPABASE_SECRET_KEY`. Browser tokens are verified by the
Hono Worker, which calls the service-role role only after `requireAuth` / `requireRole`.

---

## 2. Migration order

Seven migrations exist in `supabase\migrations`:

| # | File | Purpose |
| --- | --- | --- |
| 1 | `20261124100100_enums.sql` | shared enum types |
| 2 | `20261124100200_core_tables.sql` | profiles, restaurants, menu, addresses, riders, shifts |
| 3 | `20261124100300_operations_tables.sql` | orders, items, assignments, routes, notifications, audit |
| 4 | `20261124100400_functions_and_triggers.sql` | provisioning, role guards, order visibility helpers |
| 5 | `20261124100500_rls_policies.sql` | RLS enablement and policies |
| 6 | `20261124100600_grants.sql` | explicit grants for browser and service roles |
| 7 | `20261124100700_order_lifecycle.sql` | **Phase 5**: lifecycle columns, history tables, trusted RPCs, restrictions |

If migrations 1–6 are already applied, apply **only file 7**. If the project is
fresh, apply all seven in the exact filename order.

### Option A — Supabase SQL Editor (recommended for review)

1. Open the Supabase dashboard for the intended project.
2. Go to **SQL Editor → New query**.
3. Paste the full contents of `supabase\migrations\20261124100700_order_lifecycle.sql`.
4. Review the generated diff/confirmation, then press **Run**.
5. Confirm success; do not re-run the file unless recovering from a failed first run.
6. Run the verification queries in section 3.

### Option B — Supabase CLI

```powershell
cd C:\Users\Nikhil\Desktop\RouteSync
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Review the generated plan before confirming. `db push` applies pending files in
filename order. The database password is entered interactively and is never stored
in this repository.

### Expected first-run notes

- Migration 7 is additive: it adds columns, two tables, indexes, policies, functions
  and grant changes. It does not delete application rows.
- It backfills lifecycle timestamps and one timeline row for existing orders.
- It revokes browser direct `INSERT`/`UPDATE`/`DELETE` on orders, order items,
  assignments and notification inserts. This is intentional and required.
- It also explicitly revokes the Phase 3 column grant
  `UPDATE (status, cancellation_reason) ON orders FROM authenticated`, because
  column privileges are independent of table privileges. The legitimate
  `UPDATE (read_at) ON notifications` grant is preserved.
- It records assignment events for proposal, acceptance, rejection, pickup,
  completion, cancellation and reassignment, and uses `id` as a tie-breaker for
  deterministic event ordering.
- Applying the file twice will error on existing objects. Do not repeat it.

---

## 3. Post-migration verification (SQL Editor, read-only)

Expected table count is 19 (17 Phase 3 tables plus the two new history tables):

```sql
select count(*) as application_tables
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles','restaurants','menu_categories','menu_items','customer_addresses',
    'riders','rider_shifts','scheduling_runs','orders','order_items',
    'delivery_routes','assignments','route_stops','rider_locations',
    'notifications','constraint_violations','audit_logs',
    'order_status_events','assignment_events'
  );
```

Expected lifecycle objects:

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('order_status_events','assignment_events')
order by tablename;

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'orders_customer_idempotency_idx',
    'assignments_one_active_per_order_idx',
    'order_status_events_order_idx',
    'assignment_events_assignment_idx'
  )
order by indexname;

-- History indexes must include id as a deterministic tie-breaker for events
-- sharing a created_at timestamp.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in ('order_status_events_order_idx', 'assignment_events_assignment_idx')
order by indexname;

select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'quote_order','create_order','transition_order_status','assign_rider',
    'respond_assignment'
  )
order by proname;
```

Expected index definitions contain `(order_id, created_at, id)` and
`(assignment_id, created_at, id)` respectively.

Expected browser boundary. Table reads and notification `read_at` updates stay
allowed; all write privileges that could bypass a trusted RPC must be `false`.
`service_can_update_orders` must be `true`.

```sql
select
  has_table_privilege('authenticated', 'public.orders', 'SELECT')
    as browser_can_read_orders,
  has_table_privilege('authenticated', 'public.orders', 'UPDATE')
    as browser_can_update_orders_table,
  has_any_column_privilege('authenticated', 'public.orders', 'UPDATE')
    as browser_can_update_any_order_column,
  has_column_privilege('authenticated', 'public.orders', 'status', 'UPDATE')
    as browser_can_set_status,
  has_column_privilege('authenticated', 'public.orders', 'cancellation_reason', 'UPDATE')
    as browser_can_set_cancel_reason,
  has_any_column_privilege('authenticated', 'public.order_items', 'INSERT')
    as browser_can_insert_order_items,
  has_any_column_privilege('authenticated', 'public.assignments', 'UPDATE')
    as browser_can_update_assignments,
  has_any_column_privilege('authenticated', 'public.notifications', 'INSERT')
    as browser_can_insert_notifications,
  has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE')
    as browser_can_mark_notifications_read,
  has_table_privilege('service_role', 'public.orders', 'UPDATE')
    as service_can_update_orders;
```

Expected values: `true, false, false, false, false, false, false, false, true, true`.

All five trusted RPCs must be unavailable to browsers and available to the
service role only:

```sql
with trusted_rpc(signature) as (
  values
    ('public.quote_order(uuid, uuid, uuid, jsonb)'),
    ('public.create_order(uuid, uuid, uuid, jsonb, text, text, text)'),
    ('public.transition_order_status(uuid, uuid, public.app_role, public.order_status, public.order_status, text, integer)'),
    ('public.assign_rider(uuid, uuid, uuid, text, uuid)'),
    ('public.respond_assignment(uuid, uuid, boolean, text)')
)
select
  signature,
  has_function_privilege('authenticated', signature, 'EXECUTE') as browser_can_execute,
  has_function_privilege('service_role', signature, 'EXECUTE') as service_can_execute
from trusted_rpc
order by signature;
```

Every row must show `browser_can_execute = false` and `service_can_execute = true`.

Expected RLS coverage:

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('orders','order_items','assignments','order_status_events','assignment_events')
order by relname;
```

---

## 4. Realtime publication

Realtime is an enhancement only. Every lifecycle screen also installs a capped
polling refresh (default 20 s, minimum 5 s), so the demo works without this step.
If Realtime is enabled, add the four tables used by the subscriptions to the
`supabase_realtime` publication:

```sql
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'orders', 'order_status_events', 'assignments', 'assignment_events'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end $$;
```

Verify:

```sql
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;
```

Supabase Realtime applies RLS to authenticated subscriptions. No extra browser
grant is required; the lifecycle history tables remain read-only for signed-in users.

Optional client tuning: set `VITE_POLL_INTERVAL_MS` in `frontend\.env.local` to a
value of at least `5000` (milliseconds).

---

## 5. Environment variables

Never put a secret key in a `VITE_` variable or in source control.

| File | Variable | Purpose |
| --- | --- | --- |
| `frontend\.env.local` | `VITE_SUPABASE_URL` | browser Supabase URL |
| `frontend\.env.local` | `VITE_SUPABASE_PUBLISHABLE_KEY` | RLS-scoped browser key |
| `frontend\.env.local` | `VITE_POLL_INTERVAL_MS` | optional polling interval, minimum 5000 |
| `frontend\.env.local` | `BACKEND_URL` | optional dev proxy target, default `http://localhost:8787` |
| `backend\.dev.vars` | `SUPABASE_URL` | Worker Supabase URL |
| `backend\.dev.vars` | `SUPABASE_PUBLISHABLE_KEY` | health check / user-scoped reads |
| `backend\.dev.vars` | `SUPABASE_SECRET_KEY` | server-only privileged client |
| `backend\.dev.vars` | `DEMO_ADMIN_PASSWORD` | seed login password for `admin.demo@example.com` |
| `backend\.dev.vars` | `DEMO_RESTAURANT_PASSWORD` | seed login password for owner accounts |
| `backend\.dev.vars` | `DEMO_RIDER_PASSWORD` | seed login password for rider accounts |
| `backend\.dev.vars` | `DEMO_CUSTOMER_PASSWORD` | seed login password for customer accounts |
| Worker vars | `CORS_ORIGIN` | optional allowed origins, default `http://localhost:5173` |

The four `DEMO_*_PASSWORD` values must be at least 8 characters. They are seed-only
and are intentionally absent from the committed templates. Configuration templates
exist as `.env.example`, `frontend\.env.local.example` and `backend\.dev.vars.example`.

---

## 6. Safe seed instructions

The seeder is development-only and idempotent by fixed row IDs. It **upserts**,
never deletes. Re-running it **resets the four demo account passwords** from the
`DEMO_*_PASSWORD` variables, so run it only in a disposable/demo project.

After migration 7 is applied and the environment variables above are set:

```powershell
cd C:\Users\Nikhil\Desktop\RouteSync
npm run seed:demo
```

Expected output is a short summary such as `Users: 12 • restaurants: 3 • menu
items: …` and `No passwords, keys or tokens were printed.`

Seeded records relevant to the demo:

| Role | Login | Scope |
| --- | --- | --- |
| Customer | `customer1.demo@example.com` | Neha Joshi, default address at Tilakwadi |
| Restaurant | `owner1.demo@example.com` | Belagavi Spice House |
| Admin | `admin.demo@example.com` | dispatcher / manual assignment |
| Rider | `rider1.demo@example.com` | Sagar Naik, verified, available, shift covers now |

Seeded rider shifts start one hour before seeding and end 8–12 hours after it,
with `status = 'scheduled'`; `assign_rider` accepts `scheduled` and `active` shifts.

Seeded restaurants are open 08:30–22:00 Asia/Kolkata. If the demo is run outside
that window and every restaurant shows **Closed now**, either return during those
hours or temporarily widen `opening_time` / `closing_time` for the demo restaurant
in the SQL Editor. That data edit is a manual operator action, not part of the
assistant's changes.

The seeded `assigned` order has no assignment row; use a freshly created order for
the full rider walkthrough.

---

## 7. Trusted endpoints

All routes require a Supabase bearer token; the Worker verifies the profile and role
before using the service-role client.

| Portal | Method | Endpoint | Purpose |
| --- | --- | --- | --- |
| Customer | `GET` | `/api/customer/orders` | order history |
| Customer | `GET` | `/api/customer/orders/:orderId` | detail + events |
| Customer | `POST` | `/api/customer/orders/quote` | server quote |
| Customer | `POST` | `/api/customer/orders` | idempotent COD order creation |
| Customer | `POST` | `/api/customer/orders/:orderId/cancel` | cancel before preparation |
| Restaurant | `GET` | `/api/restaurant/orders` | kitchen queue |
| Restaurant | `GET` | `/api/restaurant/orders/:orderId` | detail + events |
| Restaurant | `POST` | `/api/restaurant/orders/:orderId/transition` | accept/prep/ready/cancel |
| Admin | `GET` | `/api/admin/orders` | filtered dashboard |
| Admin | `GET` | `/api/admin/orders/:orderId` | detail + events |
| Admin | `POST` | `/api/admin/orders/:orderId/transition` | confirm/reject/cancel |
| Admin | `GET` | `/api/admin/dispatch/queue` | assignable orders + summaries |
| Admin | `GET` | `/api/admin/riders/eligible?orderId=` | advisory eligibility |
| Admin | `POST` | `/api/admin/orders/:orderId/assign` | assign/reassign |
| Rider | `GET` | `/api/rider/assignments` | assigned queue |
| Rider | `GET` | `/api/rider/assignments/:assignmentId` | assignment detail |
| Rider | `POST` | `/api/rider/assignments/:assignmentId/respond` | accept/decline |
| Rider | `POST` | `/api/rider/orders/:orderId/transition` | pickup → delivery |

Transition bodies use `{ "status": "...", "expectedStatus": "...", "reason": "...",
"prepTimeMinutes": 25 }` where relevant. Rider response uses
`{ "accept": true }` or `{ "accept": false, "reason": "..." }`.

---

## 8. Exact manual lifecycle demo

Use separate browser profiles (or sign out between roles) so the four sessions are
independent. Start with a fresh order created by `customer1` at **Belagavi Spice House**.

1. **Customer — checkout**
   1. Sign in as `customer1.demo@example.com`.
   2. Open `/customer`, choose **Belagavi Spice House**, and confirm it shows **Open now**.
   3. Add one or two menu items. The cart must stay on this single restaurant.
   4. Open `/customer/checkout`; select the default **Home** address; leave payment as **Cash on delivery**; optionally add instructions.
   5. Confirm the server-calculated subtotal, ₹30 delivery fee (₹0 at ₹750+), total and delivery window, then submit once.
   6. You land on `/customer/orders/<orderId>` with status **pending** and a "Order placed" confirmation. Note the order ID.
   7. `/customer/orders` and `/customer/orders/<orderId>/tracking` show the same order and its timeline.

2. **Restaurant — accept and prepare**
   1. Sign in as `owner1.demo@example.com` and open `/restaurant/kitchen`.
   2. Find the order ID from step 1 in the incoming queue, open its detail, set a prep estimate (1–240 minutes) and **Accept**. Status becomes **confirmed**.
   3. Choose **Start preparation**. Status becomes **preparing**.
   4. **Do not mark it ready yet.** Keeping it preparing lets the demo show that a rider can accept before the food is ready without gaining pickup permission.

3. **Admin — manual assignment**
   1. Sign in as `admin.demo@example.com`.
   2. Open `/admin/orders` and verify the order appears with status **preparing**; filters by status, restaurant and customer are available.
   3. Open `/admin/dispatch`. The order appears in the assignable queue.
   4. Choose **Assign**, select `rider1.demo@example.com` from the eligible list and optionally enter a reason, then submit.
   5. Result: a `proposed` assignment exists; order status is still **preparing**. If you repeat the same assignment, the RPC returns the existing row as a duplicate.
    6. The advisory list and `assign_rider` use the same provisional Phase 5 plan: pickup no earlier than now + 5 minutes (or `estimated_ready_at` when later) and delivery at the later of pickup + 25 minutes or `delivery_window_start`. If that delivery time exceeds `delivery_window_end`, no rider is eligible and assignment is rejected. A rider shift must cover the current time and end no earlier than the planned delivery. Phase 6 will replace the 25-minute estimate with route optimisation.

4. **Rider — accept before readiness**
   1. Sign in as `rider1.demo@example.com` and open `/delivery-partner/assignments`.
   2. The proposed assignment appears under **Action**. Open `/delivery-partner/assignments/<assignmentId>`.
   3. Confirm pickup and destination details, then **Accept**. Assignment status becomes **accepted**, but order status remains **preparing**.
   4. Verify **Confirm pickup** is not available yet. A direct pickup is rejected by `transition_order_status` because `ready_at` is null.

5. **Restaurant — ready with an accepted rider**
   1. Return to the restaurant session and **Mark ready** on the same order.
   2. Because a rider already accepted, the trusted RPC records `preparing → ready → assigned` and sets `ready_at`. The board shows **assigned** with the rider details.

6. **Admin — reassignment consistency (optional, before pickup)**
   1. On a fresh order with an accepted rider, replace that rider with another eligible rider from dispatch before pickup.
   2. The order returns to **ready** and records `assigned → ready`; the previous assignment becomes `reassigned` with a history event and a notification to its rider. The new assignment is `proposed` and requires the new rider's acceptance before the order becomes **assigned** again.
   3. If the replacement rider declines, the order stays dispatchable in **ready** and can be assigned again. Reassignment after pickup is rejected.

7. **Rider — pickup and delivery**
   1. Return to the rider assignment detail and refresh if necessary.
   2. **Confirm pickup** → order **picked_up**, assignment **active**.
   3. **Out for delivery** → order **out_for_delivery**.
   4. **Mark delivered** → order **delivered**, assignment **completed**. Recording actual late delivery is never blocked by the provisional planned delivery time.

8. **Cross-portal verification**
   - Customer detail/tracking: timeline ends at **delivered**; history lists the order.
   - Admin dashboard/dispatch: status **delivered**, assignment history shows the completed record.
   - Restaurant kitchen active list clears; completed history shows the order.
   - Rider history shows the completed assignment. Notifications show the status and assignment events for the involved accounts. Assignment history includes proposal, acceptance, pickup (`active`), completion (`completed`), cancellation and reassignment events; events with the same timestamp are ordered by `id`.

### Optional negative checks (separate fresh order)

- Cancel a second `pending` order from the customer detail page; status becomes `cancelled` with a reason.
- Try to cancel an order after it reaches `preparing`; the API returns an authorization/state error.
- Try to open another restaurant's order in the kitchen board or another rider's assignment detail; the trusted API returns not-found/forbidden data only.
- Submit checkout twice with the same idempotency key (network retry); only one order exists.
- Assign the same rider again while their first accepted order is active and capacity is full; dispatch shows an eligibility/capacity error.
- Send `{ "accept": null }` or decline without a `reason`; the trusted RPC rejects the input.
- Respond as a different rider or to a stale/replaced assignment; the RPC rejects ownership or current-assignment validation.
- Try to assign or reassign an order after pickup, or set a planned delivery beyond `delivery_window_end` / after the rider's shift ends; the RPC and advisory endpoint reject it.
- Try to set `orders.status` directly with a browser token; the column-level grant is revoked, so the write is denied.
- Cancel an order with an accepted rider; that rider receives a cancellation notification and the assignment records a `cancelled` history event (while customer and restaurant notifications remain).

---

## 9. Verification status: static tests only

```powershell
npm run test:local   # 55 tests, 0 failures (current correction pass)
```

All 55 local tests are **static/unit tests**. The lifecycle suite re-checks the
trusted transition matrix, assignment eligibility and planning rules, rider
response validation, reassignment invariants, history/event ordering, route/RPC
wiring, browser privilege boundaries, seed shifts and the concurrency locks.
Tests whose names begin with `STATIC:` read migration/SQL and backend source text;
they do not connect to PostgreSQL.

**No database integration tests were executed by the assistant.** Migration 7
has not been applied remotely and no RPC was exercised against a live database.
The section 3 SQL checks and section 8 walkthrough are the operator-run integration
verification and must be performed manually after applying migration 7.

A production build was **not** run in this correction pass because no frontend
implementation changed. An earlier Phase 5 pass ran `npm run build` successfully
(chunk-size warning only) when the portals were implemented.

---

## 10. Rollback / recovery notes

There is no destructive down migration. To undo Phase 5 in a demo project, an
operator would need to drop the two history tables and their policies, remove the
new order columns and indexes, drop the five trusted functions, and restore the
Phase 3 grants from `20261124100600_grants.sql`. Do this only with a reviewed backup
and explicit approval. No such rollback was performed here.
