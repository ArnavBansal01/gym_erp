# Behavior Inventory — Iconic Gym ERP

Generated: 2026-11-02 (Phase 0 safety net)

---

## 1. Routes

| Route | File | Auth Required | Role Gate |
|-------|------|--------------|-----------|
| `/` | `app/page.tsx` | Optional (shows session banner if logged in) | None |
| `/dashboard` | `app/dashboard/page.tsx` | Firebase Auth (member) | Redirects trainers → `/trainer/dashboard`, admins → `/admin` |
| `/attendance` | `app/attendance/page.tsx` | Firebase Auth (member) | Redirects trainers → `/trainer/attendance` |
| `/admin` | `app/admin/page.tsx` | Local session (`sessionStorage "admin_authenticated"`) username/password: `admin`/`boss123` | Hard-coded credential check |
| `/pending-approval` | `app/pending-approval/page.tsx` | Firebase Auth (trainer, pending) | Redirects non-trainers → `/dashboard` |
| `/trainer` | `app/trainer/page.tsx` | Firebase Auth (trainer) | — |
| `/trainer/dashboard` | `app/trainer/dashboard/page.tsx` | Firebase Auth (trainer, approved) | — |
| `/trainer/login` | `app/trainer/login/page.tsx` | None | — |
| `/trainer/attendance` | `app/trainer/attendance/page.tsx` | Firebase Auth (trainer) | — |

---

## 2. API Routes

| Endpoint | Method(s) | Auth | Purpose |
|----------|-----------|------|---------|
| `/api/admin/data` | GET, POST | None (admin is session-gated at the page level) | GET: fetch all users, attendance logs, expenses. POST: add an expense. |
| `/api/admin/migrate-trainers` | POST | None | Migrate legacy trainer docs into unified users collection |
| `/api/admin/renew-membership` | POST | None | Extend a member's plan by N months |
| `/api/admin/scan` | POST | None | Process a QR scan: check-in or check-out a member/trainer |
| `/api/admin/trainer-approval` | POST | None | approve / reject / revoke a trainer application |
| `/api/attendance` | GET, POST | Firebase ID token (Authorization header) | GET: fetch attendance dates + live floor count. POST: log check-in or check-out. |
| `/api/auth/me` | GET | Firebase ID token (Authorization header) | Check if user exists in Firestore, return role/status |
| `/api/auth/register` | POST | Firebase ID token (Authorization header) | Register a new member or trainer |
| `/api/trainer/clients` | GET | None (trainer UID via query param) | Return all members assigned to a trainer |
| `/api/trainer/rate` | POST | None | Save trainer's rating + notes on a member |
| `/api/trainers` | GET | None | Return all approved trainers |

---

## 3. Firestore Collections Read/Written

| Collection | Operations | By |
|-----------|-----------|-----|
| `users` | read (onSnapshot, getDoc), write (setDoc, updateDoc) | `api/auth/me`, `api/auth/register`, `api/admin/data`, `api/admin/scan`, `api/admin/trainer-approval`, `api/admin/renew-membership`, `api/trainer/clients`, `api/trainer/rate`, `app/dashboard`, `app/attendance`, `app/pending-approval`, `app/trainer/dashboard`, `app/trainer/attendance` |
| `attendance` | read, write (addDoc, getDocs, query, where, orderBy) | `api/attendance`, `api/admin/data`, `api/admin/scan` |
| `expenses` | read, write (addDoc, getDocs) | `api/admin/data` |
| `trainers` (legacy) | read (getDocs) | `api/admin/migrate-trainers` |

---

## 4. onClick / onSubmit Handlers

### `app/page.tsx` (Login / Role Selection)
| Handler | Trigger | Action |
|---------|---------|--------|
| `handleRoleLogin("member")` | Member card "Sign in as Member" button | Google OAuth popup → `/api/auth/me` → route to `/dashboard` or show member modal |
| `handleRoleLogin("trainer")` | Trainer card "Sign in as Trainer" button | Google OAuth popup → `/api/auth/me` → route to `/trainer/dashboard` or `/pending-approval` |
| `submitRegistration("member")` | Member modal "Complete Registration" button | POST `/api/auth/register` → `/dashboard` |
| `submitRegistration("trainer")` | Trainer modal "Submit Trainer Application" button | POST `/api/auth/register` → `/pending-approval` |
| `handleLogout` | Logout button (active session banner) | Firebase `signOut` → clear state |
| `setShowMemberModal(true)` | "Join as a Member" link | Open member registration modal |
| `setShowTrainerModal(true)` | "Apply as Coach" link | Open trainer registration modal |
| `setShowMemberModal(false)` / `setShowTrainerModal(false)` | Modal X close button | Close modal |

### `app/dashboard/page.tsx` (Member Dashboard)
| Handler | Trigger | Action |
|---------|---------|--------|
| `setActiveTab("overview"\|"attendance"\|"profile")` | Tab buttons | Switch displayed content |
| `handleLogout` | Logout button | Firebase `signOut` → `/` |
| `router.push("/attendance")` | "Gate Pass / Scan" button | Navigate to attendance page |
| `setRenewModalOpen(true)` | "Renew / Extend Plan" and "View All Membership Tiers" buttons | Open renewal modal |
| `handleRenewPlan(months, planName, price)` | Plan selection buttons inside renewal modal | POST `/api/admin/renew-membership` |

