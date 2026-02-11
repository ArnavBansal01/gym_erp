"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase"; // Client SDK
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Html5QrcodeScanner } from "html5-qrcode";
import "../user_erp_style.css"; 

export default function AttendancePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [currentStatus, setCurrentStatus] = useState<"IN" | "OUT">("OUT");
  const [loading, setLoading] = useState(true);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  // 1. Auth & Real-time Status Listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/");
        return;
      }
      setUser(currentUser);

      // Listen to the user's document for real-time status updates
      const userDocRef = doc(db, "users", currentUser.uid);
      const unsubscribeSnapshot = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Default to OUT if field doesn't exist
          setCurrentStatus(data.currentStatus === "IN" ? "IN" : "OUT");
        }
        setLoading(false);
      });

      return () => unsubscribeSnapshot();
    });

    return () => unsubscribeAuth();
  }, [router]);

  // 2. Initialize Scanner
  useEffect(() => {
    // Only init scanner if user is loaded and not currently processing a scan
    if (!loading && !scanResult && !processing) {
      // Small timeout to ensure DOM is ready
      const timeoutId = setTimeout(() => {
        // Prevent duplicate initialization
        if (scannerRef.current) return;

        const scanner = new Html5QrcodeScanner(
          "reader",
          { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
          },
          false
        );
        
        scannerRef.current = scanner;

        scanner.render(
          (decodedText) => {
            handleScanSuccess(decodedText);
          },
          (error) => {
            // Ignore scan errors, they happen every frame no QR is found
          }
        );
      }, 500);

      return () => clearTimeout(timeoutId);
    }

    // Cleanup function
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
        scannerRef.current = null;
      }
    };
  }, [loading, scanResult, processing]);

  // 3. Handle Successful Scan
  const handleScanSuccess = async (qrData: string) => {
    if (processing) return;
    
    // Stop scanning immediately
    if (scannerRef.current) {
      scannerRef.current.clear();
      scannerRef.current = null;
    }

    setProcessing(true);
    setScanResult("Processing...");

    try {
      // Get the ID token for security
      const token = await auth.currentUser?.getIdToken();

      // Determine action based on current status (Auto-Toggle)
      // If currently IN -> We are checking OUT. 
      // If currently OUT -> We are checking IN.
      const action = currentStatus === "IN" ? "check-out" : "check-in";

      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token || ""
        },
        body: JSON.stringify({
          gymId: qrData, // Assuming QR contains Gym ID (e.g., "ICONIC_KARNAL")
          action: action
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Scan failed");

      setScanResult(`Success! You are now Checked ${action === 'check-in' ? 'IN' : 'OUT'}`);
      
      // Reset after 3 seconds so they can scan again if needed
      setTimeout(() => {
        setScanResult(null);
        setProcessing(false);
      }, 3000);

    } catch (error: any) {
      console.error("Attendance Error:", error);
      setScanResult("Error: " + error.message);
      // Allow retry after error
      setTimeout(() => {
        setScanResult(null);
        setProcessing(false);
      }, 3000);
    }
  };

  return (
    <div className="erp-container">
      <div className="content-wrapper" style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        
        {/* Header */}
        <header className="header" style={{ marginBottom: '20px' }}>
          <div className="brand" onClick={() => router.push('/dashboard')} style={{cursor: 'pointer'}}>
            <span style={{fontSize: '1.5rem', marginRight: '10px'}}>←</span>
            <span className="gym-name">Back</span>
          </div>
        </header>

        <main className="main-content">
          <div className="card fade-in" style={{ textAlign: 'center' }}>
            
            {/* STATUS BADGE */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '5px' }}>Current Status</p>
              <div 
                style={{
                  display: 'inline-block',
                  padding: '10px 30px',
                  borderRadius: '30px',
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  backgroundColor: currentStatus === "IN" ? 'var(--success-green)' : '#eee',
                  color: currentStatus === "IN" ? '#fff' : '#333',
                  boxShadow: currentStatus === "IN" ? '0 4px 15px rgba(46, 204, 113, 0.3)' : 'none'
                }}
              >
                {currentStatus === "IN" ? "CHECKED IN" : "CHECKED OUT"}
              </div>
            </div>

            <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #eee' }} />

            {/* SCANNER AREA */}
            <h3>{processing ? "Processing..." : `Scan to Check ${currentStatus === 'IN' ? 'OUT' : 'IN'}`}</h3>
            
            <div style={{ 
              marginTop: '20px', 
              background: '#000', 
              borderRadius: '12px', 
              overflow: 'hidden',
              position: 'relative',
              minHeight: '300px'
            }}>
              {!processing && <div id="reader" style={{ width: '100%' }}></div>}
              
              {/* Overlay while processing or showing result */}
              {processing && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  flexDirection: 'column'
                }}>
                  {scanResult?.includes("Success") ? (
                    <div style={{ fontSize: '4rem' }}>✅</div>
                  ) : scanResult?.includes("Error") ? (
                     <div style={{ fontSize: '4rem' }}>❌</div>
                  ) : (
                    <div className="spinner"></div> // Add a spinner CSS class if you have one
                  )}
                  <p style={{ marginTop: '20px', fontSize: '1.2rem' }}>{scanResult}</p>
                </div>
              )}
            </div>

            <p style={{ marginTop: '20px', color: '#888', fontSize: '0.85rem' }}>
              Point your camera at the Gym's QR Code to mark your attendance.
            </p>

          </div>
        </main>
      </div>
    </div>
  );
}