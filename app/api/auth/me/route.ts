import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleAuth(request);
}

export async function POST(request: Request) {
  return handleAuth(request);
}

async function handleAuth(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ authenticated: false, error: 'No authorization header provided' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // 1. Look up in unified 'users' collection
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      const userData = userSnap.data() || {};
      const role = userData.role || 'member';
      
      // Determine status: members are active; trainers default to approved if they have existing sessions or prior status, otherwise pending
      const status = userData.status || (role === 'trainer' ? (userData.totalSessions > 0 ? 'approved' : 'pending') : 'active');

      return NextResponse.json({
        authenticated: true,
        exists: true,
        user: {
          uid,
          email: userData.email || decodedToken.email || '',
          name: userData.name || decodedToken.name || '',
          phone: userData.phone || '',
          role,
          status,
          ...userData,
        },
      });
    }

    // 2. Legacy check: look up in 'trainers' collection to auto-migrate if needed
    const trainerRef = adminDb.collection('trainers').doc(uid);
    const trainerSnap = await trainerRef.get();

    if (trainerSnap.exists) {
      const trainerData = trainerSnap.data() || {};
      const migratedUser = {
        uid,
        email: trainerData.email || decodedToken.email || '',
        name: trainerData.name || decodedToken.name || '',
        phone: trainerData.phone || '',
        role: 'trainer',
        status: 'approved', // Grandfather existing trainers
        totalSessions: trainerData.totalSessions || 0,
        todaySessions: trainerData.todaySessions || 0,
        currentStatus: trainerData.currentStatus || 'OUT',
        lastActive: trainerData.lastActive || null,
        joiningDate: trainerData.joiningDate || trainerData.createdAt || null,
        createdAt: trainerData.createdAt || new Date(),
        shiftsAssigned: trainerData.shiftsAssigned || 0,
        shiftsAttended: trainerData.shiftsAttended || 0,
      };

      // Save to unified 'users' collection
      await userRef.set(migratedUser, { merge: true });

      return NextResponse.json({
        authenticated: true,
        exists: true,
        migrated: true,
        user: migratedUser,
      });
    }

    // 3. User does not exist yet in the database
    return NextResponse.json({
      authenticated: true,
      exists: false,
      user: {
        uid,
        email: decodedToken.email || '',
        name: decodedToken.name || '',
      },
    });
  } catch (error: any) {
    console.error('Auth verification error:', error);
    return NextResponse.json(
      { authenticated: false, error: error.message || 'Token verification failed' },
      { status: 401 }
    );
  }
}
