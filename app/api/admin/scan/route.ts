import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { computeMembership } from '@/lib/membershipUtils';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { qrData, forcedAction } = body;

    if (!qrData) {
      return NextResponse.json({ error: 'Please enter a Member Name, Phone Number, UID, or QR code payload.' }, { status: 400 });
    }

    // 1. Parse QR Data / Search Query
    let targetUid = '';
    let parsedAction: 'check-in' | 'check-out' | null = null;
    let gymId = 'AURA_CLUB_MAIN_ENTRANCE';
    let rawQuery = '';

    if (typeof qrData === 'string' && (qrData.startsWith('{') || qrData.startsWith('['))) {
      try {
        const parsed = JSON.parse(qrData);
        targetUid = parsed.memberUid || parsed.trainerUid || parsed.uid || '';
        if (parsed.action === 'check-in' || parsed.action === 'check-out') {
          parsedAction = parsed.action;
        }
        if (parsed.gymId) gymId = parsed.gymId;
      } catch (e) {
        rawQuery = qrData.trim();
      }
    } else {
      rawQuery = String(qrData).trim();
    }

    let userSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    let userRef: FirebaseFirestore.DocumentReference | null = null;

    // A. If targetUid parsed from QR JSON, lookup directly
    if (targetUid) {
      const ref = adminDb.collection('users').doc(targetUid);
      const snap = await ref.get();
      if (snap.exists) {
        userSnap = snap;
        userRef = ref;
      }
    }

    // B. If not found yet, try rawQuery as direct Firestore Document ID (UID)
    if (!userSnap && rawQuery) {
      const ref = adminDb.collection('users').doc(rawQuery);
      const snap = await ref.get();
      if (snap.exists) {
        userSnap = snap;
        userRef = ref;
        targetUid = snap.id;
      }
    }

    // C. If not found yet, try searching by Phone Number
    if (!userSnap && rawQuery) {
      const digitsOnly = rawQuery.replace(/\D/g, '');
      const cleanPhone = digitsOnly.length === 12 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;

      const phoneQueries = [
        rawQuery,
        cleanPhone,
        `+91${cleanPhone}`,
        `+91 ${cleanPhone}`,
        `0${cleanPhone}`,
      ];

      for (const phoneAttempt of phoneQueries) {
        if (!phoneAttempt) continue;
        const phoneSnap = await adminDb.collection('users').where('phone', '==', phoneAttempt).limit(1).get();
        if (!phoneSnap.empty) {
          userSnap = phoneSnap.docs[0];
          userRef = userSnap.ref;
          targetUid = userSnap.id;
          break;
        }
      }
    }

    // D. If not found yet, try searching by Email
    if (!userSnap && rawQuery && rawQuery.includes('@')) {
      const emailSnap = await adminDb.collection('users').where('email', '==', rawQuery.toLowerCase()).limit(1).get();
      if (!emailSnap.empty) {
        userSnap = emailSnap.docs[0];
        userRef = userSnap.ref;
        targetUid = userSnap.id;
      }
    }

    // E. If not found yet, try searching by Name across users collection
    if (!userSnap && rawQuery) {
      const lower = rawQuery.toLowerCase();
      const allUsersSnap = await adminDb.collection('users').get();
      const match = allUsersSnap.docs.find((doc) => {
        const d = doc.data();
        const name = (d.name || '').toLowerCase();
        const phone = (d.phone || '').replace(/\D/g, '');
        const email = (d.email || '').toLowerCase();
        return (
          name === lower ||
          name.includes(lower) ||
          (phone && phone.includes(lower)) ||
          email === lower ||
          email.includes(lower)
        );
      });

      if (match) {
        userSnap = match;
        userRef = match.ref;
        targetUid = match.id;
      }
    }

    if (!userSnap || !userRef || !targetUid) {
      return NextResponse.json({
        error: `No member or coach found for "${rawQuery || targetUid}". Please check the name or phone number.`,
      }, { status: 404 });
    }

    const userData = userSnap.data() || {};
    const role = (userData.role || 'member').toLowerCase();
    const currentStatus = userData.currentStatus === 'IN' ? 'IN' : 'OUT';
    const userName = userData.name || (role === 'trainer' ? 'Staff Coach' : 'Member');
    const userEmail = userData.email || '';

    // Determine target action (toggle if not forced)
    const nextAction: 'check-in' | 'check-out' = forcedAction || (currentStatus === 'IN' ? 'check-out' : 'check-in');

    const timestamp = FieldValue.serverTimestamp();
    const batch = adminDb.batch();

    // ==========================================
    // LOGIC FOR MEMBERS
    // ==========================================
    if (role !== 'trainer') {
      const membership = computeMembership(userData.plan, userData.createdAt);

      // Deny check-in if membership is expired
      if (nextAction === 'check-in' && membership.status === 'EXPIRED') {
        return NextResponse.json({
          error: `ACCESS DENIED: Membership for ${userName} has expired on ${membership.endDateFormatted}. Please renew subscription before entering.`,
          user: {
            id: targetUid,
            name: userName,
            phone: userData.phone || 'N/A',
            role: 'member',
            membership,
            currentStatus,
          },
        }, { status: 403 });
      }

      const currentSessions = Number(userData.totalSessions || userData.attendance?.attended || 0);
      const newSessions = nextAction === 'check-in' ? currentSessions + 1 : currentSessions;

      const memberUpdate: any = {
        lastActive: timestamp,
        currentStatus: nextAction === 'check-in' ? 'IN' : 'OUT',
        totalSessions: newSessions,
        'attendance.attended': newSessions,
        attendance: {
          attended: newSessions,
          scheduled: Number(userData.attendance?.scheduled || 30),
          percentage: Math.min(100, Math.round((newSessions / Math.max(Number(userData.attendance?.scheduled || 30), 1)) * 100)),
        },
      };

      if (nextAction === 'check-in') {
        memberUpdate.lastCheckIn = timestamp;
        memberUpdate.dailySessionCount = FieldValue.increment(1);
      }

      batch.set(userRef, memberUpdate, { merge: true });

      // Master Log
      const globalLogRef = adminDb.collection('logs').doc();
      batch.set(globalLogRef, {
        userId: targetUid,
        userName,
        userEmail,
        role: 'MEMBER',
        gymId,
        type: nextAction.toUpperCase(),
        source: 'RECEPTION_DESK',
        timestamp,
      });

      // Member Sub-collection Log
      const memberLogRef = userRef.collection('attendance_logs').doc();
      batch.set(memberLogRef, {
        gymId,
        status: nextAction === 'check-in' ? 'Present' : 'Checked Out',
        date: timestamp,
        checkInTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        source: 'RECEPTION_DESK',
      });

      await batch.commit();

      return NextResponse.json({
        success: true,
        action: nextAction,
        message: `${nextAction === 'check-in' ? 'Check-In' : 'Check-Out'} recorded for ${userName}.`,
        user: {
          id: targetUid,
          name: userName,
          phone: userData.phone || 'N/A',
          role: 'member',
          membership,
          newStatus: nextAction === 'check-in' ? 'IN' : 'OUT',
        },
      });
    }

    // ==========================================
    // LOGIC FOR TRAINERS
    // ==========================================
    const trainerStatus = userData.status || (userData.totalSessions > 0 ? 'approved' : 'pending');
    if (trainerStatus !== 'approved') {
      return NextResponse.json({
        error: `ACCESS DENIED: Coach ${userName} is pending admin approval.`,
      }, { status: 403 });
    }

    const today = new Date().toISOString().split('T')[0];
    const trainerUpdate: any = {
      lastActive: timestamp,
      currentStatus: nextAction === 'check-in' ? 'IN' : 'OUT',
    };

    if (nextAction === 'check-in') {
      trainerUpdate.todaySessions = FieldValue.increment(1);
      trainerUpdate.totalSessions = FieldValue.increment(1);
      trainerUpdate.lastCheckInDate = today;
    }

    batch.set(userRef, trainerUpdate, { merge: true });

    // Master Log
    const globalLogRef = adminDb.collection('logs').doc();
    batch.set(globalLogRef, {
      userId: targetUid,
      userName,
      userEmail,
      role: 'TRAINER',
      gymId,
      type: nextAction.toUpperCase(),
      source: 'RECEPTION_DESK',
      timestamp,
    });

    // Trainer Sub-collection Log
    const trainerLogRef = userRef.collection('trainer_logs').doc();
    batch.set(trainerLogRef, {
      gymId,
      status: nextAction === 'check-in' ? 'Duty Started' : 'Duty Ended',
      timestamp,
      source: 'RECEPTION_DESK',
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      action: nextAction,
      message: `Shift ${nextAction === 'check-in' ? 'Clock-In' : 'Clock-Out'} recorded for Coach ${userName}.`,
      user: {
        id: targetUid,
        name: userName,
        phone: userData.phone || 'N/A',
        role: 'trainer',
        newStatus: nextAction === 'check-in' ? 'IN' : 'OUT',
      },
    });
  } catch (error: any) {
    console.error('Front Desk Scan error:', error);
    return NextResponse.json({ error: error.message || 'Server error recording attendance scan' }, { status: 500 });
  }
}
