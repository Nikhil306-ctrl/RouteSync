# Phase 5 — Final Targeted Correction Report

This report records the final targeted Phase 5 correction pass based on the
independent review of the complete order lifecycle migration.

Project root: `C:\Users\Nikhil\Desktop\RouteSync`

Migration 7 (`20261124100700_order_lifecycle.sql`) has **not** been applied
remotely. No remote migration, reseed, browser session, Playwright run,
development server, commit, push or deployment was performed by the assistant.
Phase 6 was not started.

---

## 1. Confirmed defects and corrections

### 1. Database permissions

**Confirmed defects**

- The applied Phase 3 grant file
  (`20261124100600_grants.sql`) grants
  `UPDATE (status, cancellation_reason) ON public.orders TO authenticated` as
  an independent column-level privilege. A table-level `REVOKE` does not remove
  column privileges, so a browser token could bypass the trusted lifecycle RPCs
  even after the Phase 5 table-level revoke.
- The earlier Phase 5 migration text did not explicitly revoke that column
  grant and did not statically assert that all five trusted RPCs were restricted
  to `service_role`.

**Corrections**

- Inspected the actual Phase 3 grants before editing.
- Added
  `revoke update (status, cancellation_reason) on public.orders from authenticated;`
  to the unapplied Phase 5 migration.
- Preserved legitimate browser `SELECT` access and the Phase 3
  `UPDATE (read_at) ON notifications` grant.
- Verified statically that `quote_order`, `create_order`,
  `transition_order_status`, `assign_rider` and `respond_assignment` are revoked
  from `public`, `anon` and `authenticated`, and granted only to `service_role`.
- Extended the runbook verification SQL with `has_any_column_privilege` and
  `has_column_privilege` alongside table and function privilege checks.

### 2. Delivery deadlines and rider shifts

**Confirmed defects**

- The previous `assign_rider` plan used `delivery_window_end` as the planned
  delivery time, which could store an impossible plan instead of rejecting an
  infeasible order.
- The shift check only ensured the shift covered planned pickup; it did not
  ensure the shift covered planned delivery.
- The advisory eligible-rider endpoint used different constants and did not
  align with the RPC's feasibility and shift rules.

**Corrections**

- Implemented a clearly documented provisional Phase 5 timing model in
  `assign_rider`:
  - 5-minute dispatch buffer (`v_dispatch_minutes := 5`);
  - 25-minute provisional travel estimate (`v_travel_minutes := 25`);
  - pickup = `greatest(now + 5 minutes, estimated_ready_at or fallback)`;
  - delivery = `greatest(pickup + 25 minutes, delivery_window_start)`;
  - reject when planned delivery exceeds `delivery_window_end`;
  - reject when the rider shift ends before planned delivery.
- Phase 6 will replace the 25-minute estimate with route optimization.
- Aligned `/api/admin/riders/eligible` with the same
  `DISPATCH_BUFFER_MS = 5 * 60_000`,
  `PROVISIONAL_TRAVEL_MS = 25 * 60_000`, `plan.feasible`, delivery-window and
  shift-end rules.
- Retained the rider-row capacity lock and consistent order-before-assignment
  lock ordering.
- Did **not** add any deadline check to actual `delivered` recording, so late
  deliveries remain recordable.

### 3. Reassignment consistency

**Confirmed defects**

- An order could remain `assigned` while its current rider assignment was no
  longer accepted.
- Replacing an accepted assignment before pickup did not restore the order to
  `ready` or record the `assigned → ready` transition.
- Reassignment history and rider notification for the replaced rider were
  incomplete.
- Reassignment after pickup was not explicitly blocked at the RPC boundary.

**Corrections**

- Added explicit rejection for assignment changes after pickup.
- When an accepted assignment on an `assigned` order is replaced before pickup:
  - the order is restored to `ready`;
  - `assigned → ready` is recorded in `order_status_events`;
  - the previous assignment is marked `reassigned`;
  - a `reassigned` assignment event and a rider notification are written.
- A declined replacement leaves the order in `ready`, so it remains
  dispatchable.
- Replacement history (`replaced_by_assignment_id` and assignment events) is
  preserved.

### 4. Assignment response validation

**Confirmed defects**

- `respond_assignment` did not explicitly reject null `accept` inputs or a
  decline without a reason.
- Duplicate responses could be returned before current-assignment and order
  eligibility validation.
- Acceptance did not fully revalidate rider verification, availability, shift
  and capacity at response time.
- Declines could be blocked by accept-only rider constraints.

**Corrections**

- Null `accept` and blank/missing decline reasons are rejected.
- Ownership, current assignment and eligible non-terminal order state are
  validated for all responses; a repeated decline remains idempotent because
  rejection intentionally clears `is_current`.
- On acceptance only, the rider row is locked and verification, availability,
  active shift, shift coverage for planned pickup/delivery and capacity are
  revalidated.
- Valid duplicate accept/decline responses remain idempotent.
- Declining remains possible even if the rider has since gone offline.

### 5. Assignment history and notifications

**Confirmed defects**

- `assignment_events` were not recorded for pickup, completion, cancellation
  and reassignment.
- Riders did not consistently receive notifications for restaurant readiness,
  cancellation and reassignment.
- Events sharing a `created_at` timestamp had no deterministic secondary sort.

**Corrections**

- Added assignment events for:
  - pickup → `active`;
  - completion → `completed`;
  - cancellation → `cancelled`;
  - reassignment → `reassigned`.
- Added rider notifications for:
  - restaurant marks order ready;
  - order cancellation;
  - assignment replacement/reassignment.
- Preserved all customer and restaurant notifications.
- Added `id` as a deterministic tie-breaker to
  `order_status_events_order_idx` and `assignment_events_assignment_idx`, and
  to the backend event query ordering.
