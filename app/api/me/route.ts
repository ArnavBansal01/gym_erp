import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getUserDoc } from '@/lib/db';

// Replaces the Firestore onSnapshot listener: returns the signed-in user's own record; pages poll it every 3 s.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'No authorization header provided' }, { status: 401 });
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const { uid } = await adminAuth.verifyIdToken(token);
    const user = await getUserDoc(uid);
    return NextResponse.json({ exists: !!user, user: user || null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unauthorized' }, { status: 401 });
  }
}
