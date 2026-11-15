// PostgreSQL (Supabase) data layer. Replaces Firestore. Builds the SAME document shapes the app already used.
import { Pool, PoolClient } from 'pg';

const g = globalThis as any;
export function getPool(): Pool {
  if (!g.__gymPool) {
    g.__gymPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('localhost') ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return g.__gymPool;
}
export const q = (text: string, params?: any[]) => getPool().query(text, params);

export class HttpErr extends Error {
  constructor(public status: number, message: string, public body?: any) { super(message); }
}

export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const iso = (d: any) => (d ? new Date(d).toISOString() : undefined);

export const USER_SELECT = `
SELECT u.*, t.name AS t_name, t.phone AS t_phone, t.email AS t_email,
  m.plan_name, m.plan_tier, m.price AS plan_price, m.duration_months,
  m.start_date, m.end_date, m.plan_status, m.last_renewed
FROM users u
LEFT JOIN users t ON t.uid = u.assigned_trainer_uid
LEFT JOIN LATERAL (SELECT * FROM memberships WHERE member_uid = u.uid ORDER BY id DESC LIMIT 1) m ON true`;

/** Row -> the document object the Firestore version returned (nested plan / assignedTrainer / attendance). */
export function rowToDoc(r: any): any {
  const d: any = {
    ...(r.extra || {}),
    uid: r.uid, role: r.role, name: r.name, email: r.email, phone: r.phone,
    currentStatus: r.current_status,
    totalSessions: r.total_sessions, todaySessions: r.today_sessions,
    dailySessionCount: r.daily_session_count,
    shiftsAssigned: r.shifts_assigned, shiftsAttended: r.shifts_attended,
    rating: Number(r.rating), createdAt: iso(r.created_at),
  };
  const opt: Record<string, any> = {
    status: r.status, specialization: r.specialization, experience: r.experience,
    message: r.message, trainerNotes: r.trainer_notes, lastCheckInDate: r.last_check_in_date,
    lastActive: iso(r.last_active), lastCheckIn: iso(r.last_check_in), requestedAt: iso(r.requested_at),
    approvedAt: iso(r.approved_at), rejectedAt: iso(r.rejected_at), revokedAt: iso(r.revoked_at),
    joiningDate: iso(r.joining_date),
  };
  for (const k of Object.keys(opt)) if (opt[k] !== null && opt[k] !== undefined) d[k] = opt[k];
  if (r.role !== 'trainer') {
    d.assignedTrainer = r.assigned_trainer_uid
      ? { uid: r.assigned_trainer_uid, name: r.t_name || 'Personal Coach', phone: r.t_phone || '', email: r.t_email || '' }
      : { uid: 'general', name: 'General Floor Coach', phone: '', email: 'coach@auraclub.fit' };
    const sched = r.scheduled_sessions || 30;
    d.attendance = {
      attended: r.total_sessions, scheduled: sched,
      percentage: r.total_sessions === 0 ? 100 : Math.min(100, Math.round((r.total_sessions / Math.max(sched, 1)) * 100)),
    };
    if (r.plan_name) {
      const end = r.end_date ? new Date(r.end_date) : null;
      const plan: any = { name: r.plan_name, price: r.plan_price ?? '0' };
      if (r.plan_tier) plan.tier = r.plan_tier;
      if (r.duration_months) plan.durationMonths = r.duration_months;
      if (r.start_date) plan.startDate = iso(r.start_date);
      if (end) {
        plan.endDate = end.toISOString();
        plan.daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
      }
      if (r.plan_status) plan.status = r.plan_status;
      if (r.last_renewed) plan.lastRenewed = iso(r.last_renewed);
      d.plan = plan;
    }
  }
  return d;
}

type Runner = { query: (t: string, p?: any[]) => Promise<any> };

export async function getUserDoc(uid: string, c: Runner = getPool(), lock = false): Promise<any | null> {
  const res = await c.query(`${USER_SELECT} WHERE u.uid = $1 ${lock ? 'FOR UPDATE OF u' : ''}`, [uid]);
  return res.rows[0] ? rowToDoc(res.rows[0]) : null;
}

const COLS: Record<string, string> = {
  role: 'role', name: 'name', email: 'email', phone: 'phone', status: 'status',
  currentStatus: 'current_status', specialization: 'specialization', experience: 'experience',
  totalSessions: 'total_sessions', todaySessions: 'today_sessions', dailySessionCount: 'daily_session_count',
  shiftsAssigned: 'shifts_assigned', shiftsAttended: 'shifts_attended', rating: 'rating',
  message: 'message', trainerNotes: 'trainer_notes', lastCheckInDate: 'last_check_in_date',
  createdAt: 'created_at', lastActive: 'last_active', lastCheckIn: 'last_check_in',
  requestedAt: 'requested_at', approvedAt: 'approved_at', rejectedAt: 'rejected_at',
  revokedAt: 'revoked_at', joiningDate: 'joining_date',
};
const DATE_KEYS = new Set(['createdAt', 'lastActive', 'lastCheckIn', 'requestedAt', 'approvedAt', 'rejectedAt', 'revokedAt', 'joiningDate']);
const SKIP = new Set(['uid', 'id', 'plan', 'attendance', 'assignedTrainer', 'assignedTrainerUid']);

/** Insert-or-merge a user from a document-shaped object (like Firestore set(..., {merge:true})). */
export async function upsertUser(c: Runner, uid: string, fields: any) {
  const cols: string[] = ['uid']; const vals: any[] = [uid]; const extra: any = {};
  const set = (col: string, v: any) => { cols.push(col); vals.push(v); };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || SKIP.has(k) || k.includes('.')) continue;
    if (COLS[k]) {
      if (DATE_KEYS.has(k)) {
        if (v === null) set(COLS[k], null);
        else { const dt = new Date(v as any); if (!isNaN(dt.getTime())) set(COLS[k], dt); }
      } else set(COLS[k], v);
    } else extra[k] = v;
  }
  if (fields.attendance && typeof fields.attendance.scheduled === 'number') set('scheduled_sessions', fields.attendance.scheduled);
  if (Object.prototype.hasOwnProperty.call(fields, 'assignedTrainerUid')) {
    set('assigned_trainer_uid', fields.assignedTrainerUid && fields.assignedTrainerUid !== 'general' ? fields.assignedTrainerUid : null);
  }
  const ph = vals.map((_, i) => `$${i + 1}`);
  const upd = cols.slice(1).map((cn) => `${cn} = EXCLUDED.${cn}`);
  let sql = `INSERT INTO users (${cols.join(',')}, extra) VALUES (${ph.join(',')}, $${vals.length + 1}::jsonb)
             ON CONFLICT (uid) DO UPDATE SET ${[...upd, 'extra = users.extra || EXCLUDED.extra'].join(', ')}`;
  await c.query(sql, [...vals, JSON.stringify(extra)]);
}

