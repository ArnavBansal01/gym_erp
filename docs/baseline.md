# Phase 0 Baseline

**Branch**: `ui-redesign` (branched from `new` 2026-11-02)  
**Captured**: 2026-11-02

---

## 1. TypeScript — `tsc --noEmit`

**Exit code: 0 — no errors.**

---

## 2. ESLint — `npx eslint app --ext .ts,.tsx`

**Exit code: 0** (warnings present, no lint _errors_ that break the build).

### Pre-existing warnings (baseline — do NOT introduce new ones):
- `@typescript-eslint/no-unused-vars` — unused imports in `app/admin/page.tsx` (`IconDumbbell`, `IconUsers`, `IconCalendar`, `IconTrendingUp`, `fetchError`)
- `@typescript-eslint/no-explicit-any` — widespread `any` usage across all page files (existing, pre-redesign)
- `@next/next/no-img-element` — one `<img>` in `app/admin/page.tsx` (QR display)

> **Note**: `next lint` command fails because the project's `package.json` `"lint"` script is `"eslint"` (no target path), which defaults to looking for a `lint/` directory. Direct `npx eslint app` is the working form. This is a pre-existing project misconfiguration.

---

## 3. Next Build — `next build`

**Exit code: 0 — build succeeds.**

### Routes compiled:
| Route | Type |
|-------|------|
| `/` | Static |
| `/admin` | Static |
| `/api/admin/data` | Dynamic |
| `/api/admin/migrate-trainers` | Dynamic |
| `/api/admin/renew-membership` | Dynamic |
| `/api/admin/scan` | Dynamic |
| `/api/admin/trainer-approval` | Dynamic |
| `/api/attendance` | Dynamic |
| `/api/auth/me` | Dynamic |
| `/api/auth/register` | Dynamic |
| `/api/trainer/clients` | Dynamic |
| `/api/trainer/rate` | Dynamic |
| `/api/trainers` | Dynamic |
| `/attendance` | Static |
| `/dashboard` | Static |
| `/pending-approval` | Static |
| `/trainer` | Static |
| `/trainer/attendance` | Static |
| `/trainer/dashboard` | Static |
| `/trainer/login` | Static |

---

## 4. Playwright Smoke Tests

No Playwright suite existed before Phase 0. Tests are being added in Phase 0 (see `tests/smoke/`).

---

## 5. CSS Classes Used by Existing Pages

These class names are defined in `app/globals.css` and must remain functional after Phase 1:

| Class | Used in |
|-------|---------|
| `.gym-card` | `app/page.tsx` (modal containers indirectly), `app/attendance/page.tsx` |
| `.gym-input` | `app/page.tsx`, `app/admin/page.tsx`, `app/trainer/dashboard/page.tsx` |
| `.gym-select` | `app/page.tsx`, `app/admin/page.tsx` |
| `.btn-emerald` | `app/attendance/page.tsx` (x3), `app/admin/page.tsx` |
| `.btn-slate` | `app/attendance/page.tsx` |
| `.btn-secondary` | `app/pending-approval/page.tsx` (class used but NOT defined in globals.css — pre-existing gap) |
| `.status-pill` | `app/pending-approval/page.tsx` (class used but NOT defined in globals.css — pre-existing gap) |
| `.status-warning` | `app/pending-approval/page.tsx` (class used but NOT defined in globals.css — pre-existing gap) |

> **Note**: `.btn-secondary`, `.status-pill`, and `.status-warning` are referenced in `pending-approval/page.tsx` but have no definition in `globals.css`. This is a pre-existing issue — the pending-approval page's sign-out button and status chip will be unstyled. Phase 1 will add stub definitions so they at least render.

---

## 6. CSS Variables Used by Existing Pages (must survive Phase 1)

```
--font-poppins
--font-montserrat
--bg-main
--bg-card
--bg-card-hover
--border-subtle
--border-active
--accent-emerald
--accent-emerald-hover
--accent-emerald-glow
--text-primary
--text-secondary
--text-muted
--status-active
--status-warning
--status-danger
```

---

## 7. Uncommitted Working-Tree State (at time of branch creation)

The `new` branch has significant uncommitted changes (the full ERP additions):
- Modified: `app/api/attendance/route.ts`, `app/attendance/page.tsx`, `app/dashboard/page.tsx`, `app/globals.css`, `app/page.tsx`, `lib/firebase.ts`, `next.config.ts`, `package.json`
- Deleted (from original master): `app/api/payu-hash/route.ts`, `app/login_style.css`, `app/plans/page.tsx`, `app/register/page.tsx`, `app/success/page.tsx`, `app/user_erp_style.css`
- Untracked (new additions): `app/admin/`, `app/api/admin/`, `app/api/auth/`, `app/api/trainer/`, `app/api/trainers/`, `app/pending-approval/`, `app/trainer/`, `lib/firebaseAdmin.ts`, `lib/membershipUtils.ts`, `lib/svgIcons.tsx`

**These are all preserved and committed in the Phase 0 commit on `ui-redesign`.**

