import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { memberId, rating, trainerNotes } = body;

    if (!memberId) {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
    }

    const memberRef = adminDb.collection('users').doc(memberId);
    await memberRef.set(
      {
        rating: Number(rating) || 8,
        trainerNotes: String(trainerNotes || '').trim(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: 'Rating and guidance notes updated successfully',
    });
  } catch (error: any) {
    console.error('Error in /api/trainer/rate:', error);
    return NextResponse.json({ error: error.message || 'Failed to update rating' }, { status: 500 });
  }
}

