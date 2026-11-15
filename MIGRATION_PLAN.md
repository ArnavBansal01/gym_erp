# Gym App: Firestore -> Supabase (PostgreSQL) Migration Plan

Handoff file. Any AI (or person) can resume from the first unchecked box. Update the checkboxes and the "STATUS LOG" at the bottom as work proceeds.

## 0. Goal and hard rules
- Demo for the teacher tomorrow, as a DBMS project. App must look and behave EXACTLY the same. Only the database service changes: Firestore -> Supabase Postgres.
- Keep **Firebase Auth** (Google login). Postgres cannot replace it, and swapping it adds scope. Firebase Admin stays only to verify ID tokens.
- No git, no pushing. Work on the unzipped copy.
- Keep every API response shape identical so pages do not notice.
- Do NOT fix or change security behaviour (hard-coded admin/boss123, unprotected routes). That would change behaviour. Mention it in the report as "future work".
- Real data exists: it must be exported from Firestore and loaded into Supabase, and be visible in the Supabase Table Editor.
- Pages must still update "live".
- Token economy: do not re-read the whole project. Use only the file list below.

## 1. What is in the project (verified)
Stack: Next.js (App Router), TypeScript, Firebase client + firebase-admin, Playwright smoke tests in `tests/smoke`.

Firestore collections used:
| Firestore | Meaning |
|---|---|
| `users/{uid}` | members, trainers and admin-ish users in one doc (role, name, email, phone, plan, trainer info embedded, lastCheckIn, timestamps, etc.) |
| `trainers/{uid}` | legacy trainer docs (migrated into `users` by `migrate-trainers` route) |
| `logs` | global attendance log |
| `users/{uid}/attendance_logs` | per-member log (duplicate of global) |
| `users/{uid}/trainer_logs` | per-trainer log (duplicate of global) |
| `payments` | one doc per membership renewal |
| `expenses` | admin expenses (title, amount, category, date) |

Files that touch Firestore (the ONLY files to change):
- API routes (11): `app/api/attendance/route.ts`, `app/api/auth/me`, `app/api/auth/register`, `app/api/trainers`, `app/api/trainer/clients`, `app/api/trainer/rate`, `app/api/admin/data`, `app/api/admin/scan`, `app/api/admin/renew-membership`, `app/api/admin/trainer-approval`, `app/api/admin/migrate-trainers`
- Pages with live `onSnapshot` listeners (5): `app/dashboard/page.tsx` (~l.74), `app/attendance/page.tsx` (~l.103), `app/pending-approval/page.tsx` (~l.26), `app/trainer/dashboard/page.tsx` (~l.89), `app/trainer/attendance/page.tsx` (~l.120)
- Also uses Firestore client or `toDate()`: `app/admin/page.tsx` (l.~1754 expense date), `app/page.tsx`, `app/trainer/login/page.tsx`, `lib/firebase.ts`, `lib/firebaseAdmin.ts`, `tests/smoke/helpers.ts`
- Timestamp handling to keep compatible: pages call `x.toDate()` and the attendance route reads `_seconds`. Responses must serialise dates so these still work (see Phase 3 note).

## 2. Architecture decision
Hybrid schema: proper relational tables with typed columns for everything queryable, plus a `extra JSONB` column on `users` for rarely used/unknown fields so no Firestore field is lost and response shapes can be rebuilt exactly.

Tables (3NF-ish, show in viva):
- `users(id TEXT PK = Firebase uid, role, name, email, phone, status, plan fields..., created_at, last_active, last_check_in, ..., extra JSONB)`
- `trainers(user_id PK/FK -> users, status, specialization, experience, approved_at, rejected_at ...)`
- `members(user_id PK/FK, trainer_id FK -> trainers, notes, rating)`
- `plans(id, name, tier, price, duration_days)` (hard-coded in client today)
- `memberships(id, member_id FK, plan_id FK, start_date, end_date)`
- `payments(id, member_id FK, amount, plan, paid_at ...)`
- `attendance_logs(id, user_id FK, type CHECK IN('CHECK-IN','CHECK-OUT'), logged_at)`  (merges 3 Firestore locations)
- `expenses(id, title, amount CHECK > 0, category, date)`
- View `membership_status` (Active/Expiring/Expired from end_date), indexes, a transaction/row-lock function for check-in/out, KPI SQL (SUM/GROUP BY), streak query with window functions.
(Exact columns must be decided by reading the 11 routes. Adjust, then record the final schema in `db/schema.sql`.)

Driver: `pg` (node-postgres) with plain `.sql` files. No Prisma.
Connection: Supabase **Session/Transaction pooler** URI (port 6543 or 5432 pooler host), `ssl: { rejectUnauthorized: false }`, one shared `Pool` in `lib/db.ts` (`globalThis` cached for Next dev).

Live updates (the 5 listeners):
- Default (safe, ships tomorrow): one endpoint per page returning the same data the snapshot gave, called with the Firebase ID token and polled every ~3s (`setInterval`, cleared on unmount). Looks live.
- Optional upgrade only if time remains: after each write the server sends a Supabase Realtime broadcast, page refetches. Not required.

## 3. What I need from the user (Supabase)
1. Create a free project at supabase.com. Save the **database password** (Project Settings -> Database).
2. Click **Connect** (top bar) -> copy the **Session pooler** connection string (looks like `postgresql://postgres.<ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`).
3. Put it in `.env.local` as `DATABASE_URL="..."` yourself. Do NOT paste the password into chat.
4. The Firebase admin keys already in `.env.local` are used once to export data. Keep them.
5. Because I cannot reach Supabase from the sandbox, you run the load step on your PC (commands given in Phase 2), and you open the project once before the demo (free projects pause after 7 days idle).
6. Optional: install local Postgres as demo backup (same SQL).

