import { cert, getApps, initializeApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';

function initFirebaseAdmin(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) {
    if (
      (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))
    ) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  // If credentials are not present (e.g. during build phase on CI/Vercel),
  // initialize with a project placeholder so static analysis doesn't crash.
  if (!projectId || !clientEmail || !privateKey) {
    try {
      return initializeApp({
        projectId: projectId || 'aura-athletic-build',
      });
    } catch {
      return getApps()[0];
    }
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function getSafeDb(): Firestore {
  initFirebaseAdmin();
  return getFirestore();
}

function getSafeAuth(): Auth {
  initFirebaseAdmin();
  return getAuth();
}

export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    const db = getSafeDb();
    const val = (db as any)[prop];
    return typeof val === 'function' ? val.bind(db) : val;
  },
});

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const auth = getSafeAuth();
    const val = (auth as any)[prop];
    return typeof val === 'function' ? val.bind(auth) : val;
  },
});

export { FieldValue };
