"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase"; 
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Html5QrcodeScanner, Html5Qrcode } from "html5-qrcode";
import "../user_erp_style.css"; 

export default function UserAttendance() {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState<"IN" | "OUT">("OUT");
  const [loading, setLoading] = useState(true);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  // Global Drag Events (Same smooth logic as Trainer)
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.relatedTarget === null) setDragActive(false);
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer?.files?.[0]) {
        processFile(e.dataTransfer.files[0]);
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [processing]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/"); 
        return;
      }

      // Logic stays specific to 'users' collection
      const userDocRef = doc(db, "users", user.uid);
      const unsubscribeSnap = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setCurrentStatus(docSnap.data().currentStatus === "IN" ? "IN" : "OUT");
        }
        setLoading(false);
      });

      return () => unsubscribeSnap();
    });

    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!loading && !scannerRef.current) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { 
          fps: 15, 
          qrbox: { width: 250, height: 250 }, 
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true 
        },
        false
      );
      
      scannerRef.current = scanner;
      scanner.render((text) => handleScanSuccess(text), (err) => {});
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => {});
        scannerRef.current = null;
      }
    };
  }, [loading]);

  const processFile = async (file: File) => {
    if (processing) return;
    if (!file.type.startsWith("image/")) {
      setScanResult("Error: Please drop an image file.");
      setTimeout(() => setScanResult(null), 3000);
      return;
    }

    setProcessing(true);
    setScanResult("Reading QR from Image...");

    try {
      const html5QrCode = new Html5Qrcode("file-reader-hidden");
      const result = await html5QrCode.scanFileV2(file, true);
      handleScanSuccess(result.decodedText);
      html5QrCode.clear();
    } catch (err) {
      setScanResult("Error: No QR detected in photo.");
      setTimeout(() => { setScanResult(null); setProcessing(false); }, 3000);
    }
  };

  const handleScanSuccess = async (qrData: string) => {
    if (processing && !scanResult?.includes("Reading")) return;

    setProcessing(true);
    setScanResult("Syncing with Server...");

    try {
      const token = await auth.currentUser?.getIdToken();
      const action = currentStatus === "IN" ? "check-out" : "check-in";

      // Logic stays specific to User API endpoint
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": token || "" },
        body: JSON.stringify({ gymId: qrData, action: action })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Connection failed");

      setScanResult(`Check-${action === 'check-in' ? 'In' : 'Out'} Successful!`);
      setTimeout(() => { setScanResult(null); setProcessing(false); }, 3000);

    } catch (error: any) {
      setScanResult(error.message);
      setTimeout(() => { setScanResult(null); setProcessing(false); }, 4000);
    }
  };

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafd' }}>
        <div className="spinner"></div>
    </div>
  );

  return (
    <div className="erp-container" style={{ background: '#f4f7f9', minHeight: '100vh', position: 'relative' }}>
      <div id="file-reader-hidden" style={{ display: 'none' }}></div>

      {/* GLOBAL DRAG OVERLAY (Matching Trainer UI) */}
      {dragActive && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(46, 204, 113, 0.9)', 
          zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', border: '10px dashed #fff', pointerEvents: 'none',
          backdropFilter: 'blur(8px)', transition: 'all 0.3s ease'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '6rem', marginBottom: '20px' }}>📸</div>
            <h2 style={{ fontSize: '2rem', fontWeight: '800' }}>Drop QR to Check In/Out</h2>
          </div>
        </div>
      )}

      <div className="content-wrapper" style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 20px' }}>
        
        {/* HEADER */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px' }}>
          <button 
            onClick={() => router.push('/dashboard')}
            style={{
              background: '#fff', border: 'none', padding: '12px 18px', 
              borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center',
              gap: '8px', color: '#475569', fontWeight: '600', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>‹</span> Dashboard
          </button>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b', fontWeight: '700' }}>Member Portal</h2>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Attendance</p>
          </div>
        </header>

        <main>
          <div className="card shadow-sm" style={{ 
            background: '#fff', borderRadius: '28px', padding: '32px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05)',
            border: '1px solid #ffffff'
          }}>
            
            {/* STATUS BADGE */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '6px 16px', borderRadius: '100px', fontSize: '0.85rem', fontWeight: '700',
                  backgroundColor: currentStatus === "IN" ? '#dcfce7' : '#f1f5f9',
                  color: currentStatus === "IN" ? '#15803d' : '#64748b',
                  border: `1px solid ${currentStatus === "IN" ? '#bbf7d0' : '#e2e8f0'}`
                }}>
                <span style={{ 
                  width: '8px', height: '8px', borderRadius: '50%', 
                  background: currentStatus === "IN" ? '#22c55e' : '#94a3b8',
                  boxShadow: currentStatus === "IN" ? '0 0 8px #22c55e' : 'none'
                }}></span>
                {currentStatus === "IN" ? "Currently Inside" : "Currently Outside"}
              </div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '25px' }}>
              <h3 style={{ color: '#0f172a', marginBottom: '8px', fontSize: '1.5rem', fontWeight: '800' }}>
                {currentStatus === 'IN' ? 'Check Out' : 'Check In'}
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
                 Scan the Gym QR code to log your visit.
              </p>
            </div>
            
            {/* SCANNER AREA */}
            <div style={{ 
                background: '#000', borderRadius: '24px', overflow: 'hidden', 
                height: '320px', position: 'relative',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
            }}>
              <div id="reader" style={{ width: '100%', opacity: processing ? 0.2 : 1 }}></div>
              
              {processing && (
                <div style={{ 
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', 
                  justifyContent: 'center', color: '#fff', flexDirection: 'column', 
                  background: 'rgba(15, 23, 42, 0.85)', zIndex: 10, backdropFilter: 'blur(4px)'
                }}>
                  {scanResult?.includes("Successful") ? (
                    <div style={{ fontSize: '4rem', animation: 'scaleUp 0.3s ease-out' }}>✅</div>
                  ) : scanResult?.includes("Error") ? (
                    <div style={{ fontSize: '4rem' }}>❌</div>
                  ) : (
                    <div className="spinner" style={{ borderTopColor: '#3498db' }}></div> 
                  )}
                  <p style={{ marginTop: '20px', fontWeight: '600', textAlign: 'center', padding: '0 20px' }}>
                    {scanResult}
                  </p>
                </div>
              )}
            </div>

            {/* ACTION FOOTER */}
            <div 
              style={{ 
                marginTop: '24px', padding: '16px', border: '2px dashed #e2e8f0', 
                borderRadius: '20px', textAlign: 'center', cursor: 'pointer',
                transition: 'all 0.2s ease'
              }} 
              onClick={() => document.getElementById('file-upload')?.click()}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3498db'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
            >
              <span style={{ color: '#3498db', fontSize: '0.9rem', fontWeight: '700' }}>
                📁 Upload or Drag QR Image
              </span>
              <input id="file-upload" type="file" accept="image/*" style={{ display: 'none' }} 
                     onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
            </div>

          </div>

          <p style={{ marginTop: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
            Ensure the QR code is clearly visible for the scanner.
          </p>
        </main>
      </div>
      
      <style jsx global>{`
        @keyframes scaleUp {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        #reader__dashboard_toggle { display: none !important; }
        #reader video { object-fit: cover !important; }
      `}</style>
    </div>
  );
}