# Phase 3 — Database, Auth and Security Runbook

Everything in this document is **prepared, not executed**. No migration, seed or
deployment has been applied to the remote Supabase project by the assistant.

Project root: `C:\Users\Nikhil\Desktop\RouteSync`

---

## 1. Migration order

Apply these six files **in this exact order**. Later files depend on earlier ones
(types → tables → functions → policies → grants).

| # | File | Creates |
| --- | --- | --- |
| 1 | `supabase/migrations/20261124100100_enums.sql` | 13 enum types (`app_role`, `order_status`, …) |
| 2 | `supabase/migrations/20261124100200_core_tables.sql` | profiles, restaurants, menu_categories, menu_items, customer_addresses, riders, rider_shifts |
| 3 | `supabase/migrations/20261124100300_operations_tables.sql` | scheduling_runs, orders, order_items, delivery_routes, assignments, route_stops, rider_locations, notifications, constraint_violations, audit_logs |
| 4 | `supabase/migrations/20261124100400_functions_and_triggers.sql` | `private` helpers, signup provisioning, role guard, shift overlap guard, `public.admin_set_user_role`, updated_at triggers |
| 5 | `supabase/migrations/20261124100500_rls_policies.sql` | RLS enablement + all policies |
| 6 | `supabase/migrations/20261124100600_grants.sql` | explicit `anon` / `authenticated` / sequence / function grants |

### Option A — Supabase SQL Editor (recommended for the first review)

1. Open the Supabase dashboard for project `pcpgoexjenggcznkmfvj`.
2. Go to **SQL Editor → New query**.
3. Paste the full contents of file 1, press **Run**, confirm success.
4. Repeat for files 2 → 6 in order. Do not skip file 5 (RLS) or file 6 (grants).
5. Verify with the checks in section 5.

### Option B — Supabase CLI

```powershell
cd C:\Users\Nikhil\Desktop\RouteSync
npx supabase login
npx supabase link --project-ref pcpgoexjenggcznkmfvj
npx supabase db push
```

`db push` applies files in filename order. Review the generated plan before
confirming. The CLI prompts for the database password; it is never stored in the
repository.

### Expected first-run caveats

- The `on_auth_user_created` trigger attaches to `auth.users`; this requires the
  SQL Editor / migration role (standard on Supabase).
- File 5 emits "policy already exists" only if it is re-run. Re-running file 1–4
  will error on existing objects; apply once, or use the rollback in section 8.
- If the project already has an `on_auth_user_created` trigger from an earlier
  experiment, drop that trigger first so profiles are not inserted twice.

---

## 2. Required dashboard configuration

**Authentication → Providers → Email**

- Email provider: enabled.
- "Confirm email": your choice. If enabled, self-registered customers must click
  the confirmation link before signing in. Demo accounts are seeded with
  `email_confirm: true`, so they can sign in immediately either way.
- Minimum password length: 8 or more (the UI enforces 8).

**Authentication → URL Configuration**

- Site URL: `http://localhost:5173`
- Redirect URLs (add both):
  - `http://localhost:5173/reset-password`
  - `http://localhost:5173/**`
- Add the deployed Worker origin to both lists in a later phase.

**API**

- Exposed schemas: keep the default `public` (and `graphql_public` if already on).
  Do **not** expose the `private` schema; it is only referenced inside policies.
- Automatic table grants: remain **disabled** (as configured). File 6 supplies all
  grants explicitly.

**Auth → Sessions**

- JWT expiry / refresh defaults are fine for development.

**Storage / Realtime**

- No Phase 3 buckets or publications are required. Tables are ready for them later.

---

## 3. Demo seed

The script is `backend/scripts/seed-demo.js`, exposed as `npm run seed:demo`.

It is:
- **idempotent** (auth users matched by email, data upserted by fixed UUID),
- **development-only**, using the Admin API with `SUPABASE_SECRET_KEY`,
- **password-injected** through environment variables — nothing is hardcoded,
- **not run automatically** and it prints no credentials.

