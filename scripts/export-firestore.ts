// STEP 1 of data migration: dump every Firestore collection to scripts/out/*.json  (run: npx tsx scripts/export-firestore.ts)
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let key = process.env.FIREBASE_PRIVATE_KEY || '';
if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
key = key.replace(/\\n/g, '\n');
initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: key }) });
const db = getFirestore();

function plain(v: any): any {
  if (v === null || v === undefined) return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

async function main() {
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const dump = async (name: string) => {
    const snap = await db.collection(name).get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...plain(d.data()) }));
    fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(rows, null, 1));
    console.log(`${name}: ${rows.length}`);
    return snap;
  };
  const users = await dump('users');
  for (const name of ['trainers', 'logs', 'payments', 'expenses']) await dump(name);
  for (const sub of ['attendance_logs', 'trainer_logs']) {
    const rows: any[] = [];
    for (const u of users.docs) {
      const s = await u.ref.collection(sub).get();
      s.forEach((d) => rows.push({ id: d.id, userId: u.id, ...plain(d.data()) }));
    }
    fs.writeFileSync(path.join(out, `users_${sub}.json`), JSON.stringify(rows, null, 1));
    console.log(`users/*/${sub}: ${rows.length}`);
  }
  console.log('Export complete -> scripts/out/');
}
main().catch((e) => { console.error(e); process.exit(1); });
