# RouteSync — Academic Project Plan

_Compiled from the read-only Gate 0 and Gate 1 reference documents in
`C:\Users\Nikhil\Downloads\RouteSync\RouteSync` and the final Phase 2 architecture._

## 1. Identity and academic context

| Field | Value |
| --- | --- |
| Theme | Constraint-Based Timetable Scheduling |
| Title | RouteSync — Smart Constraint-Based Food Delivery Management System |
| Team | Team 05, Department of Computer Science and Engineering, KLE Technological University |
| Guide | Prof. Tabassum |
| Academic year | 2026–27 |
| Architecture | Four independent academic engines, one integrated delivery workflow |

## 2. Gate 0 — problem definition and need

**Problem statement.** Given orders with delivery windows, priority, load and location,
plus limited riders with availability, capacity and shift constraints, there is no
systematic way to assign orders and sequence routes so that all hard constraints
(availability, capacity, shift, delivery window including travel/service time, and
no incompatible overlap) are satisfied while travel cost stays low and infeasible
cases are explained.

**Evidence and stakeholders.** Customer complaints about late/cold food and poor
tracking, observed manual dispatch, informal interviews, and VRPTW literature.
Primary stakeholders: customers, riders, dispatchers. Secondary: restaurant staff,
owners, faculty evaluators, map/GPS providers.

**Objectives.** Model assignment as a CSP; produce assignments with zero hard-constraint
violations on documented sample data; evaluate batches with Dijkstra/A* and stop
sequencing; detect/explain conflicts and search alternatives; reschedule after
cancellations, unavailability or delays; maintain validation and assignment history;
expose status, notifications and (later) timestamped tracking.

**In scope.** Order intake with time window/priority/load, CSP scheduling, rider/shift
resource checks, batching and stop sequencing, conflict explanation, rescheduling,
database validation and history, dispatcher/customer views, sample-data testing.
**Out of scope.** Online payments, ML ETA/demand forecasting, weather-aware optimisation,
production-scale routing, inventory management, native mobile apps.

**Assumptions.** Simulated order/rider/road-graph data is acceptable; fleet size is
limited (roughly 5–30 riders); exact backtracking is used only for small instances;
maps/GPS are added only after the scheduling core is stable.

## 3. Gate 1 — requirements baseline

### 3.1 Functional requirements (FR)

| ID | Requirement | Priority | Primary engine |
| --- | --- | --- | --- |
| FR-01 | Capture order details, location, time window, priority and load | Mandatory | E2 / E4 |
| FR-02 | Validate required order, location, time-window and resource fields before scheduling | Mandatory | E2 |
| FR-03 | Maintain rider availability, capacity, shifts and current commitments | Mandatory | E3 |
| FR-04 | Generate assignments satisfying all hard constraints | Mandatory | E1 |
| FR-05 | Detect overlaps, capacity violations and infeasible windows | Mandatory | E3 / E1 |
| FR-06 | Evaluate batching and feasible stop sequences | Mandatory | E1 |
| FR-07 | Try alternative riders, slots and sequences | Mandatory | E1 / E3 |
| FR-08 | Explain violations or report no feasible assignment | Mandatory | E1 |
| FR-09 | Reschedule after cancellation, unavailability or material delay | Challenge | E1 / E3 / E2 |
| FR-10 | Display planned route and latest authorised, timestamped rider location | Challenge | E4 |
| FR-11 | Estimate arrival times and flag possible delays | Challenge | E1 / E4 |
| FR-12 | Provide dispatcher views of orders, resources, assignments, conflicts, status and metrics | Challenge | E4 |
| FR-13 | Propagate authorised status updates and notifications | Challenge | E4 |
| FR-14 | Maintain assignment history and validation/conflict records | Challenge | E2 |
| FR-15 | Compare schedules against a stated baseline using defined metrics | Challenge | E1 / E4 |

### 3.2 Non-functional requirements (NFR)

- **NFR-01** hard-constraint correctness on all accepted schedules (target 100% on defined tests).
- **NFR-02** zero double-booking of exclusive resources in conflict tests.
- **NFR-03** data integrity; invalid references and records rejected or flagged.
- **NFR-04** bounded runtime on a documented workload (proposed 20 orders / 5 riders, ≤10 s after baseline).
- **NFR-05** explainability: every rejected candidate records a violated constraint or no-solution reason.
- **NFR-06** role-based access; unauthorised requests denied; location data protected.
- **NFR-07** tracking honesty: every location has a timestamp; stale (>60 s proposed threshold) or missing updates are shown as stale/unavailable, never live.
- **NFR-08** each engine has documented responsibility, input, output and interface.
- **NFR-09** requirements traceability matrix links needs → requirements → tests.
- **NFR-10** dispatcher can identify the limiting constraint and choose an alternative from the conflict view.

### 3.3 Use cases and ten planned features

Use cases UC-01…UC-12 cover registration/role access, order submission and validation,
resource management, schedule generation, batching, conflict resolution, rescheduling,
schedule comparison, authorised tracking, status updates and history/analytics.

