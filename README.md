# RouteSync — Phase 3 Database, Auth and Security

RouteSync is an academic mini-project on **Constraint-Based Timetable Scheduling**:
a constraint-based food delivery management system built as four cooperating engines.
Phase 3 adds the complete Supabase schema, row-level security, Supabase Auth,
protected role-based portals and a development-only demo seeder on top of the
Phase 2 **Hono Worker + Cloudflare Workers static assets + Supabase** foundation.

> Still not implemented: portal dashboards beyond authenticated placeholders,
> scheduling/validation/resource/communication algorithms, order placement UI,
> Realtime subscriptions, Storage buckets and deployment. See `docs/PROJECT_PLAN.md`
> and `docs/PHASE3_DATABASE_AUTH.md`.

> Migrations and the demo seed are **prepared but not applied**. Apply them manually
> following `docs/PHASE3_DATABASE_AUTH.md`.

## Final architecture

```
Browser (React + Vite + Tailwind + React Router + Lucide)
   ├── dev:  http://localhost:5173  ── /api proxy ──> http://localhost:8787
   └── prod: same Cloudflare Worker origin
                    │
        Cloudflare Worker (Hono) — backend/wrangler.jsonc
        ├─ /api/health: Worker runtime + real Supabase connectivity probe
        ├─ /api/auth/me: validates the access token, returns the trusted profile
        ├─ /api/admin/status: admin-only role-enforcement probe
        ├─ E1–E4 engine boundaries (preserved from Phase 1)
        └─ Supabase clients (user-scoped default; secret key server-only)
                    │
        backend/frontend/dist served as static assets
        (SPA fallback: unknown non-API paths return index.html)
                    │
        Supabase PostgreSQL (17 tables, RLS on) / Auth / Realtime / Storage
```

Supabase project URL: `https://pcpgoexjenggcznkmfvj.supabase.co`
GitHub repository: `https://github.com/Nikhil306-ctrl/RouteSync`

## Prerequisites

- Node.js **>= 22.12.0** (Wrangler 4 requirement); verified on Node 25.8.2 / npm 11.11.1.
- A Cloudflare account for eventual deployment (not used in local dev).

## Install and configure

```powershell
cd C:\Users\Nikhil\Desktop\RouteSync
npm run install:all
```

Enter Supabase keys manually in these two files (both already contain the project URL
and empty key placeholders; both are Git-ignored):

| File | Variables |
| --- | --- |
| `frontend\.env.local` | `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `backend\.dev.vars` | `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` |

The secret key must only go in `backend\.dev.vars` / Worker secrets. Never put it in
`frontend\.env.local`, source code or Git.

Templates that can be committed: `frontend\.env.local.example`, `backend\.dev.vars.example`, `.env.example`.

### Environment variables

| Variable | Location | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `frontend\.env.local` | Browser Supabase URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `frontend\.env.local` | Browser publishable key (RLS-scoped) |
| `SUPABASE_URL` | `backend\.dev.vars` | Worker Supabase URL |
| `SUPABASE_PUBLISHABLE_KEY` | `backend\.dev.vars` | Worker user-scoped operations / health probe |
| `SUPABASE_SECRET_KEY` | `backend\.dev.vars` | Server-only privileged client (explicitly authorised) |
| `FRONTEND_PORT` | optional `frontend\.env.local` or root `.env` | Vite port (default 5173) |
| `BACKEND_URL` | optional `frontend\.env.local` or root `.env` | Dev proxy target (default `http://localhost:8787`) |
| `CORS_ORIGIN` | optional Worker var | Comma-separated allowed origins (default `http://localhost:5173`) |

## Startup commands (PowerShell)

```powershell
# Both Worker and Vite dev server together
npm run dev

# Or in separate terminals
npm run dev:worker
npm run dev:frontend
```

Worker/API: `http://localhost:8787` · Frontend: `http://localhost:5173`

## Authentication and portals

Supabase Auth (email/password) is wired into both ends. Only **customer
self-registration** is public; restaurant, rider and admin accounts are created by
a trusted server-side process (`npm run seed:demo`, or `public.admin_set_user_role`).

| Route | Access |
| --- | --- |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | public |
| `/admin` | role `admin` |
| `/restaurant` | role `restaurant` |
| `/delivery-partner` | role `rider` |
| `/customer` | role `customer` |
| `/delivery` | redirects to `/delivery-partner` |

- Sessions persist across reloads via `supabase-js`; `AuthProvider` hydrates once.
- `ProtectedRoute` sends anonymous users to `/login` and wrong-role users to their
  own portal.
- `GET /api/auth/me` → 401 without a valid token, otherwise the trusted profile.
- `GET /api/admin/status` → 401 anonymous, 403 non-admin, 200 admin.
- Roles are read from `profiles.role`; JWT/user metadata is never trusted.

