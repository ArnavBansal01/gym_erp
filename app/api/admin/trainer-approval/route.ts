import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trainerUid, action } = body;
    if (!trainerUid || !['approve', 'reject', 'revoke'].includes(action)) {
      return NextResponse.json({ error: 'Valid trainerUid and action (approve, reject, revoke) are required' }, { status: 400 });
    }
    const found = await q('SELECT 1 FROM users WHERE uid = $1', [trainerUid]);
    if (!found.rowCount) {
      return NextResponse.json({ error: 'Trainer not found' }, { status: 404 });
    }
    if (action === 'approve') {
      await q(`UPDATE users SET status='approved', role='trainer', approved_at=now(), joining_date=COALESCE(joining_date, now()) WHERE uid=$1`, [trainerUid]);
      return NextResponse.json({ success: true, message: 'Trainer approved successfully! They can now access the portal and be assigned to members.' });
    } else if (action === 'reject') {
      await q(`UPDATE users SET status='rejected', rejected_at=now() WHERE uid=$1`, [trainerUid]);
      return NextResponse.json({ success: true, message: 'Trainer application has been rejected.' });
    }
    await q(`UPDATE users SET status='revoked', revoked_at=now() WHERE uid=$1`, [trainerUid]);
    return NextResponse.json({ success: true, message: 'Trainer access has been revoked.' });
  } catch (error: any) {
    console.error('Trainer approval error:', error);
    return NextResponse.json({ error: error.message || 'Operation failed' }, { status: 500 });
  }
}
