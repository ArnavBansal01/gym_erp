import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { memberId, rating, trainerNotes } = body;
    if (!memberId) {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
    }
    await q(`UPDATE users SET rating = $2, trainer_notes = $3 WHERE uid = $1`,
      [memberId, Number(rating) || 8, String(trainerNotes || '').trim()]);
    return NextResponse.json({ success: true, message: 'Rating and guidance notes updated successfully' });
  } catch (error: any) {
    console.error('Error in /api/trainer/rate:', error);
    return NextResponse.json({ error: error.message || 'Failed to update rating' }, { status: 500 });
  }
}
