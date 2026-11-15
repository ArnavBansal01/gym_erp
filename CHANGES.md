# What changed: Firebase Firestore -> Supabase (PostgreSQL)
Firebase **Authentication (Google login) is unchanged**. Only the database changed. UI, routes, QR flow, admin login and API response shapes are the same.

| Area | Before (Firestore) | After (PostgreSQL / Supabase) |
|---|---|---|
| Database | Firestore NoSQL documents | Supabase PostgreSQL, 6 tables + 1 view (`db/schema.sql`) |
| Driver | firebase-admin Firestore | `pg` (node-postgres), plain SQL, pooled connection (`lib/db.ts`) |
| users/{uid} (plan, trainer, attendance nested inside) | one document | `users` table; plan -> `memberships`; assignedTrainer -> FK `assigned_trainer_uid`; attendance numbers -> columns |
| Plan catalogue (hard-coded) | array in code | `plans` table (seeded with 3 plans) |
| Renewals | `users.plan` overwritten | new `memberships` row each renewal (history) + `payments` row, in ONE transaction |
| Attendance | 3 copies: `logs`, `users/*/attendance_logs`, `users/*/trainer_logs` | single `attendance_logs` table (type CHECK in ('CHECK-IN','CHECK-OUT')) |
| Expenses | strings | `expenses` table, `amount NUMERIC CHECK >= 0` |
| Check-in / out | batch write, race possible on double scan | transaction with `SELECT ... FOR UPDATE` row lock (`recordAttendance` in `lib/db.ts`) |
| Live updates | Firestore `onSnapshot` | `GET /api/me` polled every 3 s (`lib/pgSubscribe.ts`), pages get a snapshot-like object so code is unchanged |
| Membership status | computed in JS | JS (same) + SQL view `membership_status` |
| Legacy `trainers` collection | separate collection | merged into `users` (role=trainer) by the loader; `/api/admin/migrate-trainers` is now a no-op |

## Files changed
- NEW: `db/schema.sql`, `db/queries.sql`, `lib/db.ts`, `lib/pgSubscribe.ts`, `app/api/me/route.ts`, `scripts/export-firestore.ts`, `scripts/load-postgres.ts`, `MIGRATION_PLAN.md`, `CHANGES.md`
- REWRITTEN (same JSON responses): all 11 routes under `app/api/` (`auth/me`, `auth/register`, `trainers`, `trainer/clients`, `trainer/rate`, `attendance`, `admin/data`, `admin/scan`, `admin/renew-membership`, `admin/trainer-approval`, `admin/migrate-trainers`)
- `lib/firebaseAdmin.ts`: Firestore removed, only token verification remains. `lib/firebase.ts`: Firestore client removed (Auth kept).
- 5 pages: only the listener lines changed (`onSnapshot` -> `subscribeUser`) in `dashboard`, `attendance`, `pending-approval`, `trainer/dashboard`, `trainer/attendance`; `trainer/login` import tidy-up.
- `lib/membershipUtils.ts`: accepts ISO-string createdAt. `package.json`: + pg, dotenv, tsx. `.env`: + DATABASE_URL.

## Normalisation notes (for the report)
- UNF (nested Firestore docs, 3 duplicated log copies) -> 1NF (atomic columns, no arrays/maps) -> 2NF (plan data moved to `memberships`, keyed by membership id) -> 3NF (trainer name/phone/email no longer copied into every member: derived by joining `users` on `assigned_trainer_uid`).
- Rarely used legacy fields are kept in `users.extra` (JSONB) so no old data is lost.

## Known differences / limits
- Live updates = 3-second polling, not push.
- Security behaviour deliberately unchanged (hard-coded admin login, unprotected admin routes): listed as future work.
- Old `daysLeft` is now computed from `end_date` on read.