## Database and security

Seventeen application tables, all with RLS enabled and explicit grants only:
`profiles`, `restaurants`, `menu_categories`, `menu_items`, `customer_addresses`,
`riders`, `rider_shifts`, `orders`, `order_items`, `assignments`,
`delivery_routes`, `route_stops`, `rider_locations`, `notifications`,
`scheduling_runs`, `constraint_violations`, `audit_logs`.

- Signup always creates a `customer` profile; the role column is not grantable.
- Role changes require the admin RPC or service role and are audit-logged.
- Money uses integer minor units; delivery windows, prep times, rider capacity,
  shift overlap and route sequences are constrained in SQL.
- Customers, restaurants and riders see only their own rows; scheduling internals
  and audit logs are admin-only.

Full migration order, dashboard configuration, seed instructions and live
verification steps: **`docs/PHASE3_DATABASE_AUTH.md`**.

## Build and test

```powershell
npm run build                         # React production build -> frontend/dist
npm run test                          # offline schema + role-routing audit (31 checks)
npm run test:schema                   # migrations, RLS and grants only
npm run test:routing                  # role map + protected routes only
npm run dev:worker                    # serves API + built assets on :8787

# In another PowerShell terminal:
Invoke-RestMethod http://localhost:8787/api/health
Invoke-RestMethod http://localhost:8787/admin       # SPA fallback -> index.html
Invoke-RestMethod http://localhost:8787/login       # auth page (public)
Invoke-RestMethod http://localhost:5173/api/health  # Vite dev proxy (with dev frontend running)
```

`npm run test:remote` verifies real sign-in, 401/403 handling, RLS isolation,
escalation attempts and constraints. It requires applied migrations, the demo seed
and a running Worker; see `tests/README.md`. Without configuration it reports
**skipped** tests, never false passes.

`npm run seed:demo` writes demo accounts and Belagavi data. It is idempotent,
development-only, reads passwords from `DEMO_*` environment variables and must not
be run until the migrations are applied and you explicitly approve it.

`GET /api/health` returns HTTP 200 only when the Worker runtime, static asset binding
and a real Supabase health probe all succeed. With empty keys it returns HTTP 503 with
`supabase.reason = "credentials_missing"`; no connection is ever claimed without a
verified probe, and no credentials or internal errors are included in the response.

## Deployment (later, after approval — not executed in Phase 2)

```powershell
npm run build
npx wrangler login
npm run worker:deploy
npm run worker:tail
```

Secrets for deployed Worker: set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SECRET_KEY` with `wrangler secret put <NAME>` from `backend\`.

## Portfolio of files

```
RouteSync/
├── .env.example, .gitignore, README.md, package.json
├── docs/PROJECT_PLAN.md, docs/PHASE3_DATABASE_AUTH.md
├── supabase/migrations/
│   ├── 20261124100100_enums.sql
│   ├── 20261124100200_core_tables.sql
│   ├── 20261124100300_operations_tables.sql
│   ├── 20261124100400_functions_and_triggers.sql
│   ├── 20261124100500_rls_policies.sql
│   └── 20261124100600_grants.sql
├── tests/
│   ├── schema-static.test.mjs, role-routing.test.mjs
│   ├── remote-auth.test.mjs, README.md
├── backend/
│   ├── .dev.vars.example, .dev.vars, package.json, wrangler.jsonc
│   ├── scripts/seed-demo.js
│   └── src/
│       ├── index.js, app.js
│       ├── config/, controllers/, middleware/, routes/
│       ├── lib/supabase.js, lib/supabase.health.js
│       └── engines/ (E1–E4 preserved)
└── frontend/
    ├── .env.local.example, .env.local, package.json, vite.config.js
    └── src/
        ├── api/, auth/, lib/, pages/ (auth/ included), components/
        ├── router.jsx, App.jsx, main.jsx, index.css
        └── index.html
```

## Phase 3 verification

Verified locally: six migrations prepared and audited (31 offline checks), production
frontend build, Worker startup, `/api/health` 200, `/api/auth/me` 401 without a token,
`/api/admin/status` 401 without a token, and SPA serving for `/login`, `/admin`,
`/restaurant`, `/delivery-partner`, `/customer`.

Not yet verified: live sign-in, role redirects, RLS isolation and the demo seed,
because the migrations have not been applied to the remote project. Apply them via
`docs/PHASE3_DATABASE_AUTH.md`, then run `npm run test:remote`.

## Phase 2 verification

Verified locally: dependency installation, production frontend build, Worker startup,
`/api/health` response with empty keys (degraded, no false success), API routing, CORS
restriction, 404 handling, SPA fallback for portal routes, and Vite `/api` proxy.
Supabase connectivity was subsequently verified with the real keys (`/api/health` → 200,
`supabase.connected = true`).
