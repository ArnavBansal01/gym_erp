"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Html5Qrcode } from "html5-qrcode";
import { computeMembership } from "@/lib/membershipUtils";
import {
  IconDumbbell,
  IconQrCode,
  IconCheck,
  IconAlertCircle,
  IconUpload,
  IconRefresh,
  IconChevronLeft,
  IconClock,
  IconUser,
  IconCamera,
} from "@/lib/svgIcons";

export default function UserAttendance() {
  const router = useRouter();

  // Mode: "pass" (Show personalized member pass) | "camera" (Use camera to scan gate turnstile)
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

  const [userData, setUserData] = useState<{
    uid: string;
    name: string;
    phone: string;
    plan: any;
    createdAt: any;
  }>({
    uid: "",
    name: "Member",
    phone: "",
    plan: null,
    createdAt: null,
  });

  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Listen to member user doc
  useEffect(() => {
    let unsubscribeSnap: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        const demoUid = "guest-member";
        setUserData({
          uid: demoUid,
          name: "Member Pass (Demo)",
          phone: "+91 98765 43210",
          plan: { name: "Quarterly Standard", daysLeft: 65 },
          createdAt: new Date().toISOString(),
        });
        setCurrentStatus("OUT");

        const payload = JSON.stringify({
          gymId: "AURA_CLUB_MAIN_ENTRANCE",
          memberUid: demoUid,
          name: "Guest Member",
          action: "check-in",
          timestamp: Date.now(),
        });

        QRCode.toDataURL(payload, {
          width: 320,
          margin: 2,
          color: { dark: "#141414", light: "#ffffff" },
        }).then((url) => setQrCodeDataUrl(url));

        setLoading(false);
        return;
      }

      const userDocRef = doc(db, "users", user.uid);
      unsubscribeSnap = onSnapshot(userDocRef, (docSnap) => {
        if (!docSnap.exists()) {
          const payload = JSON.stringify({
            gymId: "AURA_CLUB_MAIN_ENTRANCE",
            memberUid: user.uid,
            name: user.displayName || "Member",
            action: "check-in",
            timestamp: Date.now(),
          });
          QRCode.toDataURL(payload, {
            width: 320,
            margin: 2,
            color: { dark: "#141414", light: "#ffffff" },
          }).then((url) => setQrCodeDataUrl(url));
          setLoading(false);
          return;
        }

        const data = docSnap.data();
        if (data.role === "trainer") {
          router.push("/trainer/attendance");
          return;
        }

        setUserData({
          uid: user.uid,
          name: data.name || user.displayName || "Member",
          phone: data.phone || "",
          plan: data.plan,
          createdAt: data.createdAt,
        });

        setCurrentStatus(data.currentStatus === "IN" ? "IN" : "OUT");

        // Generate personal Member Pass QR Code
        const payload = JSON.stringify({
          gymId: "AURA_CLUB_MAIN_ENTRANCE",
          memberUid: user.uid,
          name: data.name || user.displayName || "Member",
          action: data.currentStatus === "IN" ? "check-out" : "check-in",
          timestamp: Date.now(),
        });

        QRCode.toDataURL(payload, {
          width: 320,
          margin: 2,
          color: { dark: "#141414", light: "#ffffff" },
        }).then((url) => setQrCodeDataUrl(url));

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
      const element = document.getElementById("reader");
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
      const html5QrCode = new Html5Qrcode("reader");
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
            handleLogAttendance(decodedText);
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
            handleLogAttendance(decodedText);
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

  // Direct Attendance Trigger (Instant Check-In / Check-Out) with Infinite-Loop Lock
  const handleLogAttendance = async (gymIdOverride?: string) => {
    if (processing || scanLockRef.current) return;

    // Minimum 3-second cooldown to completely prevent multi-frame rapid triggering
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

    const membership = computeMembership(userData.plan, userData.createdAt);
    if (membership.status === "EXPIRED") {
      setScanResult("Check-in Denied: Membership has expired. Please renew first.");
      setIsSuccess(false);
      setAckModal({
        show: true,
        action: "check-in",
        title: "ACCESS DENIED",
        message: "Your membership plan has expired. Please renew your subscription to access the facility.",
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      });
      return;
    }

    setProcessing(true);
    setScanResult("Recording attendance with server...");
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
          gymId: gymIdOverride || "AURA_CLUB_MAIN_ENTRANCE",
          action,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Attendance record failed");

      // Trigger animated confirmation modal
      setAckModal({
        show: true,
        action,
        title: action === "check-in" ? "CHECK-IN CONFIRMED" : "CHECK-OUT RECORDED",
        message:
          action === "check-in"
            ? `Welcome to AURA Athletic Club, ${userData.name}! Your entrance has been recorded. Have a powerful workout session!`
            : `Goodbye, ${userData.name}! Your workout session has been completed and logged. Have a great day!`,
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      });

      setScanResult(`Check-${action === "check-in" ? "In" : "Out"} recorded successfully.`);
      setIsSuccess(true);
    } catch (error: any) {
      setScanResult(error.message);
      setIsSuccess(false);
      setAckModal({
        show: true,
        action: "check-in",
        title: "ATTENDANCE FAILED",
        message: error.message || "Failed to communicate with gate attendance server.",
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
      const html5QrCode = new Html5Qrcode("file-reader-hidden");
      const result = await html5QrCode.scanFileV2(file, true);
      handleLogAttendance(result.decodedText);
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
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center text-[#4A4640]">
        <div className="flex flex-col items-center gap-3">
          <IconRefresh className="animate-spin text-[#C93E0B]" size={32} />
          <p className="text-sm font-medium tracking-wide">Loading Attendance Terminal...</p>
        </div>
      </div>
    );
  }

  const membership = computeMembership(userData.plan, userData.createdAt);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#141414] flex flex-col items-center justify-center p-4 relative">
      <div id="file-reader-hidden" style={{ display: "none" }} />

      {/* CONTAINER */}
      <div className="w-full max-w-md space-y-6">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/dashboard")}
            className="btn-slate text-xs py-2 px-3"
          >
            <IconChevronLeft size={16} />
            <span>Dashboard</span>
          </button>
          <div className="text-right">
            <span className="text-xs font-bold tracking-wide text-[#141414] block">
              AURA Athletic Club
            </span>
            <span className="text-[11px] text-[#C93E0B] font-bold tracking-wide block">
              Attendance Terminal
            </span>
          </div>
        </div>

        {/* STATUS BANNER */}
        <div className="bg-[#FFFFFF] rounded-2xl border border-[#ECE7E0] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                currentStatus === "IN" ? "bg-[#1F9D55] animate-pulse" : "bg-[#A09A92]"
              }`}
            />
            <div>
              <span className="text-xs text-[#6B6760] block">Current Status</span>
              <strong
                className={`text-sm font-bold ${
                  currentStatus === "IN" ? "text-[#17803F]" : "text-[#141414]"
                }`}
              >
                {currentStatus === "IN" ? "Checked In (Inside Facility)" : "Checked Out (Outside)"}
              </strong>
            </div>
          </div>

          <span
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide ${
              membership.status === "ACTIVE"
                ? "bg-[#1F9D55]/10 text-[#17803F] border border-[#1F9D55]/20"
                : "bg-[#D93636]/10 text-[#C42B2B] border border-[#D93636]/20"
            }`}
          >
            {membership.status}
          </span>
        </div>

        {/* MODE TOGGLE TABS (ONLY 2 TABS: MY PASS & CAMERA SCANNER) */}
        <div className="flex items-center gap-1 bg-white/90 p-1.5 rounded-xl border border-[#ECE7E0]">
          <button
            onClick={() => setViewMode("pass")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              viewMode === "pass"
                ? "bg-[#F1EDE7] text-[#C93E0B] shadow-sm"
                : "text-[#6B6760] hover:text-[#2A2724]"
            }`}
          >
            My QR Pass
          </button>
          <button
            onClick={() => setViewMode("camera")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              viewMode === "camera"
                ? "bg-[#F1EDE7] text-[#141414] shadow-sm"
                : "text-[#6B6760] hover:text-[#2A2724]"
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
                ? "bg-[#1F9D55]/10 border border-[#1F9D55]/30 text-[#17803F]"
                : isSuccess === false
                ? "bg-[#D93636]/10 border border-[#D93636]/30 text-[#C42B2B]"
                : "bg-[#F1EDE7] text-[#4A4640]"
            }`}
          >
            {isSuccess === true && <IconCheck size={18} className="shrink-0" />}
            {isSuccess === false && <IconAlertCircle size={18} className="shrink-0" />}
            {isSuccess === null && <IconRefresh size={18} className="animate-spin shrink-0" />}
            <span>{scanResult}</span>
          </div>
        )}

        {/* VIEW 1: MY MEMBER QR PASS (DEFAULT) */}
        {viewMode === "pass" && (
          <div className="hero-dark rounded-2xl border border-white/10 p-6 sm:p-8 space-y-6 text-center shadow-md">
            <div className="space-y-1">
              <span className="text-xs font-bold tracking-wide text-[#FF5A1F]">
                Digital Membership ID
              </span>
              <h2 className="text-3xl font-bold text-white font-display">{userData.name}</h2>
              <p className="text-xs text-white/60">
                Plan: <strong className="text-white">{membership.planName}</strong> · Valid until:{" "}
                <strong className="text-white">{membership.endDateFormatted}</strong>
              </p>
            </div>

            {/* QR CODE CONTAINER */}
            <div className="p-4 bg-white rounded-2xl inline-block border-4 border-[#FF5A1F]">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Member Attendance QR Code"
                  className="w-56 h-56 mx-auto block rounded-lg"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-[#6B6760]">
                  <IconRefresh className="animate-spin" size={32} />
                </div>
              )}
            </div>

            <p className="text-xs text-white/55 leading-relaxed max-w-xs mx-auto">
              Present this QR code to the entrance reader or front counter turnstile to pass.
            </p>

            {/* ONE-CLICK ATTENDANCE TOGGLE */}
            <div className="pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => handleLogAttendance()}
                disabled={processing || membership.status === "EXPIRED"}
                className={`w-full py-3.5 rounded-xl font-bold text-xs tracking-wide transition-all shadow-md ${
                  currentStatus === "IN"
                    ? "bg-[#D93636] hover:bg-[#E04B4B] text-white shadow-[#141414]/10"
                    : "btn-emerald w-full py-3.5 shadow-[#141414]/10"
                } disabled:opacity-50`}
              >
                {processing
                  ? "Processing..."
                  : currentStatus === "IN"
                  ? "Log Check-Out (Leave Facility)"
                  : "Log Check-In (Enter Facility)"}
              </button>
            </div>
          </div>
        )}

        {/* VIEW 2: CAMERA SCANNER (ACTIVATES INSTANTLY ON TAB SELECTION) */}
        {viewMode === "camera" && (
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#ECE7E0] p-6 space-y-5 shadow-md">
            <div className="text-center">
              <h3 className="text-xl font-bold text-[#141414] font-display">Turnstile / Gate QR Scanner</h3>
              <p className="text-xs text-[#6B6760] mt-0.5">
                Point your camera at the gym entrance turnstile QR poster.
              </p>
            </div>

            {/* CAMERA PERMISSION ERROR / FALLBACK BANNER */}
            {cameraError && (
              <div className="p-4 rounded-xl bg-[#E0A100]/10 border border-[#E0A100]/30 text-[#8A6100] text-xs space-y-3">
                <div className="flex items-start gap-2.5">
                  <IconAlertCircle size={18} className="shrink-0 text-[#8A6100] mt-0.5" />
                  <p className="leading-relaxed">{cameraError}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={startCameraScanner}
                    className="py-2.5 px-3 rounded-xl bg-[#E0A100] hover:bg-[#E0A100] text-[#141414] font-bold text-xs tracking-wide transition-all cursor-pointer text-center"
                  >
                    Grant Camera Access & Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => document.getElementById("native-camera-input")?.click()}
                    className="py-2.5 px-3 rounded-xl btn-emerald text-xs tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <IconCamera size={14} />
                    <span>Open Phone Camera</span>
                  </button>
                </div>
              </div>
            )}

            {/* VIEWFINDER */}
            <div className="relative rounded-2xl overflow-hidden bg-[#141414] border border-[#ECE7E0] min-h-[260px] flex items-center justify-center shadow-inner">
              <div id="reader" className="w-full" style={{ opacity: processing ? 0.3 : 1 }} />
              {!isCameraActive && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#141414]/60 text-[#6B6760] p-4 text-center">
                  <IconRefresh className="animate-spin text-[#C93E0B]" size={24} />
                  <p className="text-xs font-semibold text-[#2A2724]">Requesting Camera Access...</p>
                  <p className="text-[11px] text-[#6B6760]">Please tap &ldquo;Allow&rdquo; on the browser prompt.</p>
                </div>
              )}
            </div>

            {/* NATIVE PHONE CAMERA INSTANT SCANNER BUTTON */}
            <button
              type="button"
              onClick={() => document.getElementById("native-camera-input")?.click()}
              className="btn-emerald w-full py-3.5 flex items-center justify-center gap-2 shadow-md shadow-[#141414]/10 cursor-pointer"
            >
              <IconCamera size={18} />
              <span>Open Phone Camera (Tap to Scan)</span>
            </button>
            <input
              id="native-camera-input"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
            />

            {/* UPLOAD FILE FALLBACK */}
            <div
              onClick={() => document.getElementById("file-upload")?.click()}
              className="p-3.5 rounded-xl border border-dashed border-[#E0D9CF] hover:border-[#FF5A1F]/50 bg-[#F7F4EF]/60 text-center cursor-pointer transition-all flex items-center justify-center gap-2 text-xs font-semibold text-[#4A4640] hover:text-[#141414]"
            >
              <IconUpload size={16} className="text-[#C93E0B]" />
              <span>Or Upload QR Code Screenshot</span>
              <input
                id="file-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
              />
            </div>
          </div>
        )}
      </div>

      {/* ANIMATED ATTENDANCE ACKNOWLEDGMENT MODAL */}
      {ackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141414]/60 backdrop-blur-md">
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E0D9CF]/80 w-full max-w-sm p-6 text-center space-y-6 shadow-md shadow-[#141414]/10 transform transition-all duration-300">
            {/* ANIMATED ICON BADGE */}
            <div className="flex justify-center">
              {ackModal.title.includes("DENIED") || ackModal.title.includes("FAILED") ? (
                <div className="w-20 h-20 rounded-full bg-[#D93636]/20 border-4 border-[#D93636] flex items-center justify-center animate-bounce shadow-md shadow-[#141414]/10">
                  <IconAlertCircle size={44} className="text-[#C42B2B]" />
                </div>
              ) : ackModal.action === "check-in" ? (
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-[#FF5A1F]/20 border-4 border-[#FF5A1F] flex items-center justify-center shadow-md shadow-[#141414]/10 animate-pulse">
                    <IconCheck size={44} className="text-[#C93E0B]" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5A1F] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-[#FF5A1F]"></span>
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-[#2F6FED]/20 border-4 border-[#2F6FED] flex items-center justify-center shadow-md shadow-[#141414]/10 animate-pulse">
                    <IconClock size={40} className="text-[#1F57C9]" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2F6FED] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-[#2F6FED]"></span>
                  </span>
                </div>
              )}
            </div>

            {/* TITLE & DETAILS */}
            <div className="space-y-1.5">
              <span
                className={`text-[11px] font-bold tracking-wide block ${
                  ackModal.title.includes("DENIED")
                    ? "text-[#C42B2B]"
                    : ackModal.action === "check-in"
                    ? "text-[#C93E0B]"
                    : "text-[#1F57C9]"
                }`}
              >
                {ackModal.title}
              </span>
              <h3 className="text-2xl font-bold text-[#141414] font-display">
                {ackModal.action === "check-in" ? "You Are Checked In!" : "You Are Checked Out!"}
              </h3>
              <p className="text-xs text-[#4A4640] leading-relaxed max-w-xs mx-auto pt-1">
                {ackModal.message}
              </p>
            </div>

            {/* EVENT DETAILS CARD */}
            <div className="bg-white/90 rounded-2xl p-3.5 border border-[#ECE7E0] text-xs space-y-2 text-left">
              <div className="flex items-center justify-between text-[#6B6760]">
                <span>Member Name</span>
                <strong className="text-[#141414] font-semibold">{userData.name}</strong>
              </div>
              <div className="flex items-center justify-between text-[#6B6760]">
                <span>Event Time</span>
                <strong className="text-[#2A2724]">{ackModal.time}</strong>
              </div>
              <div className="flex items-center justify-between text-[#6B6760]">
                <span>Gate Facility</span>
                <strong className="text-[#C93E0B]">Main Entrance Turnstile</strong>
              </div>
            </div>

            {/* ACKNOWLEDGE BUTTON */}
            <button
              type="button"
              onClick={handleCloseAckModal}
              className={`w-full py-3.5 rounded-xl font-bold text-xs tracking-wide transition-all shadow-md cursor-pointer ${
                ackModal.title.includes("DENIED")
                  ? "bg-[#D93636] hover:bg-[#E04B4B] text-white shadow-[#141414]/10"
                  : ackModal.action === "check-in"
                  ? "btn-emerald shadow-[#141414]/10"
                  : "bg-[#2F6FED] hover:bg-[#2F6FED] text-white shadow-[#141414]/10"
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
