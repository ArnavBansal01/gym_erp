import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trainerUid, action } = body;

    if (!trainerUid || !['approve', 'reject', 'revoke'].includes(action)) {
      return NextResponse.json({ error: 'Valid trainerUid and action (approve, reject, revoke) are required' }, { status: 400 });
    }

    const trainerRef = adminDb.collection('users').doc(trainerUid);
    const trainerSnap = await trainerRef.get();

    if (!trainerSnap.exists) {
      return NextResponse.json({ error: 'Trainer not found' }, { status: 404 });
    }

    const timestamp = FieldValue.serverTimestamp();

    if (action === 'approve') {
      await trainerRef.set(
        {
          status: 'approved',
          role: 'trainer',
          approvedAt: timestamp,
          joiningDate: trainerSnap.data()?.joiningDate || timestamp,
        },
        { merge: true }
      );
      return NextResponse.json({ success: true, message: 'Trainer approved successfully! They can now access the portal and be assigned to members.' });
    } else if (action === 'reject') {
      await trainerRef.set(
        {
          status: 'rejected',
          rejectedAt: timestamp,
        },
        { merge: true }
      );
      return NextResponse.json({ success: true, message: 'Trainer application has been rejected.' });
    } else if (action === 'revoke') {
      await trainerRef.set(
        {
          status: 'revoked',
          revokedAt: timestamp,
        },
        { merge: true }
      );
      return NextResponse.json({ success: true, message: 'Trainer access has been revoked.' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('Trainer approval error:', error);
    return NextResponse.json({ error: error.message || 'Operation failed' }, { status: 500 });
  }
}