### Prerequisites

1. All six migrations applied.
2. `backend/.dev.vars` contains `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
3. Explicit approval to write demo data to the remote project.

### Run (PowerShell)

```powershell
cd C:\Users\Nikhil\Desktop\RouteSync

$env:DEMO_ADMIN_PASSWORD      = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:DEMO_RESTAURANT_PASSWORD = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:DEMO_RIDER_PASSWORD      = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:DEMO_CUSTOMER_PASSWORD   = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText

npm run seed:demo

Remove-Item Env:DEMO_ADMIN_PASSWORD, Env:DEMO_RESTAURANT_PASSWORD,
  Env:DEMO_RIDER_PASSWORD, Env:DEMO_CUSTOMER_PASSWORD
```

Use four different strong passwords (8+ characters). Do not reuse a real password.

### Seeded accounts (emails are fictional, not secrets)

| Role | Emails |
| --- | --- |
| admin | `admin.demo@example.com` |
| restaurant | `owner1.demo@example.com`, `owner2.demo@example.com`, `owner3.demo@example.com` |
| rider | `rider1.demo@example.com` … `rider5.demo@example.com` |
| customer | `customer1.demo@example.com`, `customer2.demo@example.com`, `customer3.demo@example.com` |

Also seeded: 3 Belagavi restaurants, 6 categories, 24 menu items, 5 rider shift
records with capacity/location, 3 addresses, 4 orders and 8 order lines.

Role assignment uses the service-role client, which is the trusted provisioning
path; the same operation is available to admins through
`public.admin_set_user_role(uuid, app_role, text)`.

---

## 4. Schema and security summary

### Tables (17)

```
auth.users 1─1 profiles
profiles 1─1 riders
profiles 1─* restaurants (owner_id)
restaurants 1─* menu_categories 1─* menu_items
profiles 1─* customer_addresses
riders 1─* rider_shifts
profiles 1─* orders (customer_id) ; restaurants 1─* orders
orders 1─* order_items -----> menu_items
orders 1─* assignments -----> riders, delivery_routes, scheduling_runs
delivery_routes 1─* route_stops -----> orders
riders 1─* rider_locations
profiles 1─* notifications ; orders 1─* notifications
scheduling_runs 1─* constraint_violations / delivery_routes / assignments
audit_logs (actor, entity snapshots)
```

Design notes:
- Money is `integer` minor units (`price_minor`, `total_minor`, …); no floats.
- `orders.total_minor` must equal `subtotal + delivery_fee − discount`.
- Delivery windows are `timestamptz` pairs with `end > start`.
- `assignments.is_current` is unique per order; reassignment writes history and
  `replaced_by_assignment_id`, so dynamic rescheduling is auditable.
- `rider_shifts` cannot overlap for the same rider (trigger, `[)` ranges).
- `rider_locations` is an append-only GPS/simulated breadcrumb table.

### Roles and escalation control

- Role lives only in `public.profiles.role` (`app_role` enum). JWT metadata is
  ignored for authorization.
- `on_auth_user_created` always inserts `customer`, regardless of signup metadata.
- `profiles` column grants exclude `role`, `is_active` and `id`, so even a
  mis-scoped query cannot promote an account.
- `profiles_guard_role` trigger rejects role changes unless a trusted server path
  (`app.allow_role_change`) is active.
- `public.admin_set_user_role` is the only client-callable path: it requires an
  admin session or `service_role`, forbids self-demotion/promotion, and writes an
  `audit_logs` entry.
- Riders cannot change their own `max_concurrent_orders`, `verification_status` or
  `rating` (column grants), only availability/location.

### RLS coverage

- RLS enabled on all 17 application tables; no bypass, no disabled RLS.
- Customer: own profile, own addresses, own orders, own notifications; public
  restaurant/menu read.
- Restaurant: full control of own restaurant, categories, items; read/operate
  orders for its restaurant; cannot write another restaurant's menu.
- Rider: own profile, rider resource, shifts, assignments, routes, locations.
- Admin: system-wide management via policies and the role RPC.
- Scheduling runs, constraint violations and audit logs are admin-only.
- Order creation, order items, assignments and routes are server/admin controlled;
  the public client can only change order `status` and `cancellation_reason`.

### Backend authorization

`backend/src/middleware/auth.middleware.js`:
1. Requires `Authorization: Bearer <access_token>`.
2. Calls `supabase.auth.getUser(token)` with the publishable key.
3. Loads `id, role, full_name, is_active` from `profiles` under RLS.
4. Returns 401 for missing/invalid/expired tokens, 403 for inactive profiles or a
   wrong role (`requireRole(...)`).

`GET /api/auth/me` returns the trusted profile; `GET /api/admin/status` is the
admin-only probe.

### Frontend

- `AuthProvider` hydrates the session once, persists it via `supabase-js`, and
  subscribes to auth changes.
- `ProtectedRoute` redirects anonymous users to `/login` and wrong-role users to
  their own portal (`rider` → `/delivery-partner`).
- Pages: `/login`, `/register`, `/forgot-password`, `/reset-password`.
- Portals: `/admin`, `/restaurant`, `/delivery-partner`, `/customer` (placeholder
  dashboards showing name, role and logout). `/delivery` redirects for compatibility.

---

## 5. Verification after applying migrations

Static (safe now):

```powershell
npm run test:local
npm run build
```

Database sanity in the SQL Editor:

```sql
-- must return 17 rows, all rowsecurity = true
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- must list the six expected helper/trigger functions
select n.nspname, p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
order by 1, 2;

