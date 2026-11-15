import { NextResponse } from 'next/server';
import { q, rowToDoc, USER_SELECT } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const trainerUid = searchParams.get('trainerUid');
    const { rows } = await q(`${USER_SELECT} WHERE u.role = 'member'`);
    const all: any[] = [];
    const assigned: any[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const row of rows) {
      const data = rowToDoc(row);
      let isPresent = data.currentStatus === 'IN';
      if (!isPresent && data.lastActive) {
        const d = new Date(data.lastActive);
        d.setHours(0, 0, 0, 0);
        if (d.getTime() === today.getTime()) isPresent = true;
      }
      const clientObj = {
        id: data.uid,
        name: data.name || 'Member',
        phone: data.phone || 'N/A',
        email: data.email || '',
        attendanceCount: Number(data.attendance?.attended ?? data.totalSessions ?? 0),
        isPresent,
        rating: typeof data.rating === 'number' ? data.rating : 0,
        trainerNotes: data.trainerNotes || data.message || '',
        plan: data.plan || null,
        createdAt: data.createdAt || null,
        assignedTrainer: data.assignedTrainer || null,
        currentStatus: data.currentStatus || 'OUT',
      };
      all.push(clientObj);
      if (trainerUid && data.assignedTrainer?.uid === trainerUid) assigned.push(clientObj);
    }
    return NextResponse.json({ success: true, all, assigned });
  } catch (error: any) {
    console.error('Error in /api/trainer/clients:', error);
    return NextResponse.json({ success: false, all: [], assigned: [], error: error.message }, { status: 500 });
  }
}
