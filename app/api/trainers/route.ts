import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const { rows } = await q(
      `SELECT uid, name, email, phone, specialization, experience FROM users
       WHERE role = 'trainer' AND (status = 'approved' OR (status IS NULL AND total_sessions > 0))`
    );
    const trainers = rows.map((r: any) => ({
      uid: r.uid, name: r.name || 'Trainer', email: r.email || '', phone: r.phone || '',
      specialization: r.specialization || 'Certified Coach', experience: r.experience || 'Certified Trainer', status: 'approved',
    }));
    return NextResponse.json({ success: true, trainers });
  } catch (error: any) {
    console.error('Error fetching trainers API:', error);
    return NextResponse.json({ success: false, trainers: [], error: error.message }, { status: 500 });
  }
}
