// STEP 2 of data migration: create tables (db/schema.sql) and load scripts/out/*.json into Supabase Postgres.
// run: npx tsx scripts/load-postgres.ts        (WARNING: drops and recreates the gym tables)
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getPool, upsertUser, addMembership, addLog } from '../lib/db';

const out = path.join(__dirname, 'out');
const read = (n: string): any[] => { const p = path.join(out, n); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []; };
const num = (v: any, d = 0) => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(n) && String(v ?? '') !== '' ? n : d; };
const date = (v: any) => { const d = v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d : null; };

async function main() {
  const pool = getPool();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

    // ---- users (+ legacy trainers collection) ----
    const users = read('users.json');
    const ids = new Set(users.map((u) => u.id));
    for (const t of read('trainers.json')) {
      if (!ids.has(t.id)) { users.push({ ...t, role: 'trainer', status: t.status || 'approved' }); ids.add(t.id); }
    }
    for (const u of users) {
      const { id, plan, assignedTrainer, attendance, ...rest } = u;
      const role = ['member', 'trainer', 'admin'].includes(rest.role) ? rest.role : 'member';
      const fields: any = {
        ...rest, role,
        name: String(rest.name ?? ''), email: String(rest.email ?? ''), phone: String(rest.phone ?? ''),
        totalSessions: Math.max(0, Math.round(num(rest.totalSessions ?? attendance?.attended))),
        todaySessions: Math.round(num(rest.todaySessions)), dailySessionCount: Math.round(num(rest.dailySessionCount)),
        shiftsAssigned: Math.round(num(rest.shiftsAssigned)), shiftsAttended: Math.round(num(rest.shiftsAttended)),
        rating: Math.max(0, num(rest.rating)), currentStatus: rest.currentStatus === 'IN' ? 'IN' : 'OUT',
        attendance,
      };
      if (!date(rest.createdAt)) fields.createdAt = new Date();
      if (rest.lastCheckInDate && typeof rest.lastCheckInDate !== 'string') fields.lastCheckInDate = String(rest.lastCheckInDate);
      await upsertUser(c, id, fields);
    }
    // second pass: trainer links (FK needs every user to exist first) + current plan
    for (const u of users) {
      const tid = u.assignedTrainer?.uid;
      if (tid && tid !== 'general' && ids.has(tid)) await c.query('UPDATE users SET assigned_trainer_uid=$2 WHERE uid=$1', [u.id, tid]);
      if (u.plan && u.role !== 'trainer') await addMembership(c, u.id, u.plan);
    }

    // ---- attendance: global `logs` first; per-user copies only for users with no global log ----
    const seen = new Set<string>();
    let nLogs = 0;
    for (const l of read('logs.json')) {
      const uid = ids.has(l.userId) ? l.userId : null;
      if (l.userId) seen.add(l.userId);
      const type = String(l.type || '').toUpperCase() === 'CHECK-OUT' ? 'CHECK-OUT' : 'CHECK-IN';
      await addLog(c, { uid: uid as any, name: l.userName, email: l.userEmail, role: String(l.role).toUpperCase() === 'TRAINER' ? 'TRAINER' : 'MEMBER',
        type, gymId: l.gymId || 'AURA_CLUB_MAIN_ENTRANCE', source: l.source, at: date(l.timestamp) || new Date() });
      nLogs++;
    }
    for (const l of read('users_attendance_logs.json').concat(read('users_trainer_logs.json'))) {
      if (seen.has(l.userId) || !ids.has(l.userId)) continue;
      const out = /out|ended/i.test(String(l.status));
      const role = users.find((u) => u.id === l.userId)?.role === 'trainer' ? 'TRAINER' : 'MEMBER';
      await addLog(c, { uid: l.userId, role, type: out ? 'CHECK-OUT' : 'CHECK-IN', gymId: l.gymId || 'AURA_CLUB_MAIN_ENTRANCE',
        source: l.source, status: l.status, checkInTime: l.checkInTime, at: date(l.date || l.timestamp) || new Date() });
      nLogs++;
    }

    // ---- payments & expenses ----
    for (const p of read('payments.json')) {
      await c.query(`INSERT INTO payments (member_uid,member_name,member_email,plan_name,amount,months,type,paid_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ids.has(p.memberUid) ? p.memberUid : null, p.memberName, p.memberEmail, p.planName, Math.max(0, num(p.amount)), p.months ?? null, p.type || 'MEMBERSHIP_RENEWAL', date(p.date) || new Date()]);
    }
    for (const e of read('expenses.json')) {
      await c.query(`INSERT INTO expenses (category, amount, spent_at) VALUES ($1,$2,$3)`, [e.category || 'General', Math.max(0, num(e.amount)), date(e.date) || new Date()]);
    }
    await c.query('COMMIT');

    console.log('\nRows now in Postgres:');
    for (const t of ['users', 'plans', 'memberships', 'payments', 'attendance_logs', 'expenses']) {
      console.log(`  ${t.padEnd(16)} ${(await c.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n}`);
    }
    console.log('\nFirestore source counts: users', users.length, '| logs', nLogs, '| payments', read('payments.json').length, '| expenses', read('expenses.json').length);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch((e) => { console.error('LOAD FAILED:', e.message); process.exit(1); });