export async function addMembership(c: Runner, memberUid: string, p: any) {
  await c.query(
    `INSERT INTO memberships (member_uid, plan_name, plan_tier, price, duration_months, start_date, end_date, plan_status, last_renewed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [memberUid, p.name || 'Monthly Standard', p.tier ?? null, p.price != null ? String(p.price) : null,
     p.durationMonths ?? null, p.startDate ? new Date(p.startDate) : null, p.endDate ? new Date(p.endDate) : null,
     p.status ?? null, p.lastRenewed ? new Date(p.lastRenewed) : null]
  );
}

export async function addLog(c: Runner, l: {
  uid: string; name?: string; email?: string; role: 'MEMBER' | 'TRAINER'; type: string; gymId: string;
  source?: string; status?: string; checkInTime?: string; at?: Date;
}) {
  await c.query(
    `INSERT INTO attendance_logs (user_uid,user_name,user_email,role,type,gym_id,source,status,check_in_time,logged_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [l.uid, l.name ?? null, l.email ?? null, l.role, l.type, l.gymId, l.source ?? null, l.status ?? null, l.checkInTime ?? null, l.at ?? new Date()]
  );
}

/** Atomic check-in / check-out. Locks the user row so a double scan cannot log two check-ins. */
export async function recordAttendance(opts: {
  uid: string; action: 'check-in' | 'check-out'; gymId: string; source?: string;
  guard: (doc: any) => void; // throws HttpErr to refuse (expired, pending, already IN/OUT)
}) {
  return withTx(async (c) => {
    const doc = await getUserDoc(opts.uid, c, true);
    if (!doc) throw new HttpErr(404, 'User record not found.');
    opts.guard(doc);
    const checkIn = opts.action === 'check-in';
    const type = opts.action.toUpperCase();
    if (doc.role === 'trainer') {
      if (checkIn) {
        await c.query(`UPDATE users SET last_active=now(), current_status='IN', today_sessions=today_sessions+1,
          total_sessions=total_sessions+1, last_check_in_date=$2 WHERE uid=$1`, [opts.uid, new Date().toISOString().split('T')[0]]);
      } else {
        await c.query(`UPDATE users SET last_active=now(), current_status='OUT' WHERE uid=$1`, [opts.uid]);
      }
      await addLog(c, { uid: opts.uid, name: doc.name || 'Trainer', email: doc.email, role: 'TRAINER', type, gymId: opts.gymId,
        source: opts.source, status: checkIn ? 'Duty Started' : 'Duty Ended' });
      return { doc, newSessions: doc.totalSessions + (checkIn ? 1 : 0) };
    }
    const newSessions = checkIn ? Number(doc.totalSessions || 0) + 1 : Number(doc.totalSessions || 0);
    if (checkIn) {
      await c.query(`UPDATE users SET last_active=now(), last_check_in=now(), current_status='IN',
        total_sessions=$2, daily_session_count=daily_session_count+1 WHERE uid=$1`, [opts.uid, newSessions]);
    } else {
      await c.query(`UPDATE users SET last_active=now(), current_status='OUT', total_sessions=$2 WHERE uid=$1`, [opts.uid, newSessions]);
    }
    await addLog(c, { uid: opts.uid, name: doc.name || 'Member', email: doc.email, role: 'MEMBER', type, gymId: opts.gymId,
      source: opts.source, status: checkIn ? 'Present' : 'Checked Out',
      checkInTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) });
    return { doc, newSessions };
  });
}
