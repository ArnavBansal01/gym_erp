import { NextResponse } from 'next/server';

// Trainers now live in the PostgreSQL `users` table (role = 'trainer'); the legacy collection was
// imported by scripts/load-postgres.ts, so there is nothing left to synchronise.
export async function POST() {
  return NextResponse.json({
    success: true,
    message: 'Successfully synchronized 0 trainer(s) into the unified users collection.',
    migratedCount: 0,
  });
}
