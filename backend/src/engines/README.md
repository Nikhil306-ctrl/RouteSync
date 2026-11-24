# Academic engines (Phase 1 placeholders)

These four directories are reserved for the independent engines described in the
RouteSync blueprint. Phase 1 creates only the module boundaries; no algorithms,
schemas, sockets or workflows are implemented yet.

| Engine | Directory | Planned responsibility |
| --- | --- | --- |
| E1 | `e1-scheduling-optimization/` | CSP, backtracking, heuristics, route optimization |
| E2 | `e2-data-validation/` | DBMS integrity, input validation, assignment history |
| E3 | `e3-resource-management/` | Rider availability, capacity, shifts, conflict detection |
| E4 | `e4-communication-tracking/` | REST APIs, notifications, location updates |

Each folder has an `index.js` exporting a small identity object so later phases can
import a stable module path.
