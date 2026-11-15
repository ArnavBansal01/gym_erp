import { NextResponse } from 'next/server';
import { getUserDoc, q, recordAttendance, HttpErr } from '@/lib/db';
import { computeMembership } from '@/lib/membershipUtils';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { qrData, forcedAction } = body;
    if (!qrData) {
      return NextResponse.json({ error: 'Please enter a Member Name, Phone Number, UID, or QR code payload.' }, { status: 400 });
    }

    let targetUid = '';
    let gymId = 'AURA_CLUB_MAIN_ENTRANCE';
    let rawQuery = '';
    if (typeof qrData === 'string' && (qrData.startsWith('{') || qrData.startsWith('['))) {
      try {
        const parsed = JSON.parse(qrData);
        targetUid = parsed.memberUid || parsed.trainerUid || parsed.uid || '';
        if (parsed.gymId) gymId = parsed.gymId;
      } catch (e) { rawQuery = qrData.trim(); }
    } else {
      rawQuery = String(qrData).trim();
    }

    let userData: any = null;
    if (targetUid) userData = await getUserDoc(targetUid);
    if (!userData && rawQuery) {
      userData = await getUserDoc(rawQuery);
      if (userData) targetUid = userData.uid;
    }
    if (!userData && rawQuery) {
      const digitsOnly = rawQuery.replace(/\D/g, '');
      const cleanPhone = digitsOnly.length === 12 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;
      const phones = [rawQuery, cleanPhone, `+91${cleanPhone}`, `+91 ${cleanPhone}`, `0${cleanPhone}`].filter(Boolean);
      const r = await q(`SELECT uid FROM users WHERE phone = ANY($1) LIMIT 1`, [phones]);
      if (r.rowCount) { targetUid = r.rows[0].uid; userData = await getUserDoc(targetUid); }
    }
    if (!userData && rawQuery && rawQuery.includes('@')) {
      const r = await q(`SELECT uid FROM users WHERE lower(email) = $1 LIMIT 1`, [rawQuery.toLowerCase()]);
      if (r.rowCount) { targetUid = r.rows[0].uid; userData = await getUserDoc(targetUid); }
    }
    if (!userData && rawQuery) {
      const lower = rawQuery.toLowerCase();
      const all = await q(`SELECT uid, name, phone, email FROM users`);
      const match = all.rows.find((d: any) => {
        const name = (d.name || '').toLowerCase();
        const phone = (d.phone || '').replace(/\D/g, '');
        const email = (d.email || '').toLowerCase();
        return name === lower || name.includes(lower) || (phone && phone.includes(lower)) || email === lower || email.includes(lower);
      });
      if (match) { targetUid = match.uid; userData = await getUserDoc(targetUid); }
    }
    if (!userData || !targetUid) {
      return NextResponse.json({ error: `No member or coach found for "${rawQuery || targetUid}". Please check the name or phone number.` }, { status: 404 });
    }

    const role = (userData.role || 'member').toLowerCase();
    const currentStatus = userData.currentStatus === 'IN' ? 'IN' : 'OUT';
    const userName = userData.name || (role === 'trainer' ? 'Staff Coach' : 'Member');
    const nextAction: 'check-in' | 'check-out' = forcedAction || (currentStatus === 'IN' ? 'check-out' : 'check-in');

    if (role !== 'trainer') {
      const membership = computeMembership(userData.plan, userData.createdAt);
      if (nextAction === 'check-in' && membership.status === 'EXPIRED') {
        return NextResponse.json({
          error: `ACCESS DENIED: Membership for ${userName} has expired on ${membership.endDateFormatted}. Please renew subscription before entering.`,
          user: { id: targetUid, name: userName, phone: userData.phone || 'N/A', role: 'member', membership, currentStatus },
        }, { status: 403 });
      }
      await recordAttendance({ uid: targetUid, action: nextAction, gymId, source: 'RECEPTION_DESK', guard: () => {} });
      return NextResponse.json({
        success: true, action: nextAction,
        message: `${nextAction === 'check-in' ? 'Check-In' : 'Check-Out'} recorded for ${userName}.`,
        user: { id: targetUid, name: userName, phone: userData.phone || 'N/A', role: 'member', membership, newStatus: nextAction === 'check-in' ? 'IN' : 'OUT' },
      });
    }

    const trainerStatus = userData.status || (userData.totalSessions > 0 ? 'approved' : 'pending');
    if (trainerStatus !== 'approved') {
      return NextResponse.json({ error: `ACCESS DENIED: Coach ${userName} is pending admin approval.` }, { status: 403 });
    }
    await recordAttendance({ uid: targetUid, action: nextAction, gymId, source: 'RECEPTION_DESK', guard: () => {} });
    return NextResponse.json({
      success: true, action: nextAction,
      message: `Shift ${nextAction === 'check-in' ? 'Clock-In' : 'Clock-Out'} recorded for Coach ${userName}.`,
      user: { id: targetUid, name: userName, phone: userData.phone || 'N/A', role: 'trainer', newStatus: nextAction === 'check-in' ? 'IN' : 'OUT' },
    });
  } catch (error: any) {
    if (error instanceof HttpErr) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Front Desk Scan error:', error);
    return NextResponse.json({ error: error.message || 'Server error recording attendance scan' }, { status: 500 });
  }
}
