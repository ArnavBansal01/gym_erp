// Firebase Admin is used ONLY to verify login tokens (Firebase Auth). All data lives in PostgreSQL (see lib/db.ts).
import { cert, getApps, initializeApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

function initFirebaseAdmin(): App {
  if (getApps().length > 0) return getApps()[0];
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) {
    if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  if (!projectId || !clientEmail || !privateKey) {
    try { return initializeApp({ projectId: projectId || 'aura-athletic-build' }); } catch { return getApps()[0]; }
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_t, prop) {
    initFirebaseAdmin();
    const auth = getAuth();
    const val = (auth as any)[prop];
    return typeof val === 'function' ? val.bind(auth) : val;
  },
});
