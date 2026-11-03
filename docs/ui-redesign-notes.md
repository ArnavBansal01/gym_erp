# UI redesign — orange & white (Iconic Gym Karnal ERP)

Branch: `ui-redesign` (built on the Phase 0 safety-net commit). Changes are **uncommitted** in the working tree so you can review them first.

## What changed (10 files)

| File | Change |
|---|---|
| `app/globals.css` | New design tokens, light theme, restyled `.gym-card`, `.gym-input`, `.btn-emerald` (now the orange primary button), `.btn-slate`, new `.hero-dark`, global focus ring, reduced-motion support |
| `app/layout.tsx` | Fonts: Geist (body) + Barlow Condensed (headings/big numbers) via `next/font/google` (replaces Poppins/Montserrat) |
| `app/page.tsx`, `dashboard`, `attendance`, `admin`, `trainer/*`, `pending-approval` | **Only `className` strings** changed (+ 6 QR colour values, see below) |

Nothing in `app/api/**`, `lib/**`, Firebase config, hooks, handlers, state, element `id`s or scanner containers was touched.

## Design rules applied

- Canvas `#FAF8F5`, cards white with hairline `#ECE7E0`, ink `#141414`.
- One brand colour: orange `#FF5A1F`. Primary buttons are orange with **dark** text (white on orange fails contrast). Orange text under 18px uses `#C93E0B`.
- Dark `#141414` only for hero blocks: member pass, trainer duty pass, dashboard membership card.
- Status colours are semantic: green = active/inside/revenue/profit, gold = expiring/pending, red = expired/error/expenses, blue = check-out.
- No neon glows, coloured shadows or glass effects; decorative blur blobs hidden.
- Micro-labels are no longer forced ALL-CAPS; extra-bold/black weights softened to bold.
- QR codes: modules are now near-black `#141414` on a white tile (was dark teal) for more reliable scanning. Colour option only; QR payload/logic unchanged.

## How "nothing broke" was checked

1. **Structural proof:** each edited page was parsed (TypeScript AST) and compared with the committed original. Everything except `className` strings is identical, apart from the 6 intentional QR colour values.
2. `tsc --noEmit`: 0 errors. `next build`: passes, same 23 routes as before.
3. `eslint app`: 144 problems before and after (all pre-existing, none new).
4. Phase 0 Playwright smoke tests: 35 passed, 2 skipped (parked in Phase 0), 0 failed.
5. Before/after screenshots: `docs/before/` and `docs/after/` (after-shots use mocked login data).

## NOT covered by automated checks (please test by hand, ~3 minutes)

- Real Google sign-in, real Firestore reads/writes
- A real camera scan of a printed QR, then check-in and check-out
- Admin scan / renew / approve / expense flows against real data

Suggested pass: member sign-in, open My QR Pass, scan it from the admin turnstile, check out; renew a plan; approve a pending trainer.

## Known limits

- Layouts are the same as before (only styling changed). Wide admin and trainer tables still scroll sideways on phones.
- Status text such as `EXPIRING_SOON` is still the raw value the app produces (that is app logic, not styling).
- Dev-only: Next prints a small "N" badge in `npm run dev`. It is not part of the app.

## Rolling back

`git diff` shows everything. `git restore .` returns to the Phase 0 commit. Branch `new` is the untouched original.
