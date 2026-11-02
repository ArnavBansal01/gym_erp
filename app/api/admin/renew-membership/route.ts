import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { memberUid, months = 1, planName = 'Standard Monthly', price = 2500 } = body;

    if (!memberUid) {
      return NextResponse.json({ error: 'memberUid is required' }, { status: 400 });
    }

    const memberRef = adminDb.collection('users').doc(memberUid);
    const memberSnap = await memberRef.get();

    if (!memberSnap.exists) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const data = memberSnap.data() || {};
    const now = new Date();
    
    // Determine new start date: if current membership is still active in the future, extend from current endDate; otherwise start today
    let currentEnd = now;
    if (data.plan?.endDate) {
      const parsedEnd = new Date(data.plan.endDate);
      if (parsedEnd > now) {
        currentEnd = parsedEnd;
      }
    }

    const newEnd = new Date(currentEnd);
    newEnd.setMonth(newEnd.getMonth() + months);
    const daysLeft = Math.max(1, Math.ceil((newEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    const updatedPlan = {
      name: planName,
      price: price.toString(),
      startDate: now.toISOString(),
      endDate: newEnd.toISOString(),
      daysLeft,
      status: 'ACTIVE',
      lastRenewed: FieldValue.serverTimestamp(),
    };

    const batch = adminDb.batch();

    // 1. Update member document
    batch.set(memberRef, { plan: updatedPlan }, { merge: true });

    // 2. Log payment transaction
    const paymentRef = adminDb.collection('payments').doc();
    batch.set(paymentRef, {
      memberUid,
      memberName: data.name || 'Member',
      memberEmail: data.email || '',
      planName,
      amount: Number(price),
      months,
      date: FieldValue.serverTimestamp(),
      type: 'MEMBERSHIP_RENEWAL',
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Membership renewed successfully for ${months} month(s)! New valid date: ${newEnd.toLocaleDateString()}`,
      plan: updatedPlan,
    });
  } catch (error: any) {
    console.error('Renewal error:', error);
    return NextResponse.json({ error: error.message || 'Renewal failed' }, { status: 500 });
  }
}
