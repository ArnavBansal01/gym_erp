import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const trainerUid = searchParams.get('trainerUid');

    const membersSnap = await adminDb
      .collection('users')
      .where('role', '==', 'member')
      .get();

    const all: any[] = [];
    const assigned: any[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    membersSnap.forEach((doc) => {
      const data = doc.data();

      let isPresent = data.currentStatus === 'IN';
      if (!isPresent && data.lastActive) {
        const lastActiveDate = data.lastActive?.toDate ? data.lastActive.toDate() : new Date(data.lastActive);
        lastActiveDate.setHours(0, 0, 0, 0);
        if (lastActiveDate.getTime() === today.getTime()) {
          isPresent = true;
        }
      }

      const attendedVal =
        data.attendance?.attended ??
        data['attendance.attended'] ??
        data.totalSessions ??
        0;

      const clientObj = {
        id: doc.id,
        name: data.name || 'Member',
        phone: data.phone || 'N/A',
        email: data.email || '',
        attendanceCount: Number(attendedVal),
        isPresent,
        rating: typeof data.rating === 'number' ? data.rating : 0,
        trainerNotes: data.trainerNotes || data.message || '',
        plan: data.plan || null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null,
        assignedTrainer: data.assignedTrainer || null,
        currentStatus: data.currentStatus || 'OUT',
      };

      all.push(clientObj);

      if (trainerUid && data.assignedTrainer?.uid === trainerUid) {
        assigned.push(clientObj);
      }
    });

    return NextResponse.json({
      success: true,
      all,
      assigned,
    });
  } catch (error: any) {
    console.error('Error in /api/trainer/clients:', error);
    return NextResponse.json({ success: false, all: [], assigned: [], error: error.message }, { status: 500 });
  }
}

