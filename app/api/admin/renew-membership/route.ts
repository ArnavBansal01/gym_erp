import { NextResponse } from 'next/server';
import { getUserDoc, addMembership, withTx } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { memberUid, months = 1, planName = 'Standard Monthly', price = 2500 } = body;
    if (!memberUid) {
      return NextResponse.json({ error: 'memberUid is required' }, { status: 400 });
    }
    const data = await getUserDoc(memberUid);
    if (!data) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    const now = new Date();
    let currentEnd = now;
    if (data.plan?.endDate) {
      const parsedEnd = new Date(data.plan.endDate);
      if (parsedEnd > now) currentEnd = parsedEnd;
    }
    const newEnd = new Date(currentEnd);
    newEnd.setMonth(newEnd.getMonth() + months);
    const daysLeft = Math.max(1, Math.ceil((newEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const updatedPlan = {
      name: planName, price: price.toString(), startDate: now.toISOString(),
      endDate: newEnd.toISOString(), daysLeft, status: 'ACTIVE', lastRenewed: now.toISOString(),
    };
    await withTx(async (c) => {
      await addMembership(c, memberUid, { ...updatedPlan, durationMonths: months, tier: data.plan?.tier });
      await c.query(
        `INSERT INTO payments (member_uid, member_name, member_email, plan_name, amount, months, type)
         VALUES ($1,$2,$3,$4,$5,$6,'MEMBERSHIP_RENEWAL')`,
        [memberUid, data.name || 'Member', data.email || '', planName, Number(price), months]
      );
    });
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