Planned features (all still to implement): (1) constraint-based order scheduling,
(2) multi-order batching and route optimisation, (3) conflict detection and resolution,
(4) dynamic rescheduling, (5) constraint explanation and schedule comparison,
(6) Leaflet/OpenStreetMap route and live rider tracking, (7) ETA and delay alerts,
(8) dispatcher dashboard and analytics, (9) customer notifications and status updates,
(10) data validation and assignment history.

## 4. Four-engine architecture

The engines are one pipeline, not four separate apps:
`order → E2 validate → E3 resource candidates → E1 schedule/route → E2 record → E4 communicate`.
A disruption (cancellation, delay, unavailability) loops through E2 → E3 → E1 again.

| Engine | Owner | Course concepts | Responsibility | Inputs → outputs | State owned |
| --- | --- | --- | --- | --- | --- |
| **E1 Smart Scheduling & Optimization** | Nikhita Rajesh Patil | Discrete Mathematics + DSA | CSP variables/domains/constraints, hard vs soft constraints, backtracking/heuristics, conflict graph, route sequencing, baseline comparison | validated orders + eligible candidates + travel times → assignment, sequence, cost, alternatives or infeasibility reason | candidate assignments, route graph, constraint state |
| **E2 Data & Validation** | Nikhil Vijapur | DBMS + SE/SDLC | Schema and RLS in Supabase Postgres, field/validation rules, integrity, assignment/validation/conflict history, RTM evidence | order/resource/status events → validated records, errors, history | orders, assignments, logs, traceability |
| **E3 Resource Management** | Sakshi Magadum | Operating Systems | Availability, capacity, shifts, slot occupancy, overlap/double-booking detection, priority policy, alternative resources | validated orders + rider records → eligible candidates and conflict details | availability, capacity, shifts, commitments |
| **E4 Communication & Tracking** | Ritvik Shinde | Web Technologies + Computer Networks | REST APIs on Hono/Workers, Supabase Auth/Realtime/Storage integration, role-aware views, status propagation, notifications, timestamped location | order requests + approved assignments + status/GPS updates → API responses, views, notifications, map data | role/session state, status, timestamped location |

Engine boundaries: E1 does not own data integrity or notifications; E2 does not choose
riders or routes; E3 does not route or notify; E4 does not decide assignments or validate
business data. Each engine must remain independently testable with stubbed inputs.

## 5. Four portal responsibilities

| Portal | Planned responsibility |
| --- | --- |
| **Admin / Dispatcher** | Review orders and conflicts, run/override schedules (authorised overrides recorded), manage riders/shifts, view assignments, status and metrics. |
| **Restaurant** | Confirm preparation readiness, hand-off status, pickup-slot coordination and order status updates. |
| **Delivery Partner** | View assigned tasks and route sequence, accept updates, send status and (with consent) timestamped location updates. |
| **Customer** | Place orders with delivery constraints, view order status, ETA/delay alerts and authorised tracking information. |

Only reserved client-side route shells exist in Phase 2; dashboards are intentionally
out of scope.

## 6. Final architecture (Phase 2)

```
Browser (React 19 + Vite 7 + Tailwind 4 + React Router 7 + Lucide)
  │  /api/*  ── Vite dev proxy (5173 → 8787) ──┐
  │  same-origin in production                 │
  ├─────────────────────────────────────────────▼
  │  Cloudflare Worker (Hono 4, Wrangler 4)                 │
  │   ├─ /api/health   → runtime + Supabase probe          │
  │   ├─ E1–E4 modules → preserved boundaries              │
  │   └─ Supabase clients: user-scoped default,            │
  │      privileged secret-key client explicitly gated     │
  └─────────────────────────────────────────────────────────┘
        static assets: frontend/dist (SPA fallback to index.html)
                    │
                    ▼
        Supabase PostgreSQL / Auth / Realtime / Storage
        (RLS enabled; no automatic grants to new tables)
```

Security baseline: no credentials in source or Git; publishable key only in the browser;
secret key only in Worker environment; RLS is never disabled; future migrations must
explicitly grant permissions and add policies; role assignment is never self-service.

## 7. Remaining development phases

1. **Phase 3 — Data and identity:** explicit Supabase migrations with RLS policies and
   grants, JWT/bcrypt role-aware auth flows, user/profile/role model, validation rules (E2).
2. **Phase 4 — Scheduling core:** E3 resource state and conflict checks, E1 CSP/backtracking,
   heuristics, batching and stop sequencing, explanation records and baseline metrics.
3. **Phase 5 — Portals:** dispatcher, restaurant, rider and customer views with role guards;
   assignment history and conflict/alternative UI (E4/E2).
4. **Phase 6 — Tracking and reporting:** Supabase Realtime status propagation, Leaflet +
   OpenStreetMap with stale-location handling, Recharts dashboards, notification flows.
5. **Phase 7 — Verification and delivery:** TC-01…TC-17 evidence, RTM closure, measured
   KPIs, README/deployment notes and Cloudflare deployment after approval.

Each phase must preserve the engine boundaries and the academic acceptance criteria above.
