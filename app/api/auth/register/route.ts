import { NextResponse } from 'next/server';
import { adminAuth, adminDb, FieldValue } from '@/lib/firebaseAdmin';

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

    const userRef = adminDb.collection('users').doc(uid);
    const timestamp = FieldValue.serverTimestamp();

    let userData: any = {
      uid,
      email,
      name,
      phone,
      role,
      createdAt: timestamp,
      currentStatus: 'OUT',
      lastActive: timestamp,
    };

    if (role === 'member') {
      let trainerData = {
        uid: 'general',
        name: 'General Floor Coach',
        phone: '',
        email: 'coach@auraclub.fit',
      };

      // If a specific personal trainer is selected, verify approval
      if (assignedTrainer && assignedTrainer.uid && assignedTrainer.uid !== 'general') {
        const trainerSnap = await adminDb.collection('users').doc(assignedTrainer.uid).get();
        if (!trainerSnap.exists || (trainerSnap.data()?.status && trainerSnap.data()?.status !== 'approved')) {
          return NextResponse.json(
            { error: 'Selected trainer is not available or not yet approved by management' },
            { status: 400 }
          );
        }
        trainerData = {
          uid: assignedTrainer.uid,
          name: assignedTrainer.name || trainerSnap.data()?.name || 'Personal Coach',
          phone: assignedTrainer.phone || trainerSnap.data()?.phone || '',
          email: assignedTrainer.email || trainerSnap.data()?.email || '',
        };
      }

      const durationMonths = plan?.durationMonths || 1;
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + durationMonths);
      const daysLeft = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

      userData = {
        ...userData,
        status: 'active',
        assignedTrainer: trainerData,
        plan: {
          name: plan?.name || 'Monthly Standard',
          tier: plan?.tier || 'Standard',
          price: String(plan?.price || '2500'),
          durationMonths,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          daysLeft,
        },
        attendance: {
          attended: 0,
          scheduled: 0,
          percentage: 100,
        },
        dailySessionCount: 0,
        rating: 0,
        message: 'Welcome to AURA Athletic Club!',
      };
    } else if (role === 'trainer') {

      // Trainer registrations start as PENDING until approved by admin
      userData = {
        ...userData,
        status: 'pending',
        specialization: specialization || 'General Fitness',
        experience: experience || 'Certified Trainer',
        requestedAt: timestamp,
        todaySessions: 0,
        totalSessions: 0,
        shiftsAssigned: 0,
        shiftsAttended: 0,
      };
    }

    await userRef.set(userData, { merge: true });

    return NextResponse.json({
      success: true,
      status: userData.status,
      message:
        role === 'trainer'
          ? 'Application submitted! Trainer accounts require admin approval before accessing the portal.'
          : 'Registered successfully as a member!',
      user: {
        ...userData,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: error.message || 'Registration failed' }, { status: 500 });
  }
}
