<div align="center">

# ⚡ AURA Athletic Club ERP
### High-Performance Fitness Management & Touchless Access Ecosystem

An all-in-one, role-based ERP and member access platform engineered for **AURA Athletic Club**. Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, and Google Firebase.

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?style=for-the-badge&logo=next.js)](https://n  extjs.org/)
[![React](https://img.shields.io/badge/React-19.2.3-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-v12-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Playwright](https://img.shields.io/badge/Playwright-E2E_Tests-2EAD33?style=for-the-badge&logo=playwright)](https://playwright.dev/)

<br/>

[Explore Portals](#-portal-walkthrough) • [System Architecture](#-system-architecture) • [Getting Started](#-getting-started) • [API Documentation](#-api-endpoints) • [Security & RBAC](#-security--rbac)

<br/>

<p align="center">
  <img src="docs/after/home-desktop.png" alt="AURA Athletic Club UI Preview" width="850" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.12); max-width: 100%; height: auto;" />
</p>

</div>

---

## 📋 Table of Contents
- [Overview](#-overview)
- [Key Features](#-key-features)
- [Portal Walkthrough](#-portal-walkthrough)
  - [1. Unified Landing & Authentication](#1-unified-landing--authentication)
  - [2. Member Dashboard & Gate Pass](#2-member-dashboard--gate-pass)
  - [3. Trainer Management & Client Coaching](#3-trainer-management--client-coaching)
  - [4. Receptionist & Admin ERP](#4-receptionist--admin-erp)
- [System Architecture](#-system-architecture)
- [Data Models & Collections](#-data-models--collections)
- [API Endpoints](#-api-endpoints)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
  - [Running Development Server](#running-development-server)
  - [Production Build](#production-build)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Project Structure](#-project-structure)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🚀 Overview

**AURA Athletic Club ERP** connects members, elite personal trainers, and gym front-desk operations into a unified real-time dashboard. The application replaces legacy paper logs, physical punch cards, and fragmented spreadsheets with:

- **Touchless QR Gate Passes** with live scanner terminals for members and staff.
- **Dynamic Floor Headcount** showing active members currently working out.
- **Membership Lifecycle Automation** tracking active tiers, renewal dates, and expirations.
- **Coach-to-Client Roster Management** empowering trainers to track progress and record client assessments.
- **Executive Administration & Financials** delivering member directories, staff approval pipelines, and revenue/expense ledgers.

---

## ✨ Key Features

| Domain | Highlights |
|---|---|
| **Gate Access & Scans** | Real-time QR scanner with camera recognition (`html5-qrcode`), file upload fallback, audio chime feedback, and anti-duplicate check-in protection. |
| **Membership Plans** | Automated multi-tier tracking (Basic, Pro, Elite), duration extensions, and renewal workflows. |
| **Staff Governance** | Multi-state trainer approval funnel (`pending` ➔ `approved` / `rejected` / `revoked`). |
| **Live Headcount** | Real-time active member & coach occupancy calculation updated instantly upon entry/exit. |
| **Financial Ledger** | Operational expense logging, revenue metrics breakdown, and membership income aggregation. |
| **Design System** | Clean Athletic Orange (`#FF5A1F`) & Warm Ivory (`#FAF8F5`) aesthetic, responsive typography (Geist + Barlow Condensed), and glassmorphic UI. |

---

## 🖥️ Portal Walkthrough

### 1. Unified Landing & Authentication (`/`)
- Dual-persona gateway for **Members** and **Coaching Staff**.
- One-click Google OAuth authentication via Firebase Auth.
- Intelligent session detection with instantaneous routing:
  - Members ➔ `/dashboard`
  - Approved Trainers ➔ `/trainer/dashboard`
  - Pending Trainers ➔ `/pending-approval`
  - Administrators ➔ `/admin`
- Onboarding modal triggers for first-time sign-ups with plan selection and coach pairing.

### 2. Member Dashboard & Gate Pass (`/dashboard`, `/attendance`)
- **Digital Gate Pass**: Generates unique encrypted QR passes refreshed per session.
- **Attendance Terminal**: Dual-mode terminal enabling members to self-scan the gym entry QR or display their personal badge.
- **Subscription Analytics**: Days remaining, tier perks, expiry dates, and instant self-serve renewal modal.
- **Assigned Coach Details**: Direct coach card displaying assigned personal trainer contact and specialization.
- **Attendance History**: Monthly workout streak and historical log timestamps.

### 3. Trainer Management & Client Coaching (`/trainer/*`)
- **Coaching Staff Dashboard**: Active client roster overview with contact cards.
- **Performance Rating & Logs**: Record workout adherence ratings (1–5 stars) and confidential client notes (`/api/trainer/rate`).
- **Staff Attendance**: Dedicated trainer check-in/out terminal ensuring staff hours are logged independently.
- **Application Status Shield**: Clear review screens for applicant coaches awaiting club management approval.

### 4. Receptionist & Admin ERP (`/admin`)
- **Reception Scanner Engine**: Front-desk camera scanner processing incoming and outgoing members with audio chime confirmation.
- **Live Floor Control**: Real-time list of members currently on premises with manual 1-click toggle override.
- **Member Directory**: Full member ledger with search, tier filtering, and membership extension triggers.
- **Coach Approval Pipeline**: Review pending trainer applicants with 1-click Approve, Reject, or Revoke privileges.
- **Expense & Revenue Tracker**: Add operational club expenses (equipment, maintenance, utilities) and view net financials.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph ClientApp["Client Application Layer (Next.js 16)"]
        Landing["Universal Landing & Role Gateway"]
        MemberApp["Member Portal & Dynamic Pass"]
        TrainerApp["Trainer Portal & Client Roster"]
        AdminERP["Admin ERP & Reception Terminal"]
    end

    subgraph AuthLayer["Identity & Access Management"]
        FirebaseAuth["Firebase Client Auth (Google OAuth)"]
        AdminSession["Admin Session Guard"]
    end

    subgraph ServerLayer["Server API Route Handlers"]
        TokenAuth["Token Verification (Firebase Admin SDK)"]
        AuthAPI["Auth & Registration Handlers"]
        MemberAPI["Membership & Attendance Handlers"]
        TrainerAPI["Trainer Roster & Rating Handlers"]
        AdminAPI["Reception Scan & Management Handlers"]
    end

    subgraph DataLayer["Cloud Database (Google Cloud Firestore)"]
        UsersCol[("users Collection")]
        AttCol[("attendance Collection")]
        ExpCol[("expenses Collection")]
    end

    Landing --> FirebaseAuth
    MemberApp --> FirebaseAuth
    TrainerApp --> FirebaseAuth
    AdminERP --> AdminSession

    FirebaseAuth --> TokenAuth
    TokenAuth --> AuthAPI
    TokenAuth --> MemberAPI
    TokenAuth --> TrainerAPI
    AdminSession --> AdminAPI

    AuthAPI --> UsersCol
    MemberAPI --> UsersCol
    MemberAPI --> AttCol
    TrainerAPI --> UsersCol
    AdminAPI --> UsersCol
    AdminAPI --> AttCol
    AdminAPI --> ExpCol
```

---

## 🗄️ Data Models & Collections

### `users` Collection
Stores member profiles, trainer credentials, and application states:
```typescript
interface UserDocument {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: "member" | "trainer" | "admin";
  status?: "pending" | "approved" | "rejected" | "revoked"; // For trainers
  createdAt: string; // ISO date string
  
  // Member Specific
  assignedTrainer?: {
    uid: string;
    name: string;
    phone: string;
  };
  plan?: {
    name: string;
    tier: "basic" | "pro" | "elite";
    price: string;
    durationMonths: number;
    startDate: string;
    endDate: string;
    daysLeft: number;
  };
  
  // Trainer Specific
  specialization?: string;
  experience?: string;
  ratingNotes?: Record<string, { rating: number; notes: string; updatedAt: string }>;
}
```

### `attendance` Collection
Tracks individual check-in and check-out events:
```typescript
interface AttendanceRecord {
  uid: string;
  userName: string;
  userRole: "member" | "trainer";
  userPhone?: string;
  planName?: string;
  action: "check_in" | "check_out";
  timestamp: FirebaseFirestore.Timestamp;
  dateString: string; // YYYY-MM-DD
  timeString: string; // HH:mm:ss
}
```

### `expenses` Collection
Records operational club outlays:
```typescript
interface ExpenseRecord {
  title: string;
  category: "equipment" | "maintenance" | "utilities" | "salary" | "misc";
  amount: number;
  date: string;
  createdAt: FirebaseFirestore.Timestamp;
}
```

---

## 🔌 API Endpoints

| Route | Method | Authorization | Description |
|---|:---:|:---:|---|
| `/api/auth/me` | `GET` | Bearer Token | Verifies token & returns user profile, role, and approval status |
| `/api/auth/register` | `POST` | Bearer Token | Registers a new member or trainer application |
| `/api/trainers` | `GET` | Public | Retrieves all approved trainers for member coach assignment |
| `/api/attendance` | `GET` | Bearer Token | Returns user attendance history and live floor count |
| `/api/attendance` | `POST` | Bearer Token | Logs a user check-in or check-out event |
| `/api/trainer/clients` | `GET` | Public | Returns all members assigned to a specific trainer |
| `/api/trainer/rate` | `POST` | Public | Saves trainer evaluations, ratings, and notes for a member |
| `/api/admin/data` | `GET`, `POST` | Admin Session | `GET`: Full system dump (users, logs, expenses). `POST`: Record expense. |
| `/api/admin/scan` | `POST` | Admin Session | Processes a front-desk QR scan and manages gym occupancy |
| `/api/admin/trainer-approval` | `POST` | Admin Session | Updates trainer application state (`approved`, `rejected`, `revoked`) |
| `/api/admin/renew-membership` | `POST` | Admin Session | Extends a member's active plan duration |

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16.1.6](https://nextjs.org/) (App Router, Turbopack, React Server Components)
- **UI Library**: [React 19.2.3](https://react.dev/)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Database & Auth**: [Google Firebase Client SDK 12.9](https://firebase.google.com/) & [Firebase Admin SDK 13.6](https://firebase.google.com/docs/admin/setup)
- **Hardware Integration**: [HTML5 QR Code](https://github.com/mebjas/html5-qrcode) & [qrcode](https://www.npmjs.com/package/qrcode)
- **Testing**: [Playwright 1.64](https://playwright.dev/)
- **Fonts**: [Geist](https://vercel.com/font) & [Barlow Condensed](https://fonts.google.com/specimen/Barlow+Condensed)

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) `20.x` or higher
- `npm` (bundled with Node) or `yarn` / `pnpm`
- A configured Google Firebase Project with **Firestore** and **Firebase Authentication (Google Sign-In Provider)** enabled

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/aura-athletic-erp.git
   cd aura-athletic-erp
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

### Environment Configuration

Create a `.env` file in the root directory (refer to `.env.example`):

```env
# Firebase Admin SDK (Server-Side)
FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...YOUR_PRIVATE_KEY...\n-----END PRIVATE KEY-----\n"

# Firebase Client SDK (Public)
NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSy..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-firebase-project-id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
NEXT_PUBLIC_FIREBASE_APP_ID="1:xxx:web:xxx"
```

### Running Development Server

Launch the Next.js development server:

```bash
npm run dev
```

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

> Default Administrator ERP credentials:  
> **Username**: `admin`  
> **Password**: `boss123`

### Production Build

Create an optimized, standalone production build:

```bash
npm run build
npm run start
```

---

## 🧪 Testing & Quality Assurance

AURA Athletic Club ERP includes an end-to-end smoke testing suite powered by **Playwright**.

```bash
# Run headless smoke tests
npm run test:smoke

# Launch Playwright interactive UI test runner
npm run test:smoke:ui
```

Smoke test coverage includes:
- Home page authentication cards and role selection flows
- Member dashboard navigation, renewals, and pass generation
- Camera scanner permissions and attendance terminal interaction
- Trainer onboarding and dashboard client tables
- Receptionist desk QR scanning and administrative controls

---

## 📁 Project Structure

```text
aura-athletic-erp/
├── app/
│   ├── admin/                # Reception ERP & management control center
│   ├── api/                  # Next.js Server Route Handlers
│   │   ├── admin/            # Admin operations (data, scans, approvals, renewals)
│   │   ├── attendance/       # Member check-in/out & floor occupancy API
│   │   ├── auth/             # Session verification & registration routes
│   │   ├── trainer/          # Trainer client rosters & rating system
│   │   └── trainers/         # Public trainer discovery
│   ├── attendance/           # Member QR gate pass & scanner terminal
│   ├── dashboard/            # Member dashboard (subscriptions, coach, history)
│   ├── pending-approval/     # Trainer verification waiting room
│   ├── trainer/              # Trainer portal (dashboard, login, attendance)
│   ├── globals.css           # Global Tailwind tokens & custom components
│   ├── layout.tsx            # Root HTML layout with Google Font bindings
│   └── page.tsx              # Universal landing & authentication router
├── components/               # Shared reusable React components
├── docs/                     # Technical specs, redesign audits, and screenshots
├── lib/
│   ├── firebase.ts           # Client Firebase initialization (singleton)
│   ├── firebaseAdmin.ts      # Server-side Firebase Admin SDK credential setup
│   ├── membershipUtils.ts    # Membership tier definitions & pricing formulas
│   └── svgIcons.tsx          # Optimized inline SVG iconography set
├── public/                   # Static branding assets and icons
├── tests/
│   └── smoke/                # Playwright end-to-end test scenarios
├── .env                      # Local environment secrets (ignored by git)
├── .env.example              # Environment variables template
├── .gitignore                # Production git filtering rules
├── next.config.ts            # Next.js build & bundler configuration
├── package.json              # Dependencies and script definitions
├── playwright.config.ts      # Playwright test harness configuration
└── tsconfig.json             # TypeScript compiler settings
```

---

## 🛡️ Security & RBAC

- **Role Verification**: Client views are protected via real-time token assertions against `/api/auth/me`.
- **Server Guard**: Firebase Admin SDK decrypts and validates Google ID tokens on protected endpoints.
- **Hydration Safe**: `suppressHydrationWarning` flags prevent interference from third-party browser extensions.
- **Credential Hygiene**: Gitignore guarantees zero leaks of `.env` configurations, PEM certificates, and service account keypairs.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<div align="center">
  <sub>Built with ⚡ for <strong>AURA Athletic Club</strong></sub>
</div>
