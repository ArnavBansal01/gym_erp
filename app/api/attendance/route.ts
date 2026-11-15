import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getUserDoc, q, recordAttendance, HttpErr } from '@/lib/db';
import { computeMembership } from '@/lib/membershipUtils';

export const dynamic = 'force-dynamic';
const VALID_GYM_IDS = ['AURA_CLUB_MAIN_ENTRANCE', 'AURA_CLUB_FLOOR_2'];

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 });
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const body = await request.json();
    let { action, gymId } = body;
    if (!['check-in', 'check-out'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be check-in or check-out.' }, { status: 400 });
    }
    let resolvedGymId = gymId || 'AURA_CLUB_MAIN_ENTRANCE';
    if (typeof gymId === 'string' && gymId.startsWith('{')) {
      try { resolvedGymId = JSON.parse(gymId).gymId || resolvedGymId; } catch (e) {}
    }
    if (!VALID_GYM_IDS.includes(resolvedGymId) && !resolvedGymId.toLowerCase().includes('aura')) {
      return NextResponse.json({ error: 'Invalid QR Code. Please scan the official Gym QR.' }, { status: 400 });
    }
    gymId = VALID_GYM_IDS.includes(resolvedGymId) ? resolvedGymId : 'AURA_CLUB_MAIN_ENTRANCE';

    const existing = await getUserDoc(userId);
    if (!existing) {
      return NextResponse.json({ error: 'User record not found. Please complete profile setup first.' }, { status: 404 });
    }

    const result = await recordAttendance({
      uid: userId, action, gymId,
      guard: (u) => {
        const role = u.role || 'member';
        const cur = u.currentStatus || 'OUT';
        if (role === 'trainer') {
          const status = u.status || (u.totalSessions > 0 ? 'approved' : 'pending');
          if (status !== 'approved') throw new HttpErr(403, 'Trainer account is pending admin approval. You cannot record duty attendance until approved.');
          if (action === 'check-in' && cur === 'IN') throw new HttpErr(400, 'Already Checked IN!');
          if (action === 'check-out' && cur === 'OUT') throw new HttpErr(400, 'Already Checked OUT!');
          return;
        }
        if (action === 'check-in') {
          const { isExpired, endDateFormatted } = computeMembership(u.plan, u.createdAt);
          if (isExpired) throw new HttpErr(403, `Access Denied: Your membership expired on ${endDateFormatted}. Please renew in your member portal or at the front desk.`);
        }
        if (action === 'check-in' && cur === 'IN') throw new HttpErr(400, 'You are already Checked IN!');
        if (action === 'check-out' && cur === 'OUT') throw new HttpErr(400, 'You are already Checked OUT!');
      },
    });

    if (result.doc.role === 'trainer') {
      return NextResponse.json({ success: true, role: 'trainer', message: `Duty ${action === 'check-in' ? 'Started' : 'Ended'} Successfully!` });
    }
    return NextResponse.json({
      success: true, role: 'member', totalSessions: result.newSessions,
      currentStatus: action === 'check-in' ? 'IN' : 'OUT',
      message: `Successfully ${action === 'check-in' ? 'Checked In' : 'Checked Out'}!`,
    });
  } catch (error: any) {
    if (error instanceof HttpErr) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Attendance API Error:', error);
    return NextResponse.json({ error: 'Server Error: ' + error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');
    let attendedDates: number[] = [];
    if (uid) {
      let r = await q(
        `SELECT logged_at FROM attendance_logs WHERE user_uid = $1 AND (status IN ('Present','Checked Out') OR status IS NULL)
         ORDER BY logged_at DESC LIMIT 60`, [uid]);
      if (r.rowCount === 0) r = await q(`SELECT logged_at FROM attendance_logs WHERE user_uid = $1 ORDER BY logged_at DESC LIMIT 60`, [uid]);
      attendedDates = r.rows.map((x: any) => new Date(x.logged_at).getTime());
    }
    const act = await q(`SELECT count(*)::int AS n FROM users WHERE role = 'member' AND current_status = 'IN'`);
    return NextResponse.json({ success: true, activeFloorCount: act.rows[0].n, attendedDates });
  } catch (error: any) {
    console.error('Attendance GET API Error:', error);
    return NextResponse.json({ success: false, activeFloorCount: 0, attendedDates: [], error: error.message });
  }
}
