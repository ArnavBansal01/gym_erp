import { NextResponse } from 'next/server';
import { adminAuth, adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { computeMembership } from '@/lib/membershipUtils';

export const dynamic = 'force-dynamic';

const VALID_GYM_IDS = ['AURA_CLUB_MAIN_ENTRANCE', 'AURA_CLUB_FLOOR_2'];

export async function POST(request: Request) {
  try {
    // 1. Authenticate Request
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;
    const email = decodedToken.email || '';

    // 2. Parse Body & Validate Gym ID
    const body = await request.json();
    let { action, gymId } = body;

    if (!['check-in', 'check-out'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be check-in or check-out.' }, { status: 400 });
    }

    // Support JSON strings or direct gym IDs
    let resolvedGymId = gymId || 'AURA_CLUB_MAIN_ENTRANCE';
    if (typeof gymId === 'string' && gymId.startsWith('{')) {
      try {
        const parsed = JSON.parse(gymId);
        resolvedGymId = parsed.gymId || resolvedGymId;
      } catch (e) {}
    }

    if (!VALID_GYM_IDS.includes(resolvedGymId) && !resolvedGymId.toLowerCase().includes('aura')) {
      return NextResponse.json({ error: 'Invalid QR Code. Please scan the official Gym QR.' }, { status: 400 });
    }
    gymId = VALID_GYM_IDS.includes(resolvedGymId) ? resolvedGymId : 'AURA_CLUB_MAIN_ENTRANCE';


    // 3. Fetch User from Unified 'users' Collection
    const userRef = adminDb.collection('users').doc(userId);
    let userSnap = await userRef.get();

    // Fallback: If not yet migrated from trainers collection, auto-migrate
    if (!userSnap.exists) {
      const legacyTrainerSnap = await adminDb.collection('trainers').doc(userId).get();
      if (legacyTrainerSnap.exists) {
        const legacyData = legacyTrainerSnap.data() || {};
        await userRef.set({
          ...legacyData,
          uid: userId,
          role: 'trainer',
        }, { merge: true });
        userSnap = await userRef.get();
      } else {
        return NextResponse.json({ error: 'User record not found. Please complete profile setup first.' }, { status: 404 });
      }
    }

    const userData = userSnap.data() || {};
    const role = userData.role || 'member';
    const currentStatus = userData.currentStatus || 'OUT';
    const timestamp = FieldValue.serverTimestamp();
    const batch = adminDb.batch();

    // ==========================================
    // LOGIC FOR TRAINERS
    // ==========================================
    if (role === 'trainer') {
      const status = userData.status || (userData.totalSessions > 0 ? 'approved' : 'pending');
      if (status !== 'approved') {
        return NextResponse.json(
          { error: 'Trainer account is pending admin approval. You cannot record duty attendance until approved.' },
          { status: 403 }
        );
      }

      if (action === 'check-in' && currentStatus === 'IN') {
        return NextResponse.json({ error: 'Already Checked IN!' }, { status: 400 });
      }
      if (action === 'check-out' && currentStatus === 'OUT') {
        return NextResponse.json({ error: 'Already Checked OUT!' }, { status: 400 });
      }

      const today = new Date().toISOString().split('T')[0];
      const trainerUpdate: any = {
        lastActive: timestamp,
        currentStatus: action === 'check-in' ? 'IN' : 'OUT',
      };

      if (action === 'check-in') {
        trainerUpdate.todaySessions = FieldValue.increment(1);
        trainerUpdate.totalSessions = FieldValue.increment(1);
        trainerUpdate.lastCheckInDate = today;
      }

      batch.set(userRef, trainerUpdate, { merge: true });

      // Global Master Log
      const globalLogRef = adminDb.collection('logs').doc();
      batch.set(globalLogRef, {
        userId,
        userName: userData.name || 'Trainer',
        userEmail: email,
        role: 'TRAINER',
        gymId,
        type: action.toUpperCase(),
        timestamp,
      });

      // User's Sub-collection Log
      const trainerLogRef = userRef.collection('trainer_logs').doc();
      batch.set(trainerLogRef, {
        gymId,
        status: action === 'check-in' ? 'Duty Started' : 'Duty Ended',
        timestamp,
      });

      await batch.commit();

      return NextResponse.json({
        success: true,
        role: 'trainer',
        message: `Duty ${action === 'check-in' ? 'Started' : 'Ended'} Successfully!`,
      });
    }

    // ==========================================
    // LOGIC FOR MEMBERS (NORMAL USERS)
    // ==========================================
    if (action === 'check-in') {
      const { isExpired, endDateFormatted } = computeMembership(userData.plan, userData.createdAt);
      if (isExpired) {
        return NextResponse.json({
          error: `Access Denied: Your membership expired on ${endDateFormatted}. Please renew in your member portal or at the front desk.`
        }, { status: 403 });
      }
    }

    if (action === 'check-in' && currentStatus === 'IN') {
      return NextResponse.json({ error: 'You are already Checked IN!' }, { status: 400 });
    }
    if (action === 'check-out' && currentStatus === 'OUT') {
      return NextResponse.json({ error: 'You are already Checked OUT!' }, { status: 400 });
    }

    const currentSessions = Number(userData.totalSessions || userData.attendance?.attended || 0);
    const newSessions = action === 'check-in' ? currentSessions + 1 : currentSessions;

    const memberUpdate: any = {
      lastActive: timestamp,
      currentStatus: action === 'check-in' ? 'IN' : 'OUT',
      totalSessions: newSessions,
      'attendance.attended': newSessions,
      attendance: {
        attended: newSessions,
        scheduled: Number(userData.attendance?.scheduled || 30),
        percentage: Math.min(100, Math.round((newSessions / Math.max(Number(userData.attendance?.scheduled || 30), 1)) * 100)),
      },
    };

    if (action === 'check-in') {
      memberUpdate.lastCheckIn = timestamp;
      memberUpdate.dailySessionCount = FieldValue.increment(1);
    }

    batch.set(userRef, memberUpdate, { merge: true });

    // Global Master Log
    const globalLogRef = adminDb.collection('logs').doc();
    batch.set(globalLogRef, {
      userId,
      userName: userData.name || 'Member',
      userEmail: email,
      role: 'MEMBER',
      gymId,
      type: action.toUpperCase(),
      timestamp,
    });

    // User's Sub-collection Log
    const memberLogRef = userRef.collection('attendance_logs').doc();
    batch.set(memberLogRef, {
      gymId,
      status: action === 'check-in' ? 'Present' : 'Checked Out',
      date: timestamp,
      checkInTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      role: 'member',
      totalSessions: newSessions,
      currentStatus: action === 'check-in' ? 'IN' : 'OUT',
      message: `Successfully ${action === 'check-in' ? 'Checked In' : 'Checked Out'}!`,
    });

  } catch (error: any) {
    console.error('Attendance API Error:', error);
    return NextResponse.json({ error: 'Server Error: ' + error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');

    const attendedDates: number[] = [];

    if (uid) {
      // 1. Fetch user attendance sub-collection logs
      try {
        const logsSnap = await adminDb
          .collection('users')
          .doc(uid)
          .collection('attendance_logs')
          .orderBy('date', 'desc')
          .limit(60)
          .get();

        logsSnap.forEach((doc) => {
          const d = doc.data();
          if (d.status === 'Present' || !d.status || d.status === 'Checked Out') {
            if (d.date?.toDate) {
              attendedDates.push(d.date.toDate().getTime());
            } else if (typeof d.date?._seconds === 'number') {
              attendedDates.push(d.date._seconds * 1000);
            } else if (d.date) {
              attendedDates.push(new Date(d.date).getTime());
            }
          }
        });
      } catch (err) {
        console.warn('Could not read user attendance_logs:', err);
      }

      // 2. Fallback to global logs collection if sub-collection was empty
      if (attendedDates.length === 0) {
        try {
          const globalLogsSnap = await adminDb
            .collection('logs')
            .where('userId', '==', uid)
            .limit(60)
            .get();

          globalLogsSnap.forEach((doc) => {
            const d = doc.data();
            if (d.timestamp?.toDate) {
              attendedDates.push(d.timestamp.toDate().getTime());
            } else if (typeof d.timestamp?._seconds === 'number') {
              attendedDates.push(d.timestamp._seconds * 1000);
            } else if (d.timestamp) {
              attendedDates.push(new Date(d.timestamp).getTime());
            }
          });
        } catch (err) {
          console.warn('Could not read global logs:', err);
        }
      }
    }

    // 3. Count members currently on floor
    let activeFloorCount = 0;
    try {
      const activeSnap = await adminDb
        .collection('users')
        .where('role', '==', 'member')
        .where('currentStatus', '==', 'IN')
        .get();
      activeFloorCount = activeSnap.size;
    } catch (err) {
      console.warn('Could not fetch active floor count:', err);
    }

    return NextResponse.json({
      success: true,
      activeFloorCount,
      attendedDates,
    });
  } catch (error: any) {
    console.error('Attendance GET API Error:', error);
    return NextResponse.json({
      success: false,
      activeFloorCount: 0,
      attendedDates: [],
      error: error.message,
    });
  }
}