- All lifecycle writes remain in the trusted service-role RPC transactions.

### 6. Regression tests and documentation

**Corrections**

- Added focused `STATIC:` tests for:
  - Phase 3 column grants and preserved `read_at` grant;
  - all five RPC privilege restrictions;
  - provisional planning, delivery-window feasibility and full shift coverage;
  - reassignment invariants and history;
  - rider response validation and accept-only revalidation;
  - assignment history events and deterministic ordering.
- Updated `docs/PHASE5_ORDER_LIFECYCLE.md` with:
  - corrected privilege verification SQL and expected values;
  - all five trusted RPC checks;
  - history index verification including `id`;
  - expected behavior for planning, reassignment, response validation, history
    and notifications;
  - updated negative demo checks;
  - an explicit distinction between static local tests and operator-run
    database integration verification.

---

## 2. Exact files modified

- `supabase/migrations/20261124100700_order_lifecycle.sql` — unapplied Phase 5
  migration only.
- `backend/src/routes/admin.routes.js` — advisory eligible-rider planning and
  eligibility rules.
- `backend/src/lib/orderLifecycle.js` — deterministic event ordering.
- `tests/order-lifecycle.test.mjs` — focused `STATIC:` regression tests and
  updated legacy assertions.
- `tests/schema-static.test.mjs` — privilege/RPC restriction assertions.
- `docs/PHASE5_ORDER_LIFECYCLE.md` — corrected runbook, verification SQL,
  expected behavior and verification-status wording.
- `docs/PHASE5_FINAL_REPORT.md` — this report.

No previously applied migration (files 1–6) was modified. No landing-page
file, 3D asset, animation or unrelated portal design was changed. No frontend
implementation changed in this correction pass.

---

## 3. Tests executed and results

### `npm run test:local`

- First run after the SQL/backend/test edits: **53 passed / 2 failed**.
  - Both failures were stale static assertions that still expected the older
    `v_shift.ends_at < v_pickup` and
    `v_assignment.status = 'proposed' and p_accept` text patterns.
  - Those assertions were updated to match the corrected SQL.
- Final run: **55 passed / 0 failures**.

The local suite contains **static/unit tests only**, including the `STATIC:`
tests that read migration SQL and backend source text. It does not connect to
PostgreSQL.

### Production build

`npm run build` was **not** run in this correction pass because no frontend
implementation changed. An earlier Phase 5 pass ran the Vite production build
successfully (chunk-size warning only) when the portals were implemented.

---

## 4. Unresolved issues and intentionally excluded actions

- Migration 7 has **not** been applied remotely.
- No database integration tests were executed; live RPC behavior, grants and
  transaction atomicity remain for operator verification after applying the
  migration.
- No browser, Playwright or dev-server verification was performed.
- No remote migration, reseed, credential exposure, commit, push or deployment
  was performed.
- Phase 6 was not started.

---

## 5. Exact manual Supabase migration and verification steps

Perform these steps yourself against the intended Supabase project.

### Apply migration

1. Open the Supabase dashboard for the intended project.
2. Go to **SQL Editor → New query**.
3. Paste the full contents of
   `supabase\migrations\20261124100700_order_lifecycle.sql`.
4. Review the generated confirmation, then press **Run**.
5. Confirm success. Do not re-run the file unless recovering from a failed
   first run. Migrations 1–6 are already applied; apply **only file 7**.

CLI alternative, after reviewing the generated plan:

```powershell
cd C:\Users\Nikhil\Desktop\RouteSync
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

### Verify in SQL Editor (read-only)

Run every verification query in section 3 of
`docs/PHASE5_ORDER_LIFECYCLE.md` and confirm:

1. Application table count is `19`.
2. Both history tables exist (`order_status_events`, `assignment_events`).
3. Expected indexes exist:
   `orders_customer_idempotency_idx`,
   `assignments_one_active_per_order_idx`,
   `order_status_events_order_idx`,
   `assignment_events_assignment_idx`.
4. History index definitions include `(order_id, created_at, id)` and
   `(assignment_id, created_at, id)` respectively.
5. All five trusted functions exist:
   `quote_order`, `create_order`, `transition_order_status`, `assign_rider`,
   `respond_assignment`.
6. Privilege query expected values are:
   `true, false, false, false, false, false, false, false, true, true`.
   This confirms browser reads and notification `read_at` updates remain
   allowed while direct write paths that could bypass RPCs are closed.
7. For all five trusted RPC rows:
   `browser_can_execute = false` and `service_can_execute = true`.
8. RLS is enabled on
   `orders`, `order_items`, `assignments`, `order_status_events` and
   `assignment_events`.

### Optional Realtime step

If Realtime is desired, use the section 4 publication SQL in the runbook to add
`orders`, `order_status_events`, `assignments` and `assignment_events` to the
`supabase_realtime` publication, then verify publication tables. Realtime is an
enhancement only; capped polling remains the mandatory fallback.

### Demo and walkthrough

1. Only in a disposable/demo project, set the four `DEMO_*_PASSWORD` variables
   and run `npm run seed:demo` if demo data is needed.
2. Execute the section 8 four-portal lifecycle walkthrough in
   `docs/PHASE5_ORDER_LIFECYCLE.md`:
   - customer checkout;
   - restaurant accept, preparation and ready;
   - admin assignment, eligibility planning and optional reassignment before
     pickup;
   - rider accept, pickup, out-for-delivery and delivered;
   - cross-portal history/notification verification.
3. Run the section 8 negative checks, including null/invalid rider responses,
   stale/wrong-rider responses, post-pickup reassignment, infeasible windows,
   shifts ending before delivery, direct browser status writes, and
   cancellation with an accepted rider.

No such remote steps were performed by the assistant.