### `app/attendance/page.tsx` (Member Attendance Terminal)
| Handler | Trigger | Action |
|---------|---------|--------|
| `setViewMode("pass"\|"camera")` | Tab toggle buttons | Switch between QR pass view and camera scanner |
| `handleLogAttendance()` | "Log Check-In / Check-Out" button (pass view) | POST `/api/attendance` → show `ackModal` |
| `handleLogAttendance(decodedText)` | QR camera scanner decode callback | POST `/api/attendance` → show `ackModal` |
| `processFile(file)` | File upload input (`#file-upload`), native camera input (`#native-camera-input`) | Scan QR from image → `handleLogAttendance` |
| `startCameraScanner()` | Entering camera tab, retry button | `navigator.mediaDevices.getUserMedia` → `Html5Qrcode.start` |
| `stopCameraScanner()` | Leaving camera tab / cleanup | `Html5Qrcode.stop` |
| `handleCloseAckModal()` | "Done & Return to My Pass" button in ackModal | Clear modal, set `viewMode = "pass"`, release scan lock |
| `router.push("/dashboard")` | "Dashboard" back button | Navigate back |

### `app/admin/page.tsx` (Admin ERP)
| Handler | Trigger | Action |
|---------|---------|--------|
| `handleLogin(e)` | Admin login form submit | Check `admin`/`boss123`, set `sessionStorage` flag |
| `handleLogout()` | Logout button | Clear `sessionStorage`, reset auth state |
| `fetchRealData()` | On auth, on scan, on approval | GET `/api/admin/data` → populate all state |
| `startReceptionScanner()` | Opening reception scanner panel | Camera permission + `Html5Qrcode.start` |
| `stopReceptionScanner()` | Closing scanner panel / cleanup | `Html5Qrcode.stop` |
| `handleExecuteScan(qrData)` | QR scan decode callback, manual scan input | POST `/api/admin/scan` → show `scanAckModal` |
| `handleCloseScanAckModal()` | "Acknowledge" button in scan modal | Clear modal, release lock, resume camera |
| `handleDirectCheckToggle(uid, status)` | Toggle IN/OUT button in members table | POST `/api/admin/scan` with `forcedAction` |
| `handleTrainerApproval(uid, action)` | Approve / Reject / Revoke buttons | POST `/api/admin/trainer-approval` |
| `handleAddExpense(e)` | Expense modal form submit | POST `/api/admin/data` with expense data |
| `openRenewModal(member)` | Renew button in members table | Set `renewModalMember` state |
| `handleRenewSubmit(e)` | Renew modal form submit | POST `/api/admin/renew-membership` |
| `handleMigrateTrainers()` | "Sync DB" button | POST `/api/admin/migrate-trainers` |
| `processAdminFile(file)` | Admin camera file input | Scan QR from image → `handleExecuteScan` |
| `setActiveTab(tab)` | Tab buttons | Switch admin view |
| `setMemberFilter(filter)` | Filter buttons (ALL/ACTIVE/EXPIRING/EXPIRED) | Filter member table |

### `app/pending-approval/page.tsx`
| Handler | Trigger | Action |
|---------|---------|--------|
| `handleLogout()` | Sign Out button | Firebase `signOut` → `/` |

### `app/trainer/dashboard/page.tsx`
| Handler | Trigger | Action |
|---------|---------|--------|
| `setActiveTab(tab)` | Tab buttons | Switch trainer view |
| `setShowModal(true)` | "Rate Workout" buttons | Open rating modal |
| `handleSaveRating()` | "Save Rating" modal submit | POST `/api/trainer/rate` |
| `handleDutyToggle()` | Duty toggle button | POST `/api/admin/scan` (check-in/out trainer) |
| `handleLogout()` | Logout button | Firebase `signOut` |

---

## 5. IDs / data-testids Used by Scanner / QR Logic

| ID | File | Purpose |
|----|------|---------|
| `reader` | `app/attendance/page.tsx` | Html5Qrcode viewfinder container (MEMBER scanner) |
| `file-reader-hidden` | `app/attendance/page.tsx` | Hidden container for Html5Qrcode file scan |
| `file-upload` | `app/attendance/page.tsx` | Hidden file input for QR image upload |
| `native-camera-input` | `app/attendance/page.tsx` | Native camera `<input capture>` element |
| `admin-reception-scanner` | `app/admin/page.tsx` | Html5Qrcode viewfinder container (ADMIN scanner) |
| `admin-hidden-file-reader` | `app/admin/page.tsx` | Hidden container for admin QR file scan |

---

## 6. CSS Classes Used by Existing Pages (must survive globals.css changes)

| Class | Usage |
|-------|-------|
| `.gym-card` | Card containers across multiple pages |
| `.gym-input` | Form text/tel/password inputs |
| `.gym-select` | Form select dropdowns |
| `.btn-emerald` | Primary action buttons |
| `.btn-slate` | Secondary/ghost buttons |
| `.btn-secondary` | Used in pending-approval page (no definition found — likely planned) |
| `.status-pill` | Used in pending-approval page |
| `.status-warning` | Used in pending-approval page |

---

## 7. External Dependencies Requiring Mocking in Tests

| Dependency | What to Mock |
|-----------|-------------|
| `firebase/auth` | `onAuthStateChanged`, `signInWithPopup`, `signOut`, `GoogleAuthProvider` |
| `firebase/firestore` | `onSnapshot`, `doc`, `getDoc`, `addDoc`, `getDocs`, `query`, `where`, `orderBy`, `updateDoc`, `setDoc` |
| `html5-qrcode` | `Html5Qrcode` class (constructor, `.start()`, `.stop()`, `.pause()`, `.resume()`, `.clear()`, `.scanFileV2()`, `.isScanning`) |
| `qrcode` | `QRCode.toDataURL` |
| `navigator.mediaDevices` | `getUserMedia` |
| `/api/*` routes | Fetch mocks (MSW or `global.fetch` override) |

