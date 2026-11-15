import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getUserDoc, upsertUser, addMembership, withTx } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header provided' }, { status: 401 });
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email || '';
    const body = await request.json();
    const { role, name, phone, assignedTrainer, plan, specialization, experience } = body;

    if (!role || !['member', 'trainer'].includes(role)) {
      return NextResponse.json({ error: 'Valid role (member or trainer) is required' }, { status: 400 });
    }
    if (!name || !phone) {
      return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 });
    }

    const now = new Date();
    let userData: any = { uid, email, name, phone, role, createdAt: now, currentStatus: 'OUT', lastActive: now };
    let planObj: any = null;
    let assignedUid: string | null = null;

    if (role === 'member') {
      if (assignedTrainer && assignedTrainer.uid && assignedTrainer.uid !== 'general') {
        const t = await getUserDoc(assignedTrainer.uid);
        if (!t || (t.status && t.status !== 'approved')) {
          return NextResponse.json({ error: 'Selected trainer is not available or not yet approved by management' }, { status: 400 });
        }
        assignedUid = assignedTrainer.uid;
      }
      const durationMonths = plan?.durationMonths || 1;
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + durationMonths);
      planObj = {
        name: plan?.name || 'Monthly Standard',
        tier: plan?.tier || 'Standard',
        price: String(plan?.price || '2500'),
        durationMonths,
        startDate: now.toISOString(),
        endDate: endDate.toISOString(),
      };
      userData = { ...userData, status: 'active', assignedTrainerUid: assignedUid, dailySessionCount: 0, rating: 0, message: 'Welcome to AURA Athletic Club!' };
    } else {
      userData = {
        ...userData, status: 'pending', specialization: specialization || 'General Fitness',
        experience: experience || 'Certified Trainer', requestedAt: now,
        todaySessions: 0, totalSessions: 0, shiftsAssigned: 0, shiftsAttended: 0,
      };
    }

    await withTx(async (c) => {
      await upsertUser(c, uid, userData);
      if (planObj) await addMembership(c, uid, planObj);
    });

    const saved = await getUserDoc(uid);
    return NextResponse.json({
      success: true,
      status: userData.status,
      message: role === 'trainer'
        ? 'Application submitted! Trainer accounts require admin approval before accessing the portal.'
        : 'Registered successfully as a member!',
      user: { ...saved, createdAt: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: error.message || 'Registration failed' }, { status: 500 });
  }
}
