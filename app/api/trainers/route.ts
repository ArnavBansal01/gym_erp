import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET() {
  try {
    const usersSnap = await adminDb
      .collection('users')
      .where('role', '==', 'trainer')
      .get();

    const trainers: any[] = [];

    usersSnap.forEach((doc) => {
      const data = doc.data();
      const status = data.status || (data.totalSessions > 0 ? 'approved' : 'pending');

      // Only include approved coaches
      if (status === 'approved') {
        trainers.push({
          uid: doc.id,
          name: data.name || 'Trainer',
          email: data.email || '',
          phone: data.phone || '',
          specialization: data.specialization || 'Certified Coach',
          experience: data.experience || 'Certified Trainer',
          status: 'approved',
        });
      }
    });

    return NextResponse.json({
      success: true,
      trainers,
    });
  } catch (error: any) {
    console.error('Error fetching trainers API:', error);
    return NextResponse.json(
      { success: false, trainers: [], error: error.message },
      { status: 500 }
    );
  }
}