-- must be 1
select count(*) from pg_trigger where tgname = 'on_auth_user_created';
```

Live checks (after seed + Worker running):

```powershell
# terminal 1
npm run dev:worker

# terminal 2 — set the four DEMO_* variables first
npm run test:remote
```

Manual smoke test:

```powershell
curl.exe -i http://localhost:8787/api/health
curl.exe -i http://localhost:8787/api/auth/me          # expect 401
curl.exe -i http://localhost:8787/api/admin/status      # expect 401
curl.exe -i http://localhost:8787/login                 # expect 200 HTML
```

Then sign in at `http://localhost:5173/login` with each demo role and confirm the
redirect lands on the matching portal.

---

## 6. What is intentionally not implemented

- Full admin/restaurant/rider/customer dashboards (later phases).
- Scheduling, validation, resource and communication engine algorithms.
- Order placement UI and server-side order creation endpoint.
- Realtime subscriptions and Storage buckets.
- Production deployment, custom SMTP and email templates.

---

## 7. Handling a failed migration

1. Stop. Do not run later files until the failing statement is fixed.
2. Read the error; the most common causes are a re-run against existing objects or
   a trigger that already exists on `auth.users`.
3. If a partial apply happened, use the rollback below, then re-apply from file 1.

The migrations are written to run once on an empty schema. They are not
`if not exists` scripts, by design: silent partial application is worse than an
explicit error.

---

## 8. Destructive rollback (development project only)

```sql
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.audit_logs,
  public.constraint_violations,
  public.notifications,
  public.rider_locations,
  public.route_stops,
  public.assignments,
  public.delivery_routes,
  public.order_items,
  public.orders,
  public.scheduling_runs,
  public.rider_shifts,
  public.riders,
  public.customer_addresses,
  public.menu_items,
  public.menu_categories,
  public.restaurants,
  public.profiles
cascade;

drop function if exists public.admin_set_user_role(uuid, public.app_role, text) cascade;
drop schema if exists private cascade;

drop type if exists
  public.violation_severity, public.location_source, public.notification_channel,
  public.notification_type, public.run_status, public.stop_status, public.stop_type,
  public.route_status, public.assignment_status, public.order_priority,
  public.order_status, public.verification_status, public.shift_status,
  public.app_role
cascade;
```

This deletes application data. Never run it against a project containing real data,
and never against production.
