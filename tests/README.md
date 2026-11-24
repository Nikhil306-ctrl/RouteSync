# RouteSync tests

Everything here uses Node's built-in test runner (`node --test`). No test framework
dependency was added.

| Suite | Command | Needs network/DB? | What it proves |
| --- | --- | --- | --- |
| Static schema + security audit | `npm run test:schema` | No | Migrations exist in order, all 17 tables have RLS, grants are explicit and narrow, role changes are server-controlled, money is integer minor units, seed is guarded |
| Role routing | `npm run test:routing` | No | Frontend role map matches the DB enum, portals are wrapped in `ProtectedRoute`, wrong-role redirects, auth pages are public, placeholder shows name/role/logout |
| Remote auth + RLS | `npm run test:remote` | Yes — applied migrations, seed, running Worker | Real sign-in, 401/403, role redirects, cross-account isolation, escalation attempts, constraint rejection |

## Local suites

```powershell
npm run test:local     # schema + routing
npm run test:schema
npm run test:routing
```

These are safe at any time: they only read project files.

## Remote suite prerequisites

1. All six migrations applied (see `docs/PHASE3_DATABASE_AUTH.md`).
2. Demo seed executed (requires explicit approval).
3. Worker running locally: `npm run dev:worker` (port 8787).

Provide the demo passwords in the shell. The suite reads `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` from `backend/.dev.vars` and never loads the secret key.

```powershell
$env:DEMO_ADMIN_PASSWORD = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:DEMO_RESTAURANT_PASSWORD = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:DEMO_RIDER_PASSWORD = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:DEMO_CUSTOMER_PASSWORD = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
npm run test:remote
```

If the passwords or Supabase keys are absent, every remote test is reported as
**skipped**, not passed. A skip is not evidence that the database is correct.

### Optional write test

One remote test (public customer signup → customer profile → cleanup) is skipped
unless explicitly enabled:

```powershell
$env:RUN_REMOTE_WRITE_TESTS = '1'
npm run test:remote
```

It creates one throwaway auth user. Cleanup uses `SUPABASE_SECRET_KEY` if it is set
in the shell; otherwise delete the probe user from the Supabase dashboard.
All other remote tests are read-only, and the only other writes attempted are
deliberately invalid and must be rejected by RLS or constraints.

## What the remote suite does not cover

- Password reset email delivery (needs a real inbox and redirect URL config).
- Session persistence across browser reloads (manual browser check).
- Realtime and Storage (later phases).
- Full RLS matrix for every policy; it samples the highest-risk paths.
