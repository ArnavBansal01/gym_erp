import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getUserDoc } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handleAuth(request); }
export async function POST(request: Request) { return handleAuth(request); }

async function handleAuth(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ authenticated: false, error: 'No authorization header provided' }, { status: 401 });
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const userData = await getUserDoc(uid);
    if (userData) {
      const role = userData.role || 'member';
      const status = userData.status || (role === 'trainer' ? (userData.totalSessions > 0 ? 'approved' : 'pending') : 'active');
      return NextResponse.json({
        authenticated: true,
        exists: true,
        user: {
          ...userData,
          uid,
          email: userData.email || decodedToken.email || '',
          name: userData.name || decodedToken.name || '',
          phone: userData.phone || '',
          role,
          status,
        },
      });
    }
    return NextResponse.json({
      authenticated: true,
      exists: false,
      user: { uid, email: decodedToken.email || '', name: decodedToken.name || '' },
    });
  } catch (error: any) {
    console.error('Auth verification error:', error);
    return NextResponse.json({ authenticated: false, error: error.message || 'Token verification failed' }, { status: 401 });
  }
}
