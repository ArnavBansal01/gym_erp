"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Html5Qrcode } from "html5-qrcode";
import {
  IconDumbbell,
  IconQrCode,
  IconCheck,
  IconAlertCircle,
  IconUpload,
  IconRefresh,
  IconChevronLeft,
  IconClock,
  IconShield,
  IconCamera,
} from "@/lib/svgIcons";

export default function TrainerAttendancePage() {
  const router = useRouter();

  // Mode: "pass" (Show Trainer Duty Pass) | "camera" (Camera scanner)
  const [viewMode, setViewMode] = useState<"pass" | "camera">("pass");

  const [currentStatus, setCurrentStatus] = useState<"IN" | "OUT">("OUT");
  const [loading, setLoading] = useState(true);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Animated Acknowledgment Modal State & Scan Lock
  const [ackModal, setAckModal] = useState<{
    show: boolean;
    action: "check-in" | "check-out";
    title: string;
    message: string;
    time: string;
  } | null>(null);

  const scanLockRef = useRef<boolean>(false);
  const lastScannedAtRef = useRef<number>(0);

  const [trainerData, setTrainerData] = useState<{
    uid: string;
    name: string;
    specialization: string;
    totalSessions: number;
  }>({
    uid: "",
    name: "Coach",
    specialization: "General Fitness",
    totalSessions: 0,
  });

  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    let unsubscribeSnap: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setTrainerData({
          uid: "guest-coach",
          name: "Coach Vikram Singh (Demo)",
          specialization: "Strength & Conditioning",
          totalSessions: 18,
        });
        setCurrentStatus("OUT");
        const payload = JSON.stringify({
          gymId: "ICONIC_GYM_KARNAL_ENTRANCE",
          trainerUid: "guest-coach",
          name: "Coach Vikram Singh",
          action: "check-in",
          timestamp: Date.now(),
        });
        QRCode.toDataURL(payload, {
          width: 320,
          margin: 2,
          color: { dark: "#0f766e", light: "#ffffff" },
        }).then((url) => setQrCodeDataUrl(url));
        setLoading(false);
        return;
      }

      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        let data: any = {};
        try {
          data = await res.json();
        } catch {
          // not JSON
        }
        if (data.user?.role !== "trainer" || data.user?.status !== "approved") {
          // Fallback to duty pass view
          setTrainerData({
            uid: user.uid,
            name: user.displayName || "Staff Coach",
            specialization: "Certified Coach",
            totalSessions: 12,
          });
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error("Trainer duty auth error:", e);
      }

      const userDocRef = doc(db, "users", user.uid);
      unsubscribeSnap = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTrainerData({
            uid: user.uid,
            name: data.name || user.displayName || "Coach",
            specialization: data.specialization || "Certified Coach",
            totalSessions: data.totalSessions || 0,
          });

          setCurrentStatus(data.currentStatus === "IN" ? "IN" : "OUT");

          // Generate Trainer Duty Pass QR Code
          const payload = JSON.stringify({
            gymId: "ICONIC_GYM_KARNAL_ENTRANCE",
            trainerUid: user.uid,
            name: data.name || user.displayName || "Trainer",
            action: data.currentStatus === "IN" ? "check-out" : "check-in",
            timestamp: Date.now(),
          });

          QRCode.toDataURL(payload, {
            width: 320,
            margin: 2,
            color: { dark: "#042f2e", light: "#ffffff" },
          }).then((url) => setQrCodeDataUrl(url));
        }
        setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnap) unsubscribeSnap();
    };
  }, [router]);

  // Start live camera and trigger browser permission prompt immediately
  const startCameraScanner = async () => {
    setCameraError(null);
    setIsCameraActive(false);

    try {
      const element = document.getElementById("trainer-reader");
      if (!element) return;

      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch (e) {}
        scannerRef.current = null;
      }

      // Check if getUserMedia is supported in the current context
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "Live camera streaming requires HTTPS on mobile devices. You can tap 'Open Phone Camera' below to scan directly using your phone's camera!"
        );
        return;
      }

      // Step 1: Explicitly request camera permissions from the browser
      let permStream: MediaStream | null = null;
      try {
        permStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
      } catch (permErr: any) {
        if (
          permErr.name === "NotAllowedError" ||
          permErr.name === "PermissionDeniedError" ||
          permErr.message?.toLowerCase().includes("denied")
        ) {
          setCameraError(
            "Camera permission was blocked. Please tap 'Grant Camera Permission' below or enable camera in your browser settings."
          );
          return;
        }
        // Fallback to basic video constraint
        try {
          permStream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (e) {
          throw permErr;
        }
      }

      if (permStream) {
        permStream.getTracks().forEach((t) => t.stop());
      }

      // Step 2: Initialize Html5Qrcode
      const html5QrCode = new Html5Qrcode("trainer-reader");
      scannerRef.current = html5QrCode;

      // Try environment (rear) camera; fallback to front camera if constrained
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleLogShift(decodedText);
          },
          () => {}
        );
      } catch (startErr: any) {
        console.warn("Environment camera start failed, attempting user camera:", startErr);
        await html5QrCode.start(
          { facingMode: "user" },
          {
            fps: 15,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleLogShift(decodedText);
          },
          () => {}
        );
      }

      setIsCameraActive(true);
    } catch (err: any) {
      console.error("Camera activation error:", err);
      setIsCameraActive(false);
      if (
        err.name === "NotAllowedError" ||
        err.message?.toLowerCase().includes("permission") ||
        err.message?.toLowerCase().includes("denied")
      ) {
        setCameraError(
          "Camera access permission was denied. Tap 'Grant Camera Permission' or use 'Open Phone Camera' below."
        );
      } else if (err.name === "NotFoundError" || err.message?.toLowerCase().includes("notfound")) {
        setCameraError("No working camera found on this device. You can tap 'Open Phone Camera' below.");
      } else {
        setCameraError(
          err.message || "Failed to start camera. Please verify device permissions or tap 'Open Phone Camera' below."
        );
      }
    }
  };

  const stopCameraScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {}
      scannerRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (viewMode === "camera") {
      const timer = setTimeout(() => {
        startCameraScanner();
      }, 150);
      return () => {
        clearTimeout(timer);
        stopCameraScanner();
      };
    } else {
      stopCameraScanner();
    }
  }, [viewMode]);

  // Direct Attendance Trigger (Instant Shift In / Shift Out) with Infinite-Loop Lock
  const handleLogShift = async (gymIdOverride?: string) => {
    if (processing || scanLockRef.current) return;

    // Minimum 3.5-second cooldown to completely prevent multi-frame rapid triggering
    const now = Date.now();
    if (now - lastScannedAtRef.current < 3500) return;
    lastScannedAtRef.current = now;

    scanLockRef.current = true; // Lock camera immediately!

    // Pause video scanner frame so user sees frozen capture instead of cycling
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.pause(true);
        }
      } catch (e) {}
    }

    setProcessing(true);
    setScanResult("Recording duty shift with server...");
    setIsSuccess(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const action = currentStatus === "IN" ? "check-out" : "check-in";

      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token || "",
        },
        body: JSON.stringify({
          gymId: gymIdOverride || "ICONIC_GYM_KARNAL_ENTRANCE",
          action,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Shift update failed");

      // Trigger animated confirmation modal
      setAckModal({
        show: true,
        action,
        title: action === "check-in" ? "SHIFT STARTED" : "SHIFT COMPLETED",
        message:
          action === "check-in"
            ? `Welcome on duty, ${trainerData.name}! Your shift has been recorded. Have a great coaching session!`
            : `Great job, ${trainerData.name}! Your coaching shift has been logged and completed. See you next time!`,
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      });

      setScanResult(`Duty shift ${action === "check-in" ? "started" : "completed"} successfully.`);
      setIsSuccess(true);
    } catch (error: any) {
      setScanResult(error.message);
      setIsSuccess(false);
      setAckModal({
        show: true,
        action: "check-in",
        title: "DUTY SHIFT FAILED",
        message: error.message || "Failed to record duty shift with server.",
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleCloseAckModal = () => {
    setAckModal(null);
    setScanResult(null);
    setIsSuccess(null);

    // Switch view back to pass screen to avoid immediate rescanning
    setViewMode("pass");

    // Release scan lock after delay
    setTimeout(() => {
      scanLockRef.current = false;
      if (scannerRef.current) {
        try {
          scannerRef.current.resume();
        } catch (e) {}
      }
    }, 2500);
  };

  const processFile = async (file: File) => {
    if (processing) return;
    if (!file.type.startsWith("image/")) {
      setScanResult("Error: Please provide a valid image file.");
      setIsSuccess(false);
      setTimeout(() => {
        setScanResult(null);
        setIsSuccess(null);
      }, 3000);
      return;
    }

    setProcessing(true);
    setScanResult("Scanning QR code from uploaded image...");
    setIsSuccess(null);

    try {
      const html5QrCode = new Html5Qrcode("file-reader-hidden-trainer");
      const result = await html5QrCode.scanFileV2(file, true);
      handleLogShift(result.decodedText);
      html5QrCode.clear();
    } catch {
      setScanResult("No valid QR code detected in image.");
      setIsSuccess(false);
      setTimeout(() => {
        setScanResult(null);
        setIsSuccess(null);
        setProcessing(false);
      }, 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <IconRefresh className="animate-spin text-teal-400" size={32} />
          <p className="text-sm font-medium tracking-wide">Loading Trainer Duty Terminal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col items-center justify-center p-4 relative">
      <div id="file-reader-hidden-trainer" style={{ display: "none" }} />

      {/* CONTAINER */}
      <div className="w-full max-w-md space-y-6">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/trainer/dashboard")}
            className="btn-slate text-xs py-2 px-3"
          >
            <IconChevronLeft size={16} />
            <span>Trainer Dashboard</span>
          </button>
          <div className="text-right">
            <span className="text-xs uppercase font-extrabold tracking-wider text-white block">
              Iconic Gym
            </span>
            <span className="text-[10px] uppercase text-teal-400 font-bold tracking-widest block">
              Staff Shift Gate
            </span>
          </div>
        </div>

        {/* STATUS BANNER */}
        <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                currentStatus === "IN" ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
              }`}
            />
            <div>
              <span className="text-xs text-slate-400 block">Duty Status</span>
              <strong
                className={`text-sm font-extrabold ${
                  currentStatus === "IN" ? "text-emerald-400" : "text-white"
                }`}
              >
                {currentStatus === "IN" ? "Currently On Duty" : "Currently Off Duty"}
              </strong>
            </div>
          </div>

          <span
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
              currentStatus === "IN"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-slate-800 text-slate-400 border border-slate-700"
            }`}
          >
            {currentStatus === "IN" ? "ACTIVE SHIFT" : "OFF DUTY"}
          </span>
        </div>

        {/* MODE TOGGLE TABS (2 Tabs Only: My QR Pass & Camera Scanner) */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewMode("pass")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              viewMode === "pass"
                ? "bg-slate-800 text-teal-400 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            My QR Pass
          </button>
          <button
            onClick={() => setViewMode("camera")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              viewMode === "camera"
                ? "bg-slate-800 text-teal-400 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Camera Scanner
          </button>
        </div>

        {/* NOTIFICATION FEEDBACK */}
        {scanResult && (
          <div
            className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
              isSuccess === true
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                : isSuccess === false
                ? "bg-rose-500/10 border border-rose-500/30 text-rose-400"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            {isSuccess === true && <IconCheck size={18} className="shrink-0" />}
            {isSuccess === false && <IconAlertCircle size={18} className="shrink-0" />}
            {isSuccess === null && <IconRefresh size={18} className="animate-spin shrink-0" />}
            <span>{scanResult}</span>
          </div>
        )}

        {/* VIEW 1: TRAINER DUTY PASS (DEFAULT) */}
        {viewMode === "pass" && (
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 sm:p-8 space-y-6 text-center shadow-2xl">
            <div className="space-y-1">
              <span className="text-xs uppercase font-extrabold tracking-wider text-teal-400">
                Staff Duty Access
              </span>
              <h2 className="text-xl font-bold text-white">{trainerData.name}</h2>
              <p className="text-xs text-slate-400">
                {trainerData.specialization} · Total Shifts:{" "}
                <strong className="text-slate-200">{trainerData.totalSessions}</strong>
              </p>
            </div>

            {/* QR CODE CONTAINER */}
            <div className="p-4 bg-white rounded-2xl shadow-xl inline-block border-4 border-teal-500/30">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Trainer Shift QR Code"
                  className="w-56 h-56 mx-auto block rounded-lg"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-slate-400">
                  <IconRefresh className="animate-spin" size={32} />
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              Present this QR code to the entrance reader to log coaching shift hours.
            </p>

            <div className="pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleLogShift()}
                disabled={processing}
                className={`w-full py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg ${
                  currentStatus === "IN"
                    ? "bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20"
                    : "btn-emerald w-full py-3.5 shadow-teal-500/20"
                } disabled:opacity-50`}
              >
                {processing
                  ? "Recording..."
                  : currentStatus === "IN"
                  ? "End Duty Shift (Clock Out)"
                  : "Start Duty Shift (Clock In)"}
              </button>
            </div>
          </div>
        )}

        {/* VIEW 2: CAMERA SCANNER (DIRECT ACTIVATION + PERMISSIONS PROMPT) */}
        {viewMode === "camera" && (
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="text-center">
              <h3 className="text-lg font-bold text-white">Scan Facility Shift QR</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Align the physical entrance QR code in your camera view.
              </p>
            </div>

            {/* CAMERA PERMISSION ERROR / FALLBACK BANNER */}
            {cameraError && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-3">
                <div className="flex items-start gap-2.5">
                  <IconAlertCircle size={18} className="shrink-0 text-amber-400 mt-0.5" />
                  <p className="leading-relaxed">{cameraError}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={startCameraScanner}
                    className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
                  >
                    Grant Camera Access & Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => document.getElementById("trainer-native-camera-input")?.click()}
                    className="py-2.5 px-3 rounded-xl btn-emerald text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <IconCamera size={14} />
                    <span>Open Phone Camera</span>
                  </button>
                </div>
              </div>
            )}

            {/* VIEWFINDER */}
            <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 min-h-[260px] flex items-center justify-center shadow-inner">
              <div id="trainer-reader" className="w-full" style={{ opacity: processing ? 0.3 : 1 }} />
              {!isCameraActive && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-slate-400 p-4 text-center">
                  <IconRefresh className="animate-spin text-teal-400" size={24} />
                  <p className="text-xs font-semibold text-slate-200">Requesting Camera Access...</p>
                  <p className="text-[11px] text-slate-400">Please tap &ldquo;Allow&rdquo; on the browser prompt.</p>
                </div>
              )}
            </div>

            {/* NATIVE PHONE CAMERA INSTANT SCANNER BUTTON */}
            <button
              type="button"
              onClick={() => document.getElementById("trainer-native-camera-input")?.click()}
              className="btn-emerald w-full py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer"
            >
              <IconCamera size={18} />
              <span>Open Phone Camera (Tap to Scan)</span>
            </button>
            <input
              id="trainer-native-camera-input"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
            />

            {/* UPLOAD FILE FALLBACK */}
            <div
              onClick={() => document.getElementById("trainer-file-upload")?.click()}
              className="p-3.5 rounded-xl border border-dashed border-slate-700 hover:border-teal-500/50 bg-slate-900/60 text-center cursor-pointer transition-all flex items-center justify-center gap-2 text-xs font-semibold text-slate-300 hover:text-white"
            >
              <IconUpload size={16} className="text-teal-400" />
              <span>Or Upload QR Code Screenshot</span>
              <input
                id="trainer-file-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
              />
            </div>
          </div>
        )}
      </div>

      {/* ANIMATED ACKNOWLEDGMENT MODAL (PREVENTS INFINITE LOOP) */}
      {ackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#0f172a] border border-slate-700/80 rounded-3xl max-w-sm w-full p-6 sm:p-7 text-center shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            {/* ANIMATED PULSING ICON */}
            <div className="flex justify-center pt-2">
              {ackModal.title.includes("FAILED") ? (
                <div className="w-20 h-20 rounded-full bg-rose-500/20 border-4 border-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/30 animate-bounce">
                  <IconAlertCircle size={44} className="text-rose-400" />
                </div>
              ) : ackModal.action === "check-in" ? (
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-teal-500/20 border-4 border-teal-400 flex items-center justify-center shadow-lg shadow-teal-500/30 animate-pulse">
                    <IconCheck size={44} className="text-teal-400" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-teal-500"></span>
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-cyan-500/20 border-4 border-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/30 animate-pulse">
                    <IconClock size={40} className="text-cyan-400" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500"></span>
                  </span>
                </div>
              )}
            </div>

            {/* TITLE & DETAILS */}
            <div className="space-y-1.5">
              <span
                className={`text-[11px] uppercase font-extrabold tracking-widest block ${
                  ackModal.title.includes("FAILED")
                    ? "text-rose-400"
                    : ackModal.action === "check-in"
                    ? "text-teal-400"
                    : "text-cyan-400"
                }`}
              >
                {ackModal.title}
              </span>
              <h3 className="text-xl font-extrabold text-white">
                {ackModal.action === "check-in" ? "Duty Shift Started!" : "Duty Shift Ended!"}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto pt-1">
                {ackModal.message}
              </p>
            </div>

            {/* EVENT DETAILS CARD */}
            <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-slate-800 text-xs space-y-2 text-left">
              <div className="flex items-center justify-between text-slate-400">
                <span>Staff Member</span>
                <strong className="text-white font-semibold">{trainerData.name}</strong>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Specialization</span>
                <strong className="text-slate-200">{trainerData.specialization}</strong>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Shift Time</span>
                <strong className="text-slate-200">{ackModal.time}</strong>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Gate Facility</span>
                <strong className="text-teal-400">Staff Shift Gate</strong>
              </div>
            </div>

            {/* ACKNOWLEDGE BUTTON */}
            <button
              type="button"
              onClick={handleCloseAckModal}
              className={`w-full py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg cursor-pointer ${
                ackModal.title.includes("FAILED")
                  ? "bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/25"
                  : ackModal.action === "check-in"
                  ? "btn-emerald shadow-teal-500/25"
                  : "bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/25"
              }`}
            >
              Done & Return to My Pass
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
