"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase"; 
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Html5QrcodeScanner, Html5Qrcode } from "html5-qrcode"; // Import Html5Qrcode class
import "../user_erp_style.css"; 

export default function AttendancePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [currentStatus, setCurrentStatus] = useState<"IN" | "OUT">("OUT");
  const [loading, setLoading] = useState(true);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false); // State for drag visual
  
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

  // 2. Initialize Camera Scanner
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

  // --- NEW: DRAG AND DROP LOGIC ---
  
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    if (processing) return;
    setProcessing(true);
    setScanResult("Analyzing Image...");

    try {
      // Create a temporary instance just for file scanning
      const html5QrCode = new Html5Qrcode("file-reader-hidden");
      const result = await html5QrCode.scanFileV2(file, true);
      
      // If successful, pass the text to our main handler
      handleScanSuccess(result.decodedText);
      
      // Clean up
      html5QrCode.clear();
    } catch (err) {
      console.error("File Scan Error", err);
      setScanResult("Error: Could not read QR code from image.");
      setTimeout(() => {
        setScanResult(null);
        setProcessing(false);
      }, 3000);
    }
  };

  // 3. Shared Success Handler (Used by both Camera & Drag-Drop)
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
      const action = currentStatus === "IN" ? "check-out" : "check-in";

      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token || ""
        },
        body: JSON.stringify({
          gymId: qrData, 
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
    <div 
      className="erp-container"
      onDragEnter={handleDrag} 
      onDragOver={handleDrag} 
      onDragLeave={handleDrag} 
      onDrop={handleDrop}
    >
      {/* Hidden div required by library to process files */}
      <div id="file-reader-hidden" style={{display: 'none'}}></div>

      {/* DRAG OVERLAY (Shows when dragging file) */}
      {dragActive && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: '2rem', border: '5px dashed white',
          flexDirection: 'column', textAlign: 'center'
        }}>
          <div style={{fontSize: '4rem', marginBottom: '20px'}}>📂</div>
          Drop QR Image Here
        </div>
      )}

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

            {/* Helper Text */}
            <div style={{ 
              marginTop: '20px', padding: '15px', 
              border: '2px dashed #ccc', borderRadius: '8px',
              backgroundColor: '#fafafa' 
            }}>
              <p style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>
                Camera not working?
              </p>
              <p style={{ color: '#888', fontSize: '0.85rem' }}>
                Drag and drop a QR code image anywhere on this page to scan it.
              </p>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}