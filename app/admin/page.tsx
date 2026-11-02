"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import { computeMembership, GYM_PLANS } from "@/lib/membershipUtils";
import {
  IconDumbbell,
  IconShield,
  IconUsers,
  IconUser,
  IconCheck,
  IconX,
  IconCalendar,
  IconCreditCard,
  IconTrendingUp,
  IconAlertCircle,
  IconRefresh,
  IconLogOut,
  IconPlus,
  IconSearch,
  IconQrCode,
  IconCamera,
  IconClock,
} from "@/lib/svgIcons";

export default function AdminPortal() {
  const router = useRouter();

  // Auth States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

  // Restore session from sessionStorage if available
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("admin_authenticated");
      if (stored === "true") {
        setIsAuthenticated(true);
      }
    }
  }, []);

  // Tabs
  const [activeTab, setActiveTab] = useState<"overview" | "attendance" | "members" | "trainers_pending" | "trainers_approved" | "expenses">("overview");
  const [memberFilter, setMemberFilter] = useState<"ALL" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseReason, setExpenseReason] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  const [renewModalMember, setRenewModalMember] = useState<any>(null);
  const [renewMonths, setRenewMonths] = useState<number>(1);
  const [renewPlanName, setRenewPlanName] = useState("Monthly Standard");
  const [renewAmount, setRenewAmount] = useState(2500);
  const [renewing, setRenewing] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Reception Desk Scanner States & Scan Lock
  const [showReceptionScanner, setShowReceptionScanner] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerFeedback, setScannerFeedback] = useState<{
    type: "success" | "error" | "info";
    title: string;
    message: string;
    user?: any;
    action?: "check-in" | "check-out";
  } | null>(null);
  const [scanAckModal, setScanAckModal] = useState<{
    show: boolean;
    action: "check-in" | "check-out";
    title: string;
    message: string;
    user?: any;
    time: string;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualScanInput, setManualScanInput] = useState("");
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const adminScanLockRef = useRef<boolean>(false);
  const lastScannedQrRef = useRef<{ code: string; timestamp: number }>({ code: "", timestamp: 0 });

  // Gate Entrance Poster Modal States
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [entrancePosterQr, setEntrancePosterQr] = useState<string>("");

  // Data States
  const [membersList, setMembersList] = useState<any[]>([]);
  const [pendingTrainers, setPendingTrainers] = useState<any[]>([]);
  const [approvedTrainers, setApprovedTrainers] = useState<any[]>([]);
  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (creds.username === "admin" && creds.password === "boss123") {
      setIsAuthenticated(true);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("admin_authenticated", "true");
      }
      setAuthError("");
    } else {
      setAuthError("Invalid credentials. Please verify username and password.");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("admin_authenticated");
    }
  };

  // Generate Official Entrance Poster QR
  useEffect(() => {
    QRCode.toDataURL(
      JSON.stringify({
        gymId: "ICONIC_GYM_KARNAL_ENTRANCE",
        facility: "Iconic Gym Karnal - Entrance Gate",
        action: "check-in",
      }),
      { width: 400, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } }
    ).then((url) => setEntrancePosterQr(url));
  }, []);

  // Reception Desk Scanner Lifecycle
  const startReceptionScanner = async () => {
    setScannerFeedback(null);
    setScannerActive(false);

    try {
      const element = document.getElementById("admin-reception-scanner");
      if (!element) return;

      if (scannerInstanceRef.current) {
        try {
          if (scannerInstanceRef.current.isScanning) {
            await scannerInstanceRef.current.stop();
          }
          scannerInstanceRef.current.clear();
        } catch (e) {}
        scannerInstanceRef.current = null;
      }

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setScannerFeedback({
          type: "error",
          title: "Camera Not Available on Insecure Connection",
          message: "Live video stream requires HTTPS or localhost. You can use 'Scan with Phone Camera' or the Instant Member Search below!",
        });
        return;
      }

      // Explicitly trigger the browser's native camera permission prompt
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
          setScannerFeedback({
            type: "error",
            title: "Camera Permission Denied",
            message: "Camera permission was blocked. Click the lock/camera icon in your address bar to Allow, or use 'Scan with Phone Camera' below.",
          });
          return;
        }
        try {
          permStream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (e) {
          throw permErr;
        }
      }

      if (permStream) {
        permStream.getTracks().forEach((t) => t.stop());
      }

      const html5QrCode = new Html5Qrcode("admin-reception-scanner");
      scannerInstanceRef.current = html5QrCode;

      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          (decodedText) => {
            handleExecuteScan(decodedText);
          },
          () => {}
        );
      } catch (startErr: any) {
        // Fallback to front webcam
        await html5QrCode.start(
          { facingMode: "user" },
          { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          (decodedText) => {
            handleExecuteScan(decodedText);
          },
          () => {}
        );
      }

      setScannerActive(true);
    } catch (err: any) {
      console.error("Admin camera error:", err);
      setScannerActive(false);
      const isPerm =
        err.name === "NotAllowedError" ||
        err.message?.toLowerCase().includes("permission") ||
        err.message?.toLowerCase().includes("denied");

      setScannerFeedback({
        type: "error",
        title: isPerm ? "Camera Permission Denied" : "Camera Activation Failed",
        message: isPerm
          ? "Camera permission was denied in your browser. Click the camera icon or lock icon in your browser's address bar to allow camera access, then click 'Retry Camera Permission' below."
          : err.message || "Failed to initialize webcam on this device. You can use the instant Member Search below.",
      });
    }
  };

  const processAdminFile = async (file: File) => {
    if (scanning) return;
    if (!file.type.startsWith("image/")) {
      alert("Please provide a valid image file.");
      return;
    }
    setScanning(true);
    setScannerFeedback({
      type: "info",
      title: "Scanning Captured Photo...",
      message: "Decoding QR code from camera snapshot...",
    });
    try {
      const html5QrCode = new Html5Qrcode("admin-hidden-file-reader");
      const result = await html5QrCode.scanFileV2(file, true);
      html5QrCode.clear();
      await handleExecuteScan(result.decodedText);
    } catch {
      setScannerFeedback({
        type: "error",
        title: "No QR Code Detected",
        message: "No valid QR pass was found in the captured photo. Please align the QR code clearly and try again.",
      });
      setScanning(false);
    }
  };

  const stopReceptionScanner = async () => {
    if (scannerInstanceRef.current) {
      try {
        if (scannerInstanceRef.current.isScanning) {
          await scannerInstanceRef.current.stop();
        }
        scannerInstanceRef.current.clear();
      } catch (e) {}
      scannerInstanceRef.current = null;
    }
    setScannerActive(false);
  };

  useEffect(() => {
    if (showReceptionScanner) {
      const timer = setTimeout(() => {
        startReceptionScanner();
      }, 200);
      return () => {
        clearTimeout(timer);
        stopReceptionScanner();
      };
    } else {
      stopReceptionScanner();
    }
  }, [showReceptionScanner]);

  const handleExecuteScan = async (qrData: string) => {
    if (scanning || adminScanLockRef.current) return;

    const trimmed = qrData.trim();
    const now = Date.now();

    // Prevent re-scanning the exact same code within 12 seconds
    if (
      lastScannedQrRef.current.code === trimmed &&
      now - lastScannedQrRef.current.timestamp < 12000
    ) {
      return;
    }

    // Minimum 3.5 second cooldown between ANY scan
    if (now - lastScannedQrRef.current.timestamp < 3500) {
      return;
    }

    lastScannedQrRef.current = { code: trimmed, timestamp: now };
    adminScanLockRef.current = true; // Lock immediately to stop rapid loop

    // Pause video scanner frame so camera freezes on the scanned pass
    if (scannerInstanceRef.current) {
      try {
        if (scannerInstanceRef.current.isScanning) {
          scannerInstanceRef.current.pause(true);
        }
      } catch (e) {}
    }

    setScanning(true);
    setScannerFeedback({
      type: "info",
      title: "Verifying Gate Access...",
      message: "Checking member identity and subscription status...",
    });

    try {
      const res = await fetch("/api/admin/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrData: trimmed }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setScannerFeedback({
          type: "error",
          title: "Access Denied",
          message: data.error || "Invalid pass or expired membership.",
          user: data.user,
        });

        setScanAckModal({
          show: true,
          action: "check-in",
          title: "ACCESS DENIED",
          message: data.error || "Invalid pass or expired membership. Please verify subscription.",
          user: data.user,
          time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        });
      } else {
        const actionType = data.action === "check-in" ? "check-in" : "check-out";
        setScannerFeedback({
          type: "success",
          title: data.action === "check-in" ? "Check-In Approved" : "Check-Out Approved",
          message: data.message,
          user: data.user,
          action: actionType,
        });

        // Trigger Reception Acknowledgment Modal
        setScanAckModal({
          show: true,
          action: actionType,
          title: actionType === "check-in" ? "CHECK-IN APPROVED" : "CHECK-OUT RECORDED",
          message: data.message,
          user: data.user,
          time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        });

        // Auto-refresh the live counters and roster
        fetchRealData();
      }
    } catch (e: any) {
      setScannerFeedback({
        type: "error",
        title: "Scan Processing Error",
        message: e.message || "Failed to communicate with gate server.",
      });

      setScanAckModal({
        show: true,
        action: "check-in",
        title: "SCAN PROCESSING ERROR",
        message: e.message || "Failed to communicate with gate server.",
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      });
    } finally {
      setScanning(false);
    }
  };

  const handleCloseScanAckModal = () => {
    setScanAckModal(null);
    setScannerFeedback(null);

    // Release scan lock after delay and resume camera
    setTimeout(() => {
      adminScanLockRef.current = false;
      if (scannerInstanceRef.current) {
        try {
          scannerInstanceRef.current.resume();
        } catch (e) {}
      }
    }, 1500);
  };

  const handleDirectCheckToggle = async (userId: string, currentStatus: string) => {
    try {
      setActionLoading(`status-${userId}`);
      const nextAction = currentStatus === "IN" ? "check-out" : "check-in";
      const res = await fetch("/api/admin/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrData: userId, forcedAction: nextAction }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to update attendance status");
      } else {
        await fetchRealData();
      }
    } catch (e: any) {
      alert(e.message || "Failed to update status");
    } finally {
      setActionLoading(null);
    }
  };

  const fetchRealData = async () => {
    try {
      setLoading(true);
      setFetchError("");
      let calcRevenue = 0;

      const res = await fetch("/api/admin/data");
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || "Failed to load management data from server");
      }

      const users: any[] = result.users || [];
      const members: any[] = [];
      const pending: any[] = [];
      const approved: any[] = [];

      users.forEach((userData: any) => {
        if (userData.role === "member") {
          const membership = computeMembership(userData.plan, userData.createdAt);
          const price = parseInt(userData.plan?.price || "2500", 10);
          calcRevenue += isNaN(price) ? 2500 : price;

          members.push({
            id: userData.id,
            name: userData.name || "Member",
            phone: userData.phone || "N/A",
            email: userData.email || "",
            role: "member",
            membership,
            plan: userData.plan,
            createdAt: userData.createdAt,
            assignedTrainer: userData.assignedTrainer || null,
            totalSessions: userData.totalSessions || userData.attendance?.attended || 0,
            currentStatus: userData.currentStatus || "OUT",
          });
        } else if (userData.role === "trainer") {
          const status = userData.status || (userData.totalSessions > 0 ? "approved" : "pending");

          const trainerItem = {
            id: userData.id,
            name: userData.name || "Trainer",
            phone: userData.phone || "N/A",
            email: userData.email || "",
            specialization: userData.specialization || "General Fitness",
            experience: userData.experience || "Not Provided",
            status,
            dutyStatus: userData.currentStatus || "OUT",
            totalSessions: userData.totalSessions || 0,
            date: userData.requestedAt
              ? new Date(userData.requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
              : userData.createdAt
              ? new Date(userData.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
              : "Recent",
          };

          if (status === "pending") {
            pending.push(trainerItem);
          } else if (status === "approved") {
            approved.push(trainerItem);
          }
        }
      });

      setMembersList(members);
      setPendingTrainers(pending);
      setApprovedTrainers(approved);
      setTotalRevenue(calcRevenue);

      // Attendance logs from server
      setAttendanceLogs(result.logs || []);

      // Expenses from server
      const expenses = result.expenses || [];
      let calcExpense = 0;
      expenses.forEach((exp: any) => {
        const amt = parseFloat(exp.amount || "0");
        calcExpense += isNaN(amt) ? 0 : amt;
      });
      setExpensesList(expenses);
      setTotalExpense(calcExpense);
    } catch (err: any) {
      console.error("Fetch data error:", err);
      setFetchError(err.message || "Failed to load management records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchRealData();
    }
  }, [isAuthenticated]);

  const handleTrainerApproval = async (trainerUid: string, action: "approve" | "reject" | "revoke") => {
    setActionLoading(trainerUid);
    try {
      const res = await fetch("/api/admin/trainer-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainerUid, action }),
      });
      const data = await res.json();

      if (res.ok) {
        await fetchRealData();
      } else {
        alert(data.error || "Action failed");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: expenseReason.trim(),
          amount: expenseAmount.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save expense record");
      }

      setShowExpenseModal(false);
      setExpenseReason("");
      setExpenseAmount("");
      await fetchRealData();
    } catch (err: any) {
      console.error("Error adding expense:", err);
      alert("Failed to save expense record: " + (err.message || "Unknown error"));
    }
  };

  const openRenewModal = (member: any) => {
    setRenewModalMember(member);
    setRenewMonths(1);
    setRenewPlanName("Monthly Standard");
    setRenewAmount(2500);
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewModalMember) return;
    setRenewing(true);
    try {
      const res = await fetch("/api/admin/renew-membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberUid: renewModalMember.id,
          months: renewMonths,
          planName: renewPlanName,
          amountPaid: renewAmount,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setRenewModalMember(null);
        await fetchRealData();
      } else {
        alert(data.error || "Failed to renew membership");
      }
    } catch (e: any) {
      alert("Error renewing membership: " + e.message);
    } finally {
      setRenewing(false);
    }
  };

  const handleMigrateTrainers = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/admin/migrate-trainers", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Database synchronization complete");
        await fetchRealData();
      } else {
        alert(data.error || "Sync failed");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Filtered members
  const filteredMembers = membersList.filter((m) => {
    const matchesFilter =
      memberFilter === "ALL" ? true : m.membership.status === memberFilter;
    const matchesSearch =
      searchQuery.trim() === ""
        ? true
        : m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.phone.includes(searchQuery) ||
          m.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Active vs Expired count
  const activeCount = membersList.filter((m) => m.membership.status === "ACTIVE").length;
  const expiringSoonCount = membersList.filter((m) => m.membership.status === "EXPIRING_SOON").length;
  const expiredCount = membersList.filter((m) => m.membership.status === "EXPIRED").length;

  // LOGIN SCREEN
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center p-4">
        <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-8 w-full max-w-md shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white mx-auto shadow-lg shadow-amber-500/20">
              <IconShield size={24} />
            </div>
            <h2 className="text-2xl font-extrabold text-white">Iconic Gym ERP</h2>
            <p className="text-xs text-slate-400">Owner & Administrator Management Terminal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1.5">
                Admin Username
              </label>
              <input
                type="text"
                value={creds.username}
                onChange={(e) => setCreds({ ...creds, username: e.target.value })}
                placeholder="admin"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={creds.password}
                onChange={(e) => setCreds({ ...creds, password: e.target.value })}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                required
              />
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <IconAlertCircle size={16} />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-amber-500/20"
            >
              Sign In to ERP
            </button>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Return to Member Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      <div id="admin-hidden-file-reader" style={{ display: "none" }} />
      {/* TOP HEADER */}
      <header className="border-b border-slate-800 bg-[#0f172a]/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <IconShield size={22} />
            </div>
            <div>
              <span className="font-extrabold tracking-wider text-base uppercase text-white">Iconic Gym Karnal</span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20">
                ERP Admin
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleMigrateTrainers}
              disabled={isSyncing}
              className="hidden sm:flex px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Synchronize legacy records into unified users collection"
            >
              <IconRefresh size={14} className={isSyncing ? "animate-spin" : ""} />
              <span>{isSyncing ? "Syncing..." : "Sync DB"}</span>
            </button>

            <button
              onClick={() => router.push("/")}
              className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors"
            >
              User Portal
            </button>

            <button
              onClick={handleLogout}
              className="p-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Sign Out"
            >
              <IconLogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex-1 flex flex-col gap-6">
        {/* PENDING TRAINER ALERT BANNER */}
        {pendingTrainers.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <IconAlertCircle size={22} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-300">
                  {pendingTrainers.length} Trainer Application(s) Awaiting Review
                </h4>
                <p className="text-xs text-amber-200/70 mt-0.5">
                  Held in pending gate to prevent unauthorized access to trainer dashboards.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab("trainers_pending")}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all self-start sm:self-auto shadow-md shadow-amber-500/20"
            >
              Review Applications
            </button>
          </div>
        )}

        {/* TABS HEADER */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 self-start">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "overview"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Financial Overview
          </button>
          <button
            onClick={() => setActiveTab("attendance")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === "attendance"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>Live Attendance</span>
            {membersList.filter((m) => m.currentStatus === "IN").length +
              approvedTrainers.filter((t) => t.dutyStatus === "IN").length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-slate-950 animate-pulse">
                {membersList.filter((m) => m.currentStatus === "IN").length +
                  approvedTrainers.filter((t) => t.dutyStatus === "IN").length}{" "}
                Inside
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "members"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Members ({membersList.length})
          </button>

          <button
            onClick={() => setActiveTab("trainers_pending")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === "trainers_pending"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>Trainer Approvals</span>
            {pendingTrainers.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                {pendingTrainers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("trainers_approved")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "trainers_approved"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Approved Staff ({approvedTrainers.length})
          </button>
          <button
            onClick={() => setActiveTab("expenses")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "expenses"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Expenses Ledger
          </button>
        </div>

        {/* TAB 1: FINANCIAL OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 space-y-2">
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Total Membership Revenue
                </span>
                <p className="text-3xl font-extrabold text-emerald-400">
                  ₹{totalRevenue.toLocaleString()}
                </p>
                <p className="text-xs text-slate-400">
                  Across {membersList.length} enrolled gym members
                </p>
              </div>

              <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 space-y-2">
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Operational Expenses
                </span>
                <p className="text-3xl font-extrabold text-rose-400">
                  ₹{totalExpense.toLocaleString()}
                </p>
                <p className="text-xs text-slate-400">
                  Recorded utility and maintenance costs
                </p>
              </div>

              <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 space-y-2">
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Net Operating Profit
                </span>
                <p
                  className={`text-3xl font-extrabold ${
                    totalRevenue - totalExpense >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  ₹{(totalRevenue - totalExpense).toLocaleString()}
                </p>
                <p className="text-xs text-slate-400">Net operating balance</p>
              </div>
            </div>

            {/* MEMBERSHIP HEALTH BREAKDOWN */}
            <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 space-y-4">
              <h3 className="text-base font-bold text-white">Membership Health Breakdown</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div
                  onClick={() => {
                    setMemberFilter("ACTIVE");
                    setActiveTab("members");
                  }}
                  className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 cursor-pointer hover:border-emerald-500/50 transition-all"
                >
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                    Active Members
                  </span>
                  <p className="text-2xl font-extrabold text-white mt-1">{activeCount}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Facility access enabled</p>
                </div>

                <div
                  onClick={() => {
                    setMemberFilter("EXPIRING_SOON");
                    setActiveTab("members");
                  }}
                  className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 cursor-pointer hover:border-amber-500/50 transition-all"
                >
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    Expiring Soon (&le; 7 Days)
                  </span>
                  <p className="text-2xl font-extrabold text-white mt-1">{expiringSoonCount}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Due for renewal</p>
                </div>

                <div
                  onClick={() => {
                    setMemberFilter("EXPIRED");
                    setActiveTab("members");
                  }}
                  className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 cursor-pointer hover:border-rose-500/50 transition-all"
                >
                  <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                    Expired Members
                  </span>
                  <p className="text-2xl font-extrabold text-white mt-1">{expiredCount}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Check-in access blocked</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: LIVE ATTENDANCE & LOGS */}
        {activeTab === "attendance" && (
          <div className="space-y-6">
            {/* GATE ACTION CONTROLS & TERMINAL */}
            <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowReceptionScanner(!showReceptionScanner)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md ${
                      showReceptionScanner
                        ? "bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20"
                        : "btn-emerald"
                    }`}
                  >
                    <IconCamera size={16} />
                    <span>{showReceptionScanner ? "Close Gate Scanner" : "Open Reception Gate Scanner"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => document.getElementById("admin-phone-camera-input")?.click()}
                    className="btn-slate text-xs py-2.5 px-4 flex items-center gap-2 cursor-pointer"
                  >
                    <IconCamera size={16} />
                    <span>Scan with Phone Camera</span>
                  </button>
                  <input
                    id="admin-phone-camera-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && processAdminFile(e.target.files[0])}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPosterModal(true)}
                    className="btn-slate text-xs py-2.5 px-4 flex items-center gap-2"
                  >
                    <IconQrCode size={16} />
                    <span>Print Entrance QR Poster</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Front Desk Reader Ready</span>
                </div>
              </div>

              {/* RECEPTION CAMERA SCANNER VIEWPORT */}
              {showReceptionScanner && (
                <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase font-extrabold tracking-wider text-teal-400">
                        Front Desk Live Scanner
                      </span>
                      <span className="text-[11px] text-slate-400">Point at member&apos;s &ldquo;My QR Pass&rdquo;</span>
                    </div>

                    <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 min-h-[260px] flex items-center justify-center shadow-inner">
                      <div id="admin-reception-scanner" className="w-full" style={{ opacity: scanning ? 0.3 : 1 }} />
                      {!scannerActive && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-slate-400 p-4 text-center">
                          <IconRefresh className="animate-spin text-emerald-400" size={24} />
                          <p className="text-xs font-semibold text-slate-200">Activating Reception Camera...</p>
                          <p className="text-[11px] text-slate-400">Please allow camera permissions if prompted.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SCANNER FEEDBACK & MANUAL ENTRY */}
                  <div className="space-y-4">
                    <span className="text-xs uppercase font-extrabold tracking-wider text-slate-400 block">
                      Scan Status & Verification
                    </span>

                    {scannerFeedback ? (
                      <div
                        className={`p-4 rounded-xl border space-y-2 ${
                          scannerFeedback.type === "success"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : scannerFeedback.type === "error"
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                            : "bg-slate-900 border-slate-700 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {scannerFeedback.type === "success" && <IconCheck size={18} className="text-emerald-400 shrink-0" />}
                          {scannerFeedback.type === "error" && <IconAlertCircle size={18} className="text-rose-400 shrink-0" />}
                          {scannerFeedback.type === "info" && <IconRefresh size={18} className="animate-spin text-teal-400 shrink-0" />}
                          <strong className="text-sm font-bold">{scannerFeedback.title}</strong>
                        </div>
                        <p className="text-xs leading-relaxed">{scannerFeedback.message}</p>

                        {scannerFeedback.type === "error" && scannerFeedback.title.includes("Camera") && (
                          <button
                            type="button"
                            onClick={startReceptionScanner}
                            className="mt-3 w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-amber-500/20"
                          >
                            Retry Camera Permission
                          </button>
                        )}

                        {scannerFeedback.user && (
                          <div className="pt-2 border-t border-slate-800/80 text-xs space-y-1">
                            <p><strong>Name:</strong> {scannerFeedback.user.name}</p>
                            {scannerFeedback.user.membership && (
                              <p>
                                <strong>Plan:</strong> {scannerFeedback.user.membership.planName} · Status:{" "}
                                <span className={scannerFeedback.user.membership.status === "ACTIVE" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                  {scannerFeedback.user.membership.status}
                                </span>
                              </p>
                            )}
                            {scannerFeedback.user.membership?.status === "EXPIRED" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRenewModalMember(scannerFeedback.user);
                                  setShowReceptionScanner(false);
                                }}
                                className="mt-2 w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg uppercase tracking-wider transition-all"
                              >
                                Renew Member Subscription Now
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 leading-relaxed">
                        Ready to scan. Ask the member to open <strong>&ldquo;My QR Pass&rdquo;</strong> on their phone and show it to this camera. The system will verify their membership status and log check-in/check-out automatically.
                      </div>
                    )}

                    {/* MANUAL CHECK-IN & INSTANT MEMBER SEARCH */}
                    <div className="pt-3 border-t border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300 block">
                          Instant Member Search & Check-In
                        </span>
                        <span className="text-[10px] text-slate-400">Search name, phone, or ID</span>
                      </div>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (manualScanInput.trim()) {
                            handleExecuteScan(manualScanInput.trim());
                            setManualScanInput("");
                          }
                        }}
                        className="space-y-2"
                      >
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Type Member Name, Phone (+91...), Email, or UID..."
                            value={manualScanInput}
                            onChange={(e) => setManualScanInput(e.target.value)}
                            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            type="submit"
                            disabled={!manualScanInput.trim() || scanning}
                            className="px-3.5 py-2 btn-emerald text-xs rounded-xl disabled:opacity-40 cursor-pointer"
                          >
                            {scanning ? "..." : "Check In/Out"}
                          </button>
                        </div>

                        {/* INSTANT LIVE AUTOCOMPLETE SUGGESTIONS */}
                        {manualScanInput.trim().length >= 2 && (
                          <div className="max-h-48 overflow-y-auto space-y-1 bg-slate-950/90 p-2 rounded-xl border border-slate-800 shadow-xl">
                            {membersList
                              .filter((m) =>
                                (m.name || "").toLowerCase().includes(manualScanInput.toLowerCase()) ||
                                (m.phone || "").includes(manualScanInput) ||
                                (m.email || "").toLowerCase().includes(manualScanInput.toLowerCase())
                              )
                              .slice(0, 5)
                              .map((m) => (
                                <div
                                  key={m.id}
                                  className="p-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 flex items-center justify-between text-xs transition-colors"
                                >
                                  <div>
                                    <strong className="text-white block">{m.name}</strong>
                                    <span className="text-[10px] text-slate-400">
                                      {m.phone} · {m.membership?.planName} · Status:{" "}
                                      <span className={m.membership?.status === "ACTIVE" ? "text-emerald-400" : "text-rose-400"}>
                                        {m.membership?.status}
                                      </span>
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={scanning}
                                    onClick={() => {
                                      handleExecuteScan(m.id);
                                      setManualScanInput("");
                                    }}
                                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all cursor-pointer ${
                                      m.currentStatus === "IN"
                                        ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white"
                                        : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-white"
                                    }`}
                                  >
                                    {m.currentStatus === "IN" ? "Check Out" : "Check In"}
                                  </button>
                                </div>
                              ))}
                            {membersList.filter((m) =>
                              (m.name || "").toLowerCase().includes(manualScanInput.toLowerCase()) ||
                              (m.phone || "").includes(manualScanInput) ||
                              (m.email || "").toLowerCase().includes(manualScanInput.toLowerCase())
                            ).length === 0 && (
                              <p className="text-[11px] text-slate-500 text-center py-2">
                                No local matches. Press &ldquo;Check In/Out&rdquo; to search backend database.
                              </p>
                            )}
                          </div>
                        )}
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* LIVE FACILITY COUNTERS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                    Members Inside Now
                  </span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <p className="text-3xl font-extrabold text-emerald-400">
                  {membersList.filter((m) => m.currentStatus === "IN").length}
                </p>
                <p className="text-xs text-slate-400">
                  Actively on the gym floor
                </p>
              </div>

              <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 space-y-2">
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Coaching Staff On Duty
                </span>
                <p className="text-3xl font-extrabold text-teal-400">
                  {approvedTrainers.filter((t) => t.dutyStatus === "IN").length}
                </p>
                <p className="text-xs text-slate-400">
                  Personal trainers clocked in
                </p>
              </div>

              <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 space-y-2">
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Total Gate Logs
                </span>
                <p className="text-3xl font-extrabold text-white">
                  {attendanceLogs.length}
                </p>
                <p className="text-xs text-slate-400">
                  Turnstile check-in & check-out events
                </p>
              </div>
            </div>

            {/* CURRENTLY INSIDE ROSTER */}
            <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">Currently Inside Facility</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Live roster of individuals who have checked in through the turnstile.
                  </p>
                </div>
                <button
                  onClick={fetchRealData}
                  className="btn-slate text-xs py-1.5 px-3 flex items-center gap-1.5"
                >
                  <IconRefresh size={14} className={loading ? "animate-spin" : ""} />
                  <span>Refresh</span>
                </button>
              </div>

              {membersList.filter((m) => m.currentStatus === "IN").length === 0 &&
              approvedTrainers.filter((t) => t.dutyStatus === "IN").length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <p className="font-semibold text-slate-300">Facility Currently Empty</p>
                  <p className="text-xs text-slate-500 mt-1">
                    No members or coaching staff have active check-ins logged right now.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {membersList
                    .filter((m) => m.currentStatus === "IN")
                    .map((m) => (
                      <div
                        key={m.id}
                        className="p-3.5 rounded-xl bg-slate-900 border border-emerald-500/30 flex items-center justify-between"
                      >
                        <div>
                          <strong className="text-xs text-white block">{m.name}</strong>
                          <span className="text-[11px] text-emerald-400">Member ({m.membership.planName})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            INSIDE
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDirectCheckToggle(m.id, 'IN')}
                            disabled={actionLoading === `status-${m.id}`}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white transition-all border border-rose-500/30 cursor-pointer"
                          >
                            {actionLoading === `status-${m.id}` ? "..." : "Check Out"}
                          </button>
                        </div>
                      </div>
                    ))}

                  {approvedTrainers
                    .filter((t) => t.dutyStatus === "IN")
                    .map((t) => (
                      <div
                        key={t.id}
                        className="p-3.5 rounded-xl bg-slate-900 border border-teal-500/30 flex items-center justify-between"
                      >
                        <div>
                          <strong className="text-xs text-white block">{t.name}</strong>
                          <span className="text-[11px] text-teal-400">Coach ({t.specialization})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/30">
                            ON DUTY
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDirectCheckToggle(t.id, 'IN')}
                            disabled={actionLoading === `status-${t.id}`}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white transition-all border border-rose-500/30 cursor-pointer"
                          >
                            {actionLoading === `status-${t.id}` ? "..." : "Clock Out"}
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* MASTER GATE LOGS FEED */}
            <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">Master Gate Activity Feed</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real-time turnstile event logs recorded via QR terminals.
                  </p>
                </div>
                <span className="text-xs text-slate-400">{attendanceLogs.length} Events</span>
              </div>

              {attendanceLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <p className="font-semibold text-slate-300">No attendance activity recorded yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    When members or trainers check in/out, records appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Terminal</th>
                        <th className="py-3 px-4 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-200">
                      {attendanceLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4">
                            <strong className="text-white block">{log.userName}</strong>
                            <span className="text-[11px] text-slate-400">{log.userEmail}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                log.role === "TRAINER"
                                  ? "bg-teal-500/10 text-teal-400 border border-teal-500/30"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              }`}
                            >
                              {log.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                log.type === "CHECK-IN"
                                  ? "bg-emerald-500 text-slate-950"
                                  : "bg-slate-800 text-slate-300 border border-slate-700"
                              }`}
                            >
                              {log.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-xs">
                            {log.gymId}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300 font-medium">
                            {log.time}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MEMBERS MANAGEMENT */}
        {activeTab === "members" && (

          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden space-y-4 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">Gym Members & Subscriptions</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage memberships, renewals, and facility access permissions.
                </p>
              </div>

              {/* FILTER & SEARCH */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <IconSearch size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setMemberFilter("ALL")}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      memberFilter === "ALL" ? "bg-slate-800 text-white" : "text-slate-400"
                    }`}
                  >
                    All ({membersList.length})
                  </button>
                  <button
                    onClick={() => setMemberFilter("ACTIVE")}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      memberFilter === "ACTIVE" ? "bg-slate-800 text-emerald-400" : "text-slate-400"
                    }`}
                  >
                    Active ({activeCount})
                  </button>
                  <button
                    onClick={() => setMemberFilter("EXPIRING_SOON")}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      memberFilter === "EXPIRING_SOON" ? "bg-slate-800 text-amber-400" : "text-slate-400"
                    }`}
                  >
                    Expiring ({expiringSoonCount})
                  </button>
                  <button
                    onClick={() => setMemberFilter("EXPIRED")}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      memberFilter === "EXPIRED" ? "bg-slate-800 text-rose-400" : "text-slate-400"
                    }`}
                  >
                    Expired ({expiredCount})
                  </button>
                </div>
              </div>
            </div>

            {filteredMembers.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <IconUser size={36} className="mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-slate-300">No members match the current filter</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Member</th>
                      <th className="py-3.5 px-4">Presence</th>
                      <th className="py-3.5 px-4">Phone</th>
                      <th className="py-3.5 px-4">Plan Tier</th>
                      <th className="py-3.5 px-4">Check-Ins</th>
                      <th className="py-3.5 px-4">Valid Until</th>
                      <th className="py-3.5 px-4">Days Left</th>
                      <th className="py-3.5 px-4">Plan Status</th>
                      <th className="py-3.5 px-4">Trainer</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {filteredMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-white">{member.name}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              member.currentStatus === "IN"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : "bg-slate-800 text-slate-400 border border-slate-700"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                member.currentStatus === "IN" ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                              }`}
                            />
                            {member.currentStatus === "IN" ? "INSIDE" : "OUTSIDE"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">{member.phone}</td>
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-slate-300">{member.membership.planName}</span>
                          <span className="text-[11px] text-slate-500 block">
                            ₹{member.membership.price}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-extrabold text-white">
                          {member.totalSessions} visits
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {member.membership.endDateFormatted}
                        </td>
                        <td className="py-3.5 px-4 font-bold">
                          <span
                            className={
                              member.membership.daysRemaining <= 0
                                ? "text-rose-400"
                                : member.membership.daysRemaining <= 7
                                ? "text-amber-400"
                                : "text-emerald-400"
                            }
                          >
                            {member.membership.daysRemaining}d
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                              member.membership.status === "ACTIVE"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : member.membership.status === "EXPIRING_SOON"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {member.membership.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {member.assignedTrainer?.name || "General"}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => openRenewModal(member)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold transition-all"
                          >
                            Renew / Extend
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PENDING TRAINER APPROVALS */}
        {activeTab === "trainers_pending" && (
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Trainer Applications Awaiting Review</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                New applicants cannot log in or coach members until an administrator grants approval.
              </p>
            </div>

            {pendingTrainers.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <IconCheck size={36} className="mx-auto mb-3 text-emerald-400" />
                <p className="font-semibold text-slate-300">All trainer applications are reviewed</p>
                <p className="text-xs text-slate-500 mt-1">
                  No applicants are waiting in the approval gate.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Applicant</th>
                      <th className="py-3.5 px-4">Phone</th>
                      <th className="py-3.5 px-4">Email</th>
                      <th className="py-3.5 px-4">Specialization</th>
                      <th className="py-3.5 px-4">Experience</th>
                      <th className="py-3.5 px-4">Date Applied</th>
                      <th className="py-3.5 px-4 text-right">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {pendingTrainers.map((trainer) => (
                      <tr key={trainer.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-4 px-4 font-semibold text-white">{trainer.name}</td>
                        <td className="py-4 px-4 text-slate-400">{trainer.phone}</td>
                        <td className="py-4 px-4 text-slate-400">{trainer.email}</td>
                        <td className="py-4 px-4">
                          <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-xs">
                            {trainer.specialization}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-300">{trainer.experience}</td>
                        <td className="py-4 px-4 text-slate-400">{trainer.date}</td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleTrainerApproval(trainer.id, "approve")}
                              disabled={actionLoading === trainer.id}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-all disabled:opacity-50"
                            >
                              <IconCheck size={14} />
                              <span>{actionLoading === trainer.id ? "..." : "Approve"}</span>
                            </button>
                            <button
                              onClick={() => handleTrainerApproval(trainer.id, "reject")}
                              disabled={actionLoading === trainer.id}
                              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
                            >
                              <IconX size={14} />
                              <span>Reject</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: APPROVED STAFF */}
        {activeTab === "trainers_approved" && (
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Active Coaching & Training Staff</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Approved coaches authorized to train members and record duty shifts.
              </p>
            </div>

            {approvedTrainers.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <IconUser size={36} className="mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-slate-300">No approved trainers yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Trainer Name</th>
                      <th className="py-3.5 px-4">Phone</th>
                      <th className="py-3.5 px-4">Email</th>
                      <th className="py-3.5 px-4">Specialization</th>
                      <th className="py-3.5 px-4">Duty Status</th>
                      <th className="py-3.5 px-4">Total Shifts</th>
                      <th className="py-3.5 px-4 text-right">Revocation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {approvedTrainers.map((trainer) => (
                      <tr key={trainer.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-4 px-4 font-semibold text-white">{trainer.name}</td>
                        <td className="py-4 px-4 text-slate-400">{trainer.phone}</td>
                        <td className="py-4 px-4 text-slate-400">{trainer.email}</td>
                        <td className="py-4 px-4">{trainer.specialization}</td>
                        <td className="py-4 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                              trainer.dutyStatus === "IN"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-slate-800 text-slate-400 border border-slate-700"
                            }`}
                          >
                            {trainer.dutyStatus === "IN" ? "On Duty" : "Off Duty"}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-bold">{trainer.totalSessions}</td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => {
                              if (confirm(`Revoke trainer access for ${trainer.name}?`)) {
                                handleTrainerApproval(trainer.id, "revoke");
                              }
                            }}
                            disabled={actionLoading === trainer.id}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 text-xs font-semibold transition-all disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: EXPENSES LEDGER */}
        {activeTab === "expenses" && (
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Facility Expenses Ledger</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Track recurring maintenance, utilities, and operational costs. Total: ₹{totalExpense.toLocaleString()}
                </p>
              </div>

              <button
                onClick={() => setShowExpenseModal(true)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-md shadow-amber-500/20"
              >
                <IconPlus size={16} />
                <span>Add Expense</span>
              </button>
            </div>

            {expensesList.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <IconCreditCard size={36} className="mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-slate-300">No operational expenses recorded</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Expense Category</th>
                      <th className="py-3.5 px-4">Amount</th>
                      <th className="py-3.5 px-4">Date Recorded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {expensesList.map((exp, i) => (
                      <tr key={exp.id || i} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-white">{exp.category}</td>
                        <td className="py-3.5 px-4 font-bold text-rose-400">₹{exp.amount}</td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {exp.dateFormatted ||
                            (exp.date?.toDate
                              ? exp.date.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                              : "Recent")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RENEW MEMBERSHIP MODAL */}
      {renewModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white">Renew Membership</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Member: <strong className="text-white">{renewModalMember.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setRenewModalMember(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleRenewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider mb-2">
                  Select Plan Extension Duration
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {GYM_PLANS.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => {
                        setRenewMonths(plan.durationMonths);
                        setRenewPlanName(plan.name);
                        setRenewAmount(plan.price);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        renewMonths === plan.durationMonths
                          ? "bg-amber-500/10 border-amber-500 text-white"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <span className="block text-[11px] font-bold text-amber-400">
                        {plan.durationMonths} Mo
                      </span>
                      <span className="block text-xs font-semibold text-white mt-1">
                        ₹{plan.price}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1.5">
                  Plan Name
                </label>
                <input
                  type="text"
                  value={renewPlanName}
                  onChange={(e) => setRenewPlanName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1.5">
                  Amount Received (₹)
                </label>
                <input
                  type="number"
                  value={renewAmount}
                  onChange={(e) => setRenewAmount(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                Extension adds {renewMonths} month(s) from current expiry or today.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRenewModalMember(null)}
                  disabled={renewing}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renewing}
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {renewing ? "Extending..." : "Confirm Extension"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINTABLE ENTRANCE POSTER MODAL */}
      {showPosterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 w-full max-w-md p-6 space-y-6 shadow-2xl text-center">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs uppercase font-extrabold tracking-wider text-teal-400">
                Official Facility Asset
              </span>
              <button
                onClick={() => setShowPosterModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                Close (ESC)
              </button>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-extrabold text-white uppercase tracking-wider">
                Iconic Gym Karnal
              </h2>
              <p className="text-xs text-slate-400">
                Entrance Turnstile Check-In QR Poster
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl shadow-2xl inline-block border-4 border-emerald-500/40">
              {entrancePosterQr ? (
                <img
                  src={entrancePosterQr}
                  alt="Entrance Poster QR Code"
                  className="w-64 h-64 mx-auto block rounded-lg"
                />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center text-slate-400">
                  <IconRefresh className="animate-spin" size={32} />
                </div>
              )}
            </div>

            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed text-left space-y-1">
              <p className="font-bold text-white flex items-center gap-1.5">
                <IconCheck size={14} className="text-emerald-400" />
                <span>How to use this poster:</span>
              </p>
              <p className="text-slate-400 text-[11px]">
                1. Print this poster and tape it on the gym entrance door or turnstile gate.<br />
                2. Members open the app &rarr; Attendance &rarr; <strong>Camera Scanner</strong> to scan this code on entry.<br />
                3. The system automatically records their attendance in real time.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowPosterModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const printWin = window.open("", "_blank");
                  if (printWin && entrancePosterQr) {
                    printWin.document.write(`
                      <html>
                        <head>
                          <title>Iconic Gym Karnal - Entrance QR Poster</title>
                          <style>
                            body { font-family: sans-serif; text-align: center; padding: 40px; }
                            h1 { font-size: 28px; margin-bottom: 4px; text-transform: uppercase; }
                            h2 { font-size: 16px; color: #555; margin-bottom: 24px; font-weight: normal; }
                            img { width: 340px; height: 340px; border: 4px solid #000; border-radius: 16px; padding: 12px; }
                            p { font-size: 14px; color: #333; margin-top: 20px; font-weight: bold; }
                          </style>
                        </head>
                        <body>
                          <h1>ICONIC GYM KARNAL</h1>
                          <h2>Entrance Gate Turnstile & Check-In</h2>
                          <img src="${entrancePosterQr}" alt="QR" />
                          <p>Open the Iconic Gym App &gt; Attendance &gt; Camera Scanner to Check In</p>
                          <script>window.onload = function() { window.print(); window.close(); }<\/script>
                        </body>
                      </html>
                    `);
                    printWin.document.close();
                  }
                }}
                className="btn-emerald text-xs py-2.5 px-5 flex items-center gap-2"
              >
                <IconQrCode size={16} />
                <span>Print Poster</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEPTION GATE SCANNER ACKNOWLEDGMENT MODAL (PREVENTS RAPID LOOP) */}
      {scanAckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#0f172a] border border-slate-700/80 rounded-3xl max-w-sm w-full p-6 sm:p-7 text-center shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            {/* ANIMATED PULSING ICON */}
            <div className="flex justify-center pt-2">
              {scanAckModal.title.includes("DENIED") || scanAckModal.title.includes("ERROR") ? (
                <div className="w-20 h-20 rounded-full bg-rose-500/20 border-4 border-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/30 animate-bounce">
                  <IconAlertCircle size={44} className="text-rose-400" />
                </div>
              ) : scanAckModal.action === "check-in" ? (
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-4 border-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-pulse">
                    <IconCheck size={44} className="text-emerald-400" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
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
                  scanAckModal.title.includes("DENIED") || scanAckModal.title.includes("ERROR")
                    ? "text-rose-400"
                    : scanAckModal.action === "check-in"
                    ? "text-emerald-400"
                    : "text-cyan-400"
                }`}
              >
                {scanAckModal.title}
              </span>
              <h3 className="text-xl font-extrabold text-white">
                {scanAckModal.title.includes("DENIED")
                  ? "Access Denied"
                  : scanAckModal.action === "check-in"
                  ? "Member Checked In"
                  : "Member Checked Out"}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto pt-1">
                {scanAckModal.message}
              </p>
            </div>

            {/* MEMBER DETAILS CARD */}
            {scanAckModal.user && (
              <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-slate-800 text-xs space-y-2 text-left">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Member Name</span>
                  <strong className="text-white font-semibold">{scanAckModal.user.name || "Member"}</strong>
                </div>
                {scanAckModal.user.phone && (
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Phone</span>
                    <strong className="text-slate-200">{scanAckModal.user.phone}</strong>
                  </div>
                )}
                {scanAckModal.user.membership && (
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Plan Status</span>
                    <strong
                      className={
                        scanAckModal.user.membership.status === "ACTIVE"
                          ? "text-emerald-400 font-bold"
                          : "text-rose-400 font-bold"
                      }
                    >
                      {scanAckModal.user.membership.planName || "Plan"} · {scanAckModal.user.membership.status}
                    </strong>
                  </div>
                )}
                <div className="flex items-center justify-between text-slate-400">
                  <span>Timestamp</span>
                  <strong className="text-slate-200">{scanAckModal.time}</strong>
                </div>
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="space-y-2 pt-1">
              {scanAckModal.user?.membership?.status === "EXPIRED" && (
                <button
                  type="button"
                  onClick={() => {
                    const usr = scanAckModal.user;
                    handleCloseScanAckModal();
                    setRenewModalMember(usr);
                  }}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl uppercase tracking-wider transition-all shadow-md shadow-amber-500/25 cursor-pointer"
                >
                  Renew Subscription Now
                </button>
              )}

              <button
                type="button"
                onClick={handleCloseScanAckModal}
                className={`w-full py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg cursor-pointer ${
                  scanAckModal.title.includes("DENIED") || scanAckModal.title.includes("ERROR")
                    ? "bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/25"
                    : scanAckModal.action === "check-in"
                    ? "btn-emerald shadow-emerald-500/25"
                    : "bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/25"
                }`}
              >
                Scan Next Member (Resume Camera)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD EXPENSE MODAL */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">Record Gym Expense</h3>
              <button
                onClick={() => setShowExpenseModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1.5">
                  Category / Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g. Electricity bill, Equipment maintenance"
                  value={expenseReason}
                  onChange={(e) => setExpenseReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1.5">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 3500"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-amber-500/20"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
