import { NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// --- INITIALIZE FIREBASE ADMIN ---
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined,
};

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();
const auth = getAuth();

export async function POST(request: Request) {
  try {
    // 1. Authenticate Request
    const idToken = request.headers.get('Authorization');
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized: No token provided" }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid; 
    const email = decodedToken.email;

    // 2. Parse Body
    const body = await request.json();
    const { action, gymId } = body; 
    
    // SECURITY: Validate Gym ID
    const VALID_GYM_IDS = ["ICONIC_GYM_KARNAL_ENTRANCE", "ICONIC_GYM_FLOOR_2"];
    if (!VALID_GYM_IDS.includes(gymId)) {
      return NextResponse.json({ error: "Invalid QR Code. Please scan the official Gym QR." }, { status: 400 });
    }

    // 3. Logic: Validate Status & Calculate Counts
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    // Default Values
    let currentStatus = "OUT";
    let dailySessionCount = 0;
    let lastActiveDateString = ""; // We store "YYYY-MM-DD" to track unique days

    if (userSnap.exists) {
      const data = userSnap.data();
      currentStatus = data?.currentStatus || "OUT";
      dailySessionCount = data?.dailySessionCount || 0;
      // Convert Firestore timestamp to Date string to check if it's a new day
      if (data?.lastActive) {
        lastActiveDateString = data.lastActive.toDate().toDateString();
      }
    }

    // --- CHECK: Double Scans ---
    if (action === "check-in" && currentStatus === "IN") {
      return NextResponse.json({ error: "You are already Checked IN!" }, { status: 400 });
    }
    if (action === "check-out" && currentStatus === "OUT") {
      return NextResponse.json({ error: "You are already Checked OUT!" }, { status: 400 });
    }

    // --- LOGIC: The Smart Counter ---
    const today = new Date();
    const todayString = today.toDateString();
    let incrementAttended = 0; // Does this action add to their "Total Attended"?

    if (action === "check-in") {
      // 1. Is this a new day?
      if (todayString !== lastActiveDateString) {
        dailySessionCount = 0; // Reset counter for the new day
      }

      // 2. Are they under the limit (Max 2 sessions counted per day)?
      if (dailySessionCount < 2) {
        incrementAttended = 1; // YES, count this session
        dailySessionCount++;   // Increment today's count
      } else {
        // They have already done 2 sessions today. 
        // We allow the check-in, but we DO NOT add to their "Attended" stat.
        incrementAttended = 0; 
      }
    }

    // 4. Perform Updates (Triple Write)
    const timestamp = FieldValue.serverTimestamp();
    const batch = db.batch();

    // A. Update User Status Board (With new Counters)
    const userUpdate: any = {
      lastActive: timestamp,
      currentStatus: action === "check-in" ? "IN" : "OUT",
      dailySessionCount: dailySessionCount // Save today's count so we remember it
    };

    // Only update the "Lifetime Attended" counter if logic allows
    if (incrementAttended > 0) {
      // atomic increment ensures accuracy even if they spam click
      userUpdate["attendance.attended"] = FieldValue.increment(1);
    }

    batch.set(userRef, userUpdate, { merge: true });

    // B. Add to Global Master Log
    const globalLogRef = db.collection("logs").doc();
    batch.set(globalLogRef, {
      userId: userId,
      userEmail: email,
      gymId: gymId,
      type: action.toUpperCase(),
      timestamp: timestamp,
    });

    // C. Add to User's Personal History
    const userLogRef = userRef.collection("attendance_logs").doc();
    batch.set(userLogRef, {
      gymId: gymId,
      status: action === "check-in" ? "Present" : "Checked Out",
      date: timestamp,
      checkInTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });

    await batch.commit();

    return NextResponse.json({ 
      success: true, 
      message: `Successfully ${action === 'check-in' ? 'Checked In' : 'Checked Out'}` 
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Server Error: " + error.message }, { status: 500 });
  }
}