import { NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// --- INITIALIZE FIREBASE ADMIN ---
// This check prevents "App already exists" errors during hot-reloading
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
    const VALID_GYM_IDS = ["ICONIC_GYM_KARNAL_ENTRANCE", "ICONIC_GYM_FLOOR_2"];

    if (!VALID_GYM_IDS.includes(gymId)) {
      return NextResponse.json({ error: "Invalid QR Code. Please scan the official Gym QR." }, { status: 400 });
    }

    // 3. Logic: Validate Status
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    let currentStatus = "OUT"; 
    if (userSnap.exists) {
      currentStatus = userSnap.data()?.currentStatus || "OUT";
    }

    // Prevent double check-ins
    if (action === "check-in" && currentStatus === "IN") {
      return NextResponse.json({ error: "You are already Checked IN!" }, { status: 400 });
    }
    // Prevent double check-outs
    if (action === "check-out" && currentStatus === "OUT") {
      return NextResponse.json({ error: "You are already Checked OUT!" }, { status: 400 });
    }

    // 4. Perform Updates (Triple Write)
    const timestamp = FieldValue.serverTimestamp(); // Use server timestamp for accuracy
    const batch = db.batch();

    // A. Update User Status Board
    batch.set(userRef, {
      lastActive: timestamp,
      currentStatus: action === "check-in" ? "IN" : "OUT"
    }, { merge: true });

    // B. Add to Global Master Log (Admin View)
    const globalLogRef = db.collection("logs").doc();
    batch.set(globalLogRef, {
      userId: userId,
      userEmail: email,
      gymId: gymId,
      type: action.toUpperCase(),
      timestamp: timestamp,
    });

    // C. Add to User's Personal History (Your "attendance_logs" subcollection)
    const userLogRef = userRef.collection("attendance_logs").doc();
    batch.set(userLogRef, {
      gymId: gymId,
      status: action === "check-in" ? "Present" : "Checked Out", // Mapping for your UI
      date: timestamp,
      checkInTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) // Simple string for display
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