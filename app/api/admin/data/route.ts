import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Fetch Users
    const usersSnap = await adminDb.collection('users').get();
    const users: any[] = [];
    usersSnap.forEach((doc) => {
      const data = doc.data();
      users.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null,
        requestedAt: data.requestedAt?.toDate ? data.requestedAt.toDate().toISOString() : data.requestedAt || null,
        lastActive: data.lastActive?.toDate ? data.lastActive.toDate().toISOString() : data.lastActive || null,
        lastCheckIn: data.lastCheckIn?.toDate ? data.lastCheckIn.toDate().toISOString() : data.lastCheckIn || null,
        approvedAt: data.approvedAt?.toDate ? data.approvedAt.toDate().toISOString() : data.approvedAt || null,
        rejectedAt: data.rejectedAt?.toDate ? data.rejectedAt.toDate().toISOString() : data.rejectedAt || null,
        joiningDate: data.joiningDate?.toDate ? data.joiningDate.toDate().toISOString() : data.joiningDate || null,
      });
    });

    // 2. Fetch Master Logs
    let logs: any[] = [];
    try {
      const logsSnap = await adminDb
        .collection('logs')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();

      logsSnap.forEach((doc) => {
        const d = doc.data();
        logs.push({
          id: doc.id,
          userName: d.userName || d.userEmail || 'User',
          userEmail: d.userEmail || '',
          role: d.role || 'MEMBER',
          type: d.type || 'CHECK-IN',
          gymId: d.gymId || 'AURA_CLUB_MAIN_ENTRANCE',
          time: d.timestamp?.toDate
            ? d.timestamp.toDate().toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Recent',
        });
      });
    } catch (logErr) {
      console.warn('Could not fetch logs with orderBy, falling back:', logErr);
      const fallbackSnap = await adminDb.collection('logs').limit(100).get();
      fallbackSnap.forEach((doc) => {
        const d = doc.data();
        logs.push({
          id: doc.id,
          userName: d.userName || d.userEmail || 'User',
          userEmail: d.userEmail || '',
          role: d.role || 'MEMBER',
          type: d.type || 'CHECK-IN',
          gymId: d.gymId || 'AURA_CLUB_MAIN_ENTRANCE',
          time: d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString('en-IN') : 'Recent',
        });
      });
    }

    // 3. Fetch Expenses
    let expenses: any[] = [];
    try {
      const expensesSnap = await adminDb
        .collection('expenses')
        .orderBy('date', 'desc')
        .get();

      expensesSnap.forEach((doc) => {
        const d = doc.data();
        expenses.push({
          id: doc.id,
          category: d.category || 'General',
          amount: d.amount || '0',
          dateFormatted: d.date?.toDate
            ? d.date.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Recent',
        });
      });
    } catch (expErr) {
      console.warn('Could not fetch expenses with orderBy, falling back:', expErr);
      const fallbackSnap = await adminDb.collection('expenses').get();
      fallbackSnap.forEach((doc) => {
        const d = doc.data();
        expenses.push({
          id: doc.id,
          category: d.category || 'General',
          amount: d.amount || '0',
          dateFormatted: d.date?.toDate ? d.date.toDate().toLocaleDateString('en-IN') : 'Recent',
        });
      });
    }

    return NextResponse.json({
      success: true,
      users,
      logs,
      expenses,
    });
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

    const docRef = await adminDb.collection('expenses').add({
      category: String(category).trim(),
      amount: String(amount).trim(),
      date: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      id: docRef.id,
      message: 'Expense recorded successfully',
    });
  } catch (error: any) {
    console.error('Error adding expense:', error);
    return NextResponse.json({ error: error.message || 'Failed to add expense' }, { status: 500 });
  }
}

