import { NextResponse } from 'next/server';
import { q, rowToDoc, USER_SELECT } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const usersRes = await q(`${USER_SELECT} ORDER BY u.created_at`);
    const users = usersRes.rows.map((r: any) => ({ id: r.uid, ...rowToDoc(r) }));

    const logsRes = await q(`SELECT * FROM attendance_logs ORDER BY logged_at DESC LIMIT 100`);
    const logs = logsRes.rows.map((d: any) => ({
      id: String(d.id),
      userName: d.user_name || d.user_email || 'User',
      userEmail: d.user_email || '',
      role: d.role || 'MEMBER',
      type: d.type || 'CHECK-IN',
      gymId: d.gym_id || 'AURA_CLUB_MAIN_ENTRANCE',
      time: new Date(d.logged_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    }));

    const expRes = await q(`SELECT id, category, amount::text AS amount, spent_at FROM expenses ORDER BY spent_at DESC`);
    const expenses = expRes.rows.map((d: any) => ({
      id: String(d.id),
      category: d.category || 'General',
      amount: d.amount || '0',
      dateFormatted: new Date(d.spent_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    }));

    return NextResponse.json({ success: true, users, logs, expenses });
  } catch (error: any) {
    console.error('Admin Data API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { category, amount } = body;
    if (!category || !amount) {
      return NextResponse.json({ error: 'Category and amount are required' }, { status: 400 });
    }
    const num = Number(String(amount).replace(/[^0-9.]/g, ''));
    if (!isFinite(num) || num < 0) {
      return NextResponse.json({ error: 'Amount must be a valid number' }, { status: 400 });
    }
    const res = await q(`INSERT INTO expenses (category, amount) VALUES ($1, $2) RETURNING id`, [String(category).trim(), num]);
    return NextResponse.json({ success: true, id: String(res.rows[0].id), message: 'Expense recorded successfully' });
  } catch (error: any) {
    console.error('Error adding expense:', error);
    return NextResponse.json({ error: error.message || 'Failed to add expense' }, { status: 500 });
  }
}
