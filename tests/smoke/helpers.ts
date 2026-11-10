/**
 * helpers.ts — shared mocks and utilities for all smoke tests.
 *
 * STRATEGY:
 *  - Firebase JS SDK calls are intercepted via the browser's fetch/XHR layer
 *    using Playwright's route() API at the network level.
 *  - Firebase Auth state is simulated by injecting localStorage + cookie tokens
 *    that the SDK reads on init, and by intercepting the token-refresh endpoint.
 *  - Firestore reads are intercepted by mocking the REST/gRPC-web endpoint.
 *  - API routes (/api/*) are intercepted directly so they never hit the real server.
 *  - The camera (getUserMedia) is mocked via page.addInitScript.
 *  - Html5Qrcode is mocked to prevent real camera access.
 */

import { Page, Route } from "@playwright/test";

// ── Fake user fixtures ──────────────────────────────────────────────────────

export const FAKE_MEMBER = {
  uid: "test-member-uid-001",
  name: "Arjun Test",
  email: "arjun@test.com",
  phone: "+91 99887 76655",
  role: "member",
  currentStatus: "OUT",
  plan: {
    name: "Monthly Standard",
    tier: "Standard",
    price: "2500",
    durationMonths: 1,
    startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
    daysLeft: 25,
  },
  attendanceCount: 12,
  rating: 8,
  trainerNotes: "Great progress on compound lifts.",
  assignedTrainer: { name: "Coach Vikram", specialization: "Strength & Conditioning" },
  attendance: { attended: 12 },
};

export const FAKE_TRAINER = {
  uid: "test-trainer-uid-001",
  name: "Vikram Coach",
  email: "vikram@test.com",
  phone: "+91 88776 65544",
  role: "trainer",
  status: "approved",
  currentStatus: "OUT",
  specialization: "Strength & Conditioning",
  experience: "5 years",
  totalSessions: 48,
};

export const FAKE_ADMIN_MEMBER_LIST = [
  {
    id: "member-001",
    name: "Arjun Test",
    phone: "+91 99887 76655",
    email: "arjun@test.com",
    role: "member",
    plan: FAKE_MEMBER.plan,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    currentStatus: "OUT",
    totalSessions: 12,
    assignedTrainer: { name: "Coach Vikram", uid: "test-trainer-uid-001" },
  },
];

// ── Mock: Camera / getUserMedia ─────────────────────────────────────────────

export async function mockCamera(page: Page) {
  await page.addInitScript(() => {
    // Provide a fake getUserMedia that returns a silent video track
    const fakeStream = {
      getTracks: () => [{ stop: () => {} }],
      getVideoTracks: () => [{ stop: () => {} }],
      getAudioTracks: () => [],
    };
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => fakeStream,
        enumerateDevices: async () => [],
      },
      writable: true,
      configurable: true,
    });

    // Mock Html5Qrcode so it never tries to access a real camera
    (window as any).__html5QrcodeMocked = true;
  });
}

// ── Mock: Html5Qrcode module (via page script injection) ────────────────────

export async function mockHtml5Qrcode(page: Page) {
  await page.addInitScript(() => {
    // Intercept the module after it loads by overriding on window
    // (Html5Qrcode is imported at module level so we need to mock via prototype patch)
    const noop = async () => {};
    // Will be applied once window.Html5Qrcode is set
    const patchWhenAvailable = () => {
      if ((window as any).Html5Qrcode) {
        const proto = (window as any).Html5Qrcode.prototype;
        proto.start = noop;
        proto.stop = noop;
        proto.pause = () => {};
        proto.resume = () => {};
        proto.clear = () => {};
        proto.isScanning = false;
        proto.scanFileV2 = async () => ({
          decodedText: JSON.stringify({
            gymId: "AURA_CLUB_MAIN_ENTRANCE",
            memberUid: "test-member-uid-001",
            action: "check-in",
          }),
          result: { text: "" },
        });
      } else {
        setTimeout(patchWhenAvailable, 50);
      }
    };
    patchWhenAvailable();
  });
}

// ── Mock: Firebase Auth state ───────────────────────────────────────────────

/**
 * Injects a fake Firebase Auth current user into localStorage so Firebase SDK
 * reads it on init without hitting the network.
 */
export async function mockFirebaseAuth(page: Page, user: typeof FAKE_MEMBER | typeof FAKE_TRAINER | null) {
  await page.addInitScript((u) => {
    // Firebase Auth v10 stores current user in localStorage under key:
    // `firebase:authUser:<apiKey>:[DEFAULT]`
    // We inject a plausible structure the SDK will read.
    if (u) {
      const key = Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser")) ||
        "firebase:authUser:fake-api-key:[DEFAULT]";
      const fakeAuthEntry = {
        uid: u.uid,
        email: u.email,
        displayName: u.name,
        emailVerified: true,
        isAnonymous: false,
        providerData: [{ providerId: "google.com", uid: u.email, email: u.email }],
        stsTokenManager: {
          refreshToken: "fake-refresh-token",
          accessToken: "fake-id-token",
          expirationTime: Date.now() + 3600 * 1000,
        },
        createdAt: "1700000000000",
        lastLoginAt: "1700000000000",
        apiKey: "fake-api-key",
        appName: "[DEFAULT]",
      };
      localStorage.setItem(key, JSON.stringify(fakeAuthEntry));
    }
  }, user);
}

// ── Mock: /api/* routes ─────────────────────────────────────────────────────

export async function mockApiRoutes(page: Page) {
  // GET /api/auth/me
  await page.route("**/api/auth/me", async (route: Route) => {
    const headers = route.request().headers();
    const auth = headers["authorization"] || "";
    if (auth.includes("trainer")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: true, user: FAKE_TRAINER }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: true, user: FAKE_MEMBER }),
      });
    }
  });

  // POST /api/auth/register
  await page.route("**/api/auth/register", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  // GET /api/attendance
  await page.route("**/api/attendance**", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          attendedDates: [Date.now() - 86400000, Date.now() - 2 * 86400000],
          activeFloorCount: 7,
        }),
      });
    } else {
      // POST — log attendance
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, action: "check-in", message: "Check-in recorded." }),
      });
    }
  });

  // GET /api/trainers
  await page.route("**/api/trainers**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ trainers: [FAKE_TRAINER] }),
    });
  });

  // GET /api/admin/data
  await page.route("**/api/admin/data**", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          users: [
            { ...FAKE_MEMBER, id: "member-001", role: "member" },
            { ...FAKE_TRAINER, id: "trainer-001", role: "trainer", status: "approved", totalSessions: 5 },
          ],
          logs: [
            { uid: "member-001", name: "Arjun Test", action: "check-in", timestamp: Date.now() - 3600000 },
          ],
          expenses: [{ category: "Equipment", amount: "5000", timestamp: Date.now() - 86400000 }],
        }),
      });
    } else {
      // POST — add expense
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    }
  });

  // POST /api/admin/scan
  await page.route("**/api/admin/scan**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        action: "check-in",
        message: "Check-in approved",
        user: FAKE_MEMBER,
      }),
    });
  });

  // POST /api/admin/trainer-approval
  await page.route("**/api/admin/trainer-approval**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  // POST /api/admin/renew-membership
  await page.route("**/api/admin/renew-membership**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  // POST /api/admin/migrate-trainers
  await page.route("**/api/admin/migrate-trainers**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "Sync complete" }),
    });
  });

  // GET /api/trainer/clients
  await page.route("**/api/trainer/clients**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ clients: [FAKE_MEMBER] }),
    });
  });

  // POST /api/trainer/rate
  await page.route("**/api/trainer/rate**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
}

// ── Mock: Firestore REST calls ──────────────────────────────────────────────

/**
 * Intercepts Firebase Firestore REST/gRPC-web calls.
 * Firebase JS SDK v9+ uses gRPC-web over HTTPS to firestore.googleapis.com.
 */
export async function mockFirestore(page: Page, userDoc: Record<string, unknown>) {
  await page.route(/firestore\.googleapis\.com/, async (route: Route) => {
    // Return a minimal Firestore document response
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        document: {
          name: "projects/fake/databases/(default)/documents/users/fake-uid",
          fields: Object.fromEntries(
            Object.entries(userDoc).map(([k, v]) => [
              k,
              typeof v === "string"
                ? { stringValue: v }
                : typeof v === "number"
                ? { integerValue: String(v) }
                : typeof v === "object" && v !== null
                ? { mapValue: { fields: {} } }
                : { nullValue: null },
            ])
          ),
          createTime: new Date().toISOString(),
          updateTime: new Date().toISOString(),
        },
      }),
    });
  });

  // Also intercept Firebase token refresh
  await page.route(/securetoken\.googleapis\.com/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "fake-id-token",
        expires_in: "3600",
        token_type: "Bearer",
        refresh_token: "fake-refresh-token",
        id_token: "fake-id-token",
        user_id: userDoc.uid || "fake-uid",
        project_id: "fake-project",
      }),
    });
  });

  // Intercept Firebase Auth REST
  await page.route(/identitytoolkit\.googleapis\.com/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "identitytoolkit#GetAccountInfoResponse",
        users: [{ localId: userDoc.uid || "fake-uid", email: userDoc.email || "test@test.com" }],
      }),
    });
  });
}

