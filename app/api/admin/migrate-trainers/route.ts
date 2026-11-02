import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
  try {
    const trainersSnap = await adminDb.collection('trainers').get();
    let migratedCount = 0;
    const batch = adminDb.batch();

    for (const trainerDoc of trainersSnap.docs) {
      const data = trainerDoc.data();
      const userRef = adminDb.collection('users').doc(trainerDoc.id);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        batch.set(userRef, {
          ...data,
          uid: trainerDoc.id,
          role: 'trainer',
          currentStatus: data.currentStatus || 'OUT',
          totalSessions: data.totalSessions || 0,
          todaySessions: data.todaySessions || 0,
          shiftsAssigned: data.shiftsAssigned || 0,
          shiftsAttended: data.shiftsAttended || 0,
        });
        migratedCount++;
      } else {
        // If user already exists in 'users', ensure role is set to trainer
        batch.set(userRef, { role: 'trainer' }, { merge: true });
        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synchronized ${migratedCount} trainer(s) into the unified users collection.`,
      migratedCount,
    });
  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: error.message || 'Migration failed' }, { status: 500 });
  }
}