## PHASE 1 - Design and database (no app changes yet)
- [ ] P1.1 Read the 11 routes only (`grep` for fields written/read per collection) and list every field per collection into `docs/field-map.md`.
- [ ] P1.2 Write `db/schema.sql` (tables, constraints, FKs, CHECKs, indexes, view `membership_status`, function `do_attendance(...)` using `SELECT ... FOR UPDATE` to prevent double check-in).
- [ ] P1.3 Write `db/seed_queries.sql` / `db/queries.sql`: KPI revenue/expense/profit, attendance streak window query, EXPLAIN ANALYZE examples.
- [ ] P1.4 If a local Postgres is available (`which postgres`/`pg_ctl`), test schema there; otherwise review by eye and test on Supabase in Phase 2.
- Exit: schema runs with no errors.

## PHASE 2 - Data migration (real data -> Supabase)
- [ ] P2.1 `npm i pg dotenv` (and `@types/pg` dev).
- [ ] P2.2 `scripts/export-firestore.ts`: with firebase-admin dump `users`, `trainers`, `logs`, `payments`, `expenses`, `users/*/attendance_logs`, `users/*/trainer_logs` to `scripts/out/*.json` (timestamps -> ISO strings).
- [ ] P2.3 `scripts/load-postgres.ts`: connect with `DATABASE_URL`, run `db/schema.sql`, transform JSON -> rows, de-duplicate the 3 log copies into `attendance_logs`, insert in one transaction, print row counts per table.
- [ ] P2.4 User runs: `npx tsx scripts/export-firestore.ts` then `npx tsx scripts/load-postgres.ts`.
- [ ] P2.5 Verify: Firestore doc counts == Postgres row counts; open Supabase Table Editor and confirm rows.
- Exit: all real data visible in Supabase.

## PHASE 3 - Rewrite the backend (11 API routes)
- [ ] P3.1 `lib/db.ts` (Pool + `query` helper) and `lib/rowMappers.ts` (row -> the exact JSON shape each route returned from Firestore). Keep `lib/firebaseAdmin.ts` for `verifyIdToken` only (export `adminAuth`; remove `adminDb` usage).
- [ ] P3.2 Convert read-only routes first: `trainers`, `trainer/clients`, `admin/data` (GET), then `auth/me`.
- [ ] P3.3 Convert writes: `auth/register`, `trainer/rate`, `admin/data` (POST expense), `admin/renew-membership` (writes memberships + payments in one transaction), `admin/trainer-approval`, `admin/migrate-trainers` (can become a no-op returning the same shape).
- [ ] P3.4 Convert `attendance` and `admin/scan` (largest): use the transactional check-in/out function; GET returns the same streak/attended-dates data.
- Timestamp compatibility rule: wherever the old code emitted Firestore Timestamps to the client and pages call `.toDate()`, either keep returning ISO strings (pages must use `new Date(x)`) or return `{ _seconds, _nanoseconds }` plus update only those few lines. Prefer ISO strings and the smallest page edit; note each edit in CHANGES.md.
- Exit: `npx tsc --noEmit` passes; each route returns the same JSON keys as before (compare old vs new on a sample).

## PHASE 4 - Frontend live updates, verify, report
- [ ] P4.1 Add `app/api/me/route.ts` (and trainer variant if needed) returning what each `onSnapshot` read (user doc / trainer doc).
- [ ] P4.2 In the 5 pages replace `onSnapshot(...)` with a poll helper (`lib/usePoll.ts`, 3s, cleanup on unmount, sends ID token). Remove unused `firebase/firestore` imports. Do not touch JSX/styling.
- [ ] P4.3 Remove Firestore client init from `lib/firebase.ts` (keep Auth). Update `tests/smoke/helpers.ts` mocks if they intercept Firestore.
- [ ] P4.4 `npx tsc --noEmit`, `npm run build`, run smoke tests if possible. Manual checklist: login, member dashboard, QR scan check-in/out, admin KPIs, add expense, renew membership, trainer approval, trainer dashboard, ratings.
- [ ] P4.5 Write `CHANGES.md` (old Firestore thing -> new Postgres thing, per file) for the user's report.
- [x] P4.6 docs/VIVA.md written
- [ ] P4.7 Deliver the final zip (exclude `node_modules`, `.next`, and `.env*`).
- Exit: app works end to end on Supabase, deliverables handed over.

## Deliverable files
`MIGRATION_PLAN.md` (this), `db/schema.sql`, `db/queries.sql`, `scripts/export-firestore.ts`, `scripts/load-postgres.ts`, `lib/db.ts`, `lib/rowMappers.ts`, `app/api/me/route.ts`, `lib/usePoll.ts`, `CHANGES.md`, `docs/VIVA.md`, `docs/field-map.md`.

## Prompt to give another AI if limits hit
"Read MIGRATION_PLAN.md in the project root. Continue from the first unchecked box. Follow the hard rules. Update the STATUS LOG."

## STATUS LOG
- [x] Phases 1,3,4(code) DONE and tested on local Postgres 16 (schema, load script, atomic check-in race test, tsc clean except missing local qrcode install).
- [ ] REMAINING (user PC): npm install; npx tsx scripts/export-firestore.ts; npx tsx scripts/load-postgres.ts; npm run dev; manual checklist; Supabase dashboard check.
