"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { computeMembership, GYM_PLANS } from "@/lib/membershipUtils";
import {
  IconDumbbell,
  IconUser,
  IconCalendar,
  IconClock,
  IconQrCode,
  IconLogOut,
  IconCheck,
  IconAlertCircle,
  IconStar,
  IconCreditCard,
  IconRefresh,
  IconShield,
  IconTrendingUp,
} from "@/lib/svgIcons";

export default function UserPortal() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "attendance" | "profile">("overview");
  const [loading, setLoading] = useState(true);
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewSuccess, setRenewSuccess] = useState<string | null>(null);
  const [attendedDates, setAttendedDates] = useState<number[]>([]);
  const [activeFloorCount, setActiveFloorCount] = useState<number>(0);

  const [userData, setUserData] = useState<{
    uid: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    currentStatus: "IN" | "OUT";
    plan: any;
    createdAt: any;
    assignedTrainer: any;
    rating: number;
    trainerNotes?: string;
    attendanceCount: number;
  }>({
    uid: "",
    name: "Member",
    email: "",
    phone: "",
    role: "member",
    currentStatus: "OUT",
    plan: null,
    createdAt: null,
    assignedTrainer: null,
    rating: 0,
    trainerNotes: "",
    attendanceCount: 0,
  });

  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/");
        return;
      }

      try {
        const userRef = doc(db, "users", currentUser.uid);
        unsubscribeDoc = onSnapshot(userRef, (snap) => {
          if (!snap.exists()) {
            setUserData({
              uid: currentUser.uid,
              name: currentUser.displayName || "Valued Member",
              email: currentUser.email || "",
              phone: "Not Provided",
              role: "member",
              currentStatus: "OUT",
              plan: {
                name: "Monthly Standard",
                tier: "Standard",
                price: "2500",
                durationMonths: 1,
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                daysLeft: 30,
              },
              createdAt: new Date().toISOString(),
              assignedTrainer: null,
              rating: 5,
              trainerNotes: "Welcome to AURA Athletic Club! Focus on consistency and proper form.",
              attendanceCount: 1,
            });
            setLoading(false);
            return;
          }

          const data = snap.data();

          // Role guard
          if (data.role === "trainer") {
            router.push("/trainer/dashboard");
            return;
          } else if (data.role === "admin") {
            router.push("/admin");
            return;
          }

          const attended =
            data.attendance?.attended ??
            data["attendance.attended"] ??
            data.totalSessions ??
            0;

          setUserData({
            uid: currentUser.uid,
            name: data.name || currentUser.displayName || "Valued Member",
            email: data.email || currentUser.email || "",
            phone: data.phone || "Not Provided",
            role: data.role || "member",
            currentStatus: data.currentStatus === "IN" ? "IN" : "OUT",
            plan: data.plan || null,
            createdAt: data.createdAt || null,
            assignedTrainer: data.assignedTrainer || null,
            rating: typeof data.rating === "number" ? data.rating : 0,
            trainerNotes: data.trainerNotes || data.message || "",
            attendanceCount: Number(attended),
          });
          setLoading(false);
        });
      } catch (err) {
        console.error("Dashboard error:", err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  const handleRenewPlan = async (months: number, planName: string, price: number) => {
    setRenewing(true);
    setRenewSuccess(null);
    try {
      const res = await fetch("/api/admin/renew-membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberUid: userData.uid,
          months,
          planName,
          amountPaid: price,
        }),
      });

      const result = await res.json();
      if (res.ok) {
        setRenewSuccess(`Membership extended successfully by ${months} month(s).`);
        setTimeout(() => {
          setRenewModalOpen(false);
          setRenewSuccess(null);
        }, 1800);
      } else {
        alert(result.error || "Failed to renew membership");
      }
    } catch (e: any) {
      alert("Error renewing membership: " + e.message);
    } finally {
      setRenewing(false);
    }
  };

  // Load real attendance logs and live floor traffic via server API (bypasses client security permission restrictions)
  useEffect(() => {
    if (!userData.uid) return;

    let isMounted = true;
    const fetchAttendanceData = async () => {
      try {
        const res = await fetch(`/api/attendance?uid=${encodeURIComponent(userData.uid)}`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (Array.isArray(data.attendedDates)) {
            setAttendedDates(data.attendedDates);
          }
          if (typeof data.activeFloorCount === "number") {
            setActiveFloorCount(data.activeFloorCount);
          }
        }
      } catch (e) {
        console.error("Error loading attendance data from server:", e);
      }
    };

    fetchAttendanceData();
    return () => {
      isMounted = false;
    };
  }, [userData.uid, userData.currentStatus]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center text-[#4A4640]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 flex items-center justify-center text-[#C93E0B] animate-pulse">
            <IconDumbbell size={28} />
          </div>
          <div className="flex items-center gap-2">
            <IconRefresh className="animate-spin text-[#C93E0B]" size={18} />
            <p className="text-sm font-semibold tracking-wide text-[#4A4640]">
              Loading Your Member Hub...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const membership = computeMembership(userData.plan, userData.createdAt);

  // Calculate percentage of membership period remaining
  const totalDays = Math.max(
    1,
    Math.ceil((membership.endDate.getTime() - membership.startDate.getTime()) / (1000 * 60 * 60 * 24))
  );
  const progressPercent = Math.min(100, Math.round((membership.daysRemaining / totalDays) * 100));

  // Compute REAL 7-day activity for current week (Mon-Sun)
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon, 1=Tue, ..., 6=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);
  monday.setHours(0, 0, 0, 0);

  const weekDayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekDays = weekDayNames.map((name, idx) => {
    const dayStart = new Date(monday);
    dayStart.setDate(monday.getDate() + idx);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    const isToday = now.toDateString() === dayStart.toDateString();
    const hasLog = attendedDates.some(
      (ts) => ts >= dayStart.getTime() && ts < dayEnd.getTime()
    );
    // Real check ONLY if member has attended on that calendar date or is checked in today
    const isAttended =
      (userData.attendanceCount > 0 && hasLog) ||
      (isToday && userData.currentStatus === "IN");

    return {
      day: name,
      attended: isAttended,
      isToday,
      isFuture: dayStart > now,
    };
  });

  // Calculate real consecutive streak
  let realStreak = 0;
  if (userData.attendanceCount > 0) {
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    const checkedInToday = weekDays.find((d) => d.isToday)?.attended;
    if (!checkedInToday) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
      const start = checkDate.getTime();
      const end = start + 24 * 60 * 60 * 1000;
      const attendedOnDate = attendedDates.some((ts) => ts >= start && ts < end);
      if (attendedOnDate) {
        realStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Live floor traffic label
  const trafficLabel =
    activeFloorCount > 15
      ? "Peak Traffic"
      : activeFloorCount > 4
      ? "Moderate"
      : activeFloorCount > 0
      ? `${activeFloorCount} On Floor`
      : "Light / Quiet";

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#141414] flex flex-col selection:bg-[#FF5A1F] selection:text-[#141414]">
      {/* ==================== TOP NAVIGATION ==================== */}
      <header className="border-b border-[#ECE7E0]/80 bg-white/90 backdrop-blur-xl sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* LOGO */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF5A1F] via-[#FF5A1F] to-[#FFFFFF] flex items-center justify-center text-[#141414] shadow-md shadow-[#141414]/10 ring-1 ring-[#FF5A1F]/30">
              <IconDumbbell size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-wide text-base text-[#141414] block leading-tight">
                  AURA
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wide bg-[#FF5A1F]/10 text-[#C93E0B] border border-[#FF5A1F]/20">
                  Member
                </span>
              </div>
              <span className="text-[11px] text-[#6B6760] font-medium">Athletic Club</span>
            </div>
          </div>

          {/* SINGLE DEDICATED SCANNER ACTION + LOGOUT */}
          <div className="flex items-center gap-3">
            {/* THE ONLY SCANNER BUTTON ON THE PAGE */}
            <button
              onClick={() => router.push("/attendance")}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FF5A1F] to-[#FF5A1F] hover:from-[#FF7A45] hover:to-[#FF7A45] text-[#141414] font-bold text-xs tracking-wide flex items-center gap-2 shadow-md shadow-[#141414]/10 transition-all hover:scale-[1.02] cursor-pointer"
              title="Open QR scanner for entrance check-in & exit"
            >
              <IconQrCode size={18} />
              <span>Gate Pass / Scan</span>
            </button>

            <button
              onClick={handleLogout}
              className="p-2.5 rounded-xl border border-[#ECE7E0] bg-white/80 hover:bg-[#F1EDE7] text-[#6B6760] hover:text-[#141414] transition-colors cursor-pointer"
              title="Sign Out"
            >
              <IconLogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ==================== MAIN CONTAINER ==================== */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex-1 flex flex-col gap-8">
        {/* HERO GREETING & LIVE STATUS */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-bold text-[#141414] tracking-tight font-display">
                Welcome back, {userData.name}
              </h1>

              {/* LIVE PRESENCE BEACON */}
              {userData.currentStatus === "IN" ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-[#1F9D55]/10 text-[#17803F] border border-[#1F9D55]/30 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#1F9D55] animate-ping" />
                  <span>On Premises (Active)</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-medium tracking-wide bg-[#F1EDE7]/80 text-[#6B6760] border border-[#E0D9CF]/80 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#A09A92]" />
                  <span>Outside Facility</span>
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm text-[#6B6760] mt-1">
              Member ID: <span className="text-[#4A4640] font-mono">{userData.uid ? userData.uid.substring(0, 10).toUpperCase() : "GUEST"}</span> · Every workout builds the future you.
            </p>
          </div>

          {/* TAB SWITCHER */}
          <div className="flex items-center gap-1 bg-white/90 p-1.5 rounded-xl border border-[#ECE7E0] self-start lg:self-auto">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "overview"
                  ? "bg-[#F1EDE7] text-[#C93E0B] shadow-sm"
                  : "text-[#6B6760] hover:text-[#2A2724]"
              }`}
            >
              Overview & Pass
            </button>
            <button
              onClick={() => setActiveTab("attendance")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "attendance"
                  ? "bg-[#F1EDE7] text-[#C93E0B] shadow-sm"
                  : "text-[#6B6760] hover:text-[#2A2724]"
              }`}
            >
              Attendance Logs
            </button>
            <button
              onClick={() => setActiveTab("profile")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "profile"
                  ? "bg-[#F1EDE7] text-[#C93E0B] shadow-sm"
                  : "text-[#6B6760] hover:text-[#2A2724]"
              }`}
            >
              Profile & Info
            </button>
          </div>
        </div>

        {/* ==================== TAB: OVERVIEW ==================== */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* TOP ROW: LUXURY DIGITAL MEMBERSHIP KEYCARD + CONSISTENCY STREAK */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* LUXURY DIGITAL GYM PASS (7 COLS) */}
              <div className="lg:col-span-7 relative rounded-2xl overflow-hidden p-7 hero-dark border border-white/10 shadow-md flex flex-col justify-between group">
                {/* AMBIENT GLOW BACKDROP */}
                <div className="hidden" />
                <div className="hidden" />

                <div className="relative z-10 space-y-6">
                  {/* CARD HEADER */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#FF5A1F] flex items-center justify-center text-[#141414] font-bold text-xs">
                        AC
                      </div>
                      <span className="text-xs font-bold tracking-wide text-white/80">
                        AURA Club Digital Pass
                      </span>
                    </div>

                    <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wide bg-[#FF5A1F] text-[#141414]">
                      {membership.tier} Tier
                    </span>
                  </div>

                  {/* PLAN NAME & STATUS */}
                  <div className="pt-2">
                    <div className="flex items-center gap-3">
                      <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight font-display">
                        {membership.planName}
                      </h2>
                    </div>
                    <p className="text-xs text-white/60 mt-1">
                      Rate: <span className="text-[#FF5A1F] font-semibold">₹{membership.price}</span> · Tier Privileges Active
                    </p>
                  </div>

                  {/* PROGRESS BAR & DAYS COUNTDOWN */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/60 font-medium">Subscription Lifecycle</span>
                      <span className="text-[#FF5A1F] font-bold">{membership.daysRemaining} Days Left</span>
                    </div>

                    <div className="w-full bg-white/15 h-2.5 rounded-full overflow-hidden p-0.5">
                      <div
                        className="bg-[#FF5A1F] h-full rounded-full transition-all duration-700"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-white/50 pt-1">
                      <span>Started: {membership.startDateFormatted}</span>
                      <span>Expires: {membership.endDateFormatted}</span>
                    </div>
                  </div>
                </div>

                {/* CARD FOOTER & RENEW ACTION */}
                <div className="relative z-10 pt-6 mt-6 border-t border-white/10 flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#34C26F] animate-pulse" />
                    <span className="text-xs text-white/85 font-semibold">
                      {membership.status === "ACTIVE"
                        ? "Gate Turnstile Clearance Granted"
                        : "Renewal Required"}
                    </span>
                  </div>

                  <button
                    onClick={() => setRenewModalOpen(true)}
                    className="px-5 py-2.5 rounded-xl bg-[#FF5A1F] hover:bg-[#FF7A45] text-[#141414] font-bold text-xs tracking-wide transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <IconCreditCard size={15} />
                    <span>Renew / Extend Plan</span>
                  </button>
                </div>
              </div>

              {/* CONSISTENCY & WORKOUT STREAK TRACKER (5 COLS - REPLACED BORING AI BOX) */}
              <div className="lg:col-span-5 rounded-2xl bg-[#FFFFFF]/90 border border-[#ECE7E0]/90 p-7 flex flex-col justify-between shadow-md relative overflow-hidden">
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-[#6B6760]">
                      <IconTrendingUp size={16} className="text-[#C93E0B]" />
                      <span>Weekly Consistency</span>
                    </div>
                    {realStreak > 0 ? (
                      <span className="text-[11px] text-[#C93E0B] font-bold bg-[#FF5A1F]/10 px-2.5 py-0.5 rounded-full border border-[#FF5A1F]/20">
                        🔥 {realStreak}-Day Streak
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#6B6760] font-medium bg-[#F1EDE7]/80 px-2.5 py-0.5 rounded-full border border-[#E0D9CF]/60">
                        0-Day Streak · Check in to start
                      </span>
                    )}
                  </div>

                  {/* 7-DAY MINI CALENDAR DOTS */}
                  <div>
                    <span className="text-xs text-[#6B6760] block mb-2 font-medium">This Week’s Activity:</span>
                    <div className="grid grid-cols-7 gap-2">
                      {weekDays.map((item, idx) => (
                        <div
                          key={idx}
                          className={`flex flex-col items-center py-2.5 rounded-xl border text-center transition-all ${
                            item.attended
                              ? "bg-[#FF5A1F]/15 border-[#FF5A1F]/40 text-[#C93E0B] shadow-sm shadow-[#141414]/10"
                              : item.isToday
                              ? "bg-[#F7F4EF] border-[#FF5A1F]/30 text-[#6B6760]"
                              : "bg-[#F7F4EF] border-[#ECE7E0] text-[#7A756D]"
                          }`}
                        >
                          <span className={`text-[11px] font-bold ${item.isToday ? "text-[#C93E0B]" : ""}`}>
                            {item.day}
                          </span>
                          <span className={`text-xs mt-1 font-bold ${item.attended ? "text-[#C93E0B]" : "text-[#5C5851]"}`}>
                            {item.attended ? "✓" : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* TOTAL SESSIONS COUNTER & GYM TRAFFIC */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-3.5 rounded-2xl bg-white/80 border border-[#ECE7E0]">
                      <span className="text-[11px] font-bold tracking-wide text-[#6B6760] block">
                        Total Sessions
                      </span>
                      <p className="text-xl font-bold text-[#141414] mt-1">
                        {userData.attendanceCount} <span className="text-xs font-medium text-[#6B6760]">Visits</span>
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/80 border border-[#ECE7E0]">
                      <span className="text-[11px] font-bold tracking-wide text-[#6B6760] block">
                        Live Floor Traffic
                      </span>
                      <p className={`text-xl font-bold mt-1 ${activeFloorCount > 0 ? "text-[#C93E0B]" : "text-[#4A4640]"}`}>
                        {trafficLabel}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#ECE7E0]/80 flex items-center justify-between text-xs text-[#6B6760]">
                  <span>Peak Hours: 18:00 - 21:00</span>
                  <span className="text-[#4A4640] font-medium">Mon - Sat 06:00 - 22:00</span>
                </div>
              </div>
            </div>

            {/* BOTTOM ROW: COACHING HUB + QUICK PERKS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* COACHING & PERFORMANCE MEMO (7 COLS) */}
              <div className="lg:col-span-7 bg-[#FFFFFF]/90 rounded-2xl border border-[#ECE7E0]/90 p-7 flex flex-col justify-between shadow-md">
                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-[#ECE7E0]">
                    <div className="flex items-center gap-2">
                      <IconShield size={18} className="text-[#C93E0B]" />
                      <span className="text-xs font-bold tracking-wide text-[#4A4640]">
                        Assigned Coach Guidance
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[#C93E0B] bg-[#FF5A1F]/10 px-2.5 py-1 rounded-lg border border-[#FF5A1F]/20">
                      Certified Coach
                    </span>
                  </div>

                  <div className="mt-5 space-y-4">
                    {/* COACH DETAILS HEADER */}
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/80 border border-[#ECE7E0]">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF5A1F]/20 to-[#FF5A1F]/20 border border-[#FF5A1F]/30 flex items-center justify-center text-[#C93E0B] font-bold">
                          <IconUser size={22} />
                        </div>
                        <div>
                          <p className="text-base font-bold text-[#141414]">
                            {userData.assignedTrainer?.name || "General Floor Coach"}
                          </p>
                          <p className="text-xs text-[#6B6760]">
                            {userData.assignedTrainer?.specialization || "Strength & Conditioning Specialist"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[#8A6100] font-bold text-sm bg-[#E0A100]/10 px-3 py-1.5 rounded-xl border border-[#E0A100]/20">
                        <IconStar size={16} fill="currentColor" />
                        <span>{userData.rating ? `${userData.rating} / 10` : "Active"}</span>
                      </div>
                    </div>

                    {/* COACH NOTES / WORKOUT MEMO */}
                    <div className="p-4 rounded-2xl bg-[#F7F4EF]/60 border border-[#ECE7E0]/80 text-xs text-[#4A4640] leading-relaxed space-y-1.5">
                      <div className="flex items-center gap-2 text-[#6B6760] font-semibold text-[11px] tracking-wide">
                        <IconClock size={13} />
                        <span>Latest Coach Feedback</span>
                      </div>
                      <p className="italic text-[#2A2724]">
                        &ldquo;{userData.trainerNotes || "Focus on compound movements, proper warmup mobility, and hydration during your sets."}&rdquo;
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-[#ECE7E0]/80 flex items-center justify-between text-xs text-[#6B6760]">
                  <span>Direct Desk Assistance Available</span>
                  <span className="text-[#C93E0B] font-semibold">Trainer Verified Plan</span>
                </div>
              </div>

              {/* MEMBERSHIP PRIVILEGES & PASS STATS (5 COLS) */}
              <div className="lg:col-span-5 bg-[#FFFFFF]/90 rounded-2xl border border-[#ECE7E0]/90 p-7 flex flex-col justify-between shadow-md">
                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-[#ECE7E0]">
                    <span className="text-xs font-bold tracking-wide text-[#4A4640]">
                      Tier Privileges
                    </span>
                    <span className="text-xs text-[#6B6760]">Included Access</span>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div className="p-3.5 rounded-2xl bg-white/80 border border-[#ECE7E0] flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[#FF5A1F]/10 text-[#C93E0B] flex items-center justify-center font-bold text-sm">
                        ✓
                      </div>
                      <div className="text-xs">
                        <strong className="text-[#141414] block font-semibold">Cardio & Strength Zones</strong>
                        <span className="text-[#6B6760] text-[11px]">Free weights, machines & functional training area</span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/80 border border-[#ECE7E0] flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[#FF5A1F]/10 text-[#C93E0B] flex items-center justify-center font-bold text-sm">
                        ✓
                      </div>
                      <div className="text-xs">
                        <strong className="text-[#141414] block font-semibold">Turnstile Instant QR Pass</strong>
                        <span className="text-[#6B6760] text-[11px]">One-touch gate entry with your mobile pass</span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/80 border border-[#ECE7E0] flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[#FF5A1F]/10 text-[#C93E0B] flex items-center justify-center font-bold text-sm">
                        ✓
                      </div>
                      <div className="text-xs">
                        <strong className="text-[#141414] block font-semibold">Locker & Shower Facilities</strong>
                        <span className="text-[#6B6760] text-[11px]">Clean locker room with hot water showers</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-5 border-t border-[#ECE7E0]/80">
                  <button
                    onClick={() => setRenewModalOpen(true)}
                    className="w-full py-3 rounded-2xl bg-[#F7F4EF] hover:bg-[#F1EDE7] border border-[#E0D9CF]/80 hover:border-[#FF5A1F]/50 text-[#141414] font-bold text-xs tracking-wide transition-all cursor-pointer"
                  >
                    View All Membership Tiers
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB: ATTENDANCE ==================== */}
        {activeTab === "attendance" && (
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#ECE7E0]/90 p-7 sm:p-9 space-y-6 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#ECE7E0]">
              <div>
                <h2 className="text-3xl font-bold text-[#141414] tracking-tight font-display">
                  Attendance Records & Consistency
                </h2>
                <p className="text-xs sm:text-sm text-[#6B6760] mt-1">
                  Verified check-in history logged by the gate terminal.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-[#FF5A1F]/10 text-[#C93E0B] border border-[#FF5A1F]/20">
                  {userData.currentStatus === "IN" ? "Checked In Now" : "Currently Outside"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-white/90 p-6 rounded-2xl border border-[#ECE7E0]">
                <span className="text-xs font-bold tracking-wide text-[#6B6760]">
                  Completed Sessions
                </span>
                <p className="text-4xl font-bold text-[#141414] mt-2 font-display tabular-nums">
                  {userData.attendanceCount}
                </p>
                <p className="text-xs text-[#6B6760] mt-1">Lifetime verified visits</p>
              </div>

              <div className="bg-white/90 p-6 rounded-2xl border border-[#ECE7E0]">
                <span className="text-xs font-bold tracking-wide text-[#6B6760]">
                  Current Presence
                </span>
                <p
                  className={`text-4xl font-bold mt-2 font-display tabular-nums ${
                    userData.currentStatus === "IN" ? "text-[#17803F]" : "text-[#6B6760]"
                  }`}
                >
                  {userData.currentStatus === "IN" ? "INSIDE" : "OUTSIDE"}
                </p>
                <p className="text-xs text-[#6B6760] mt-1">
                  {userData.currentStatus === "IN" ? "Floor session underway" : "Turnstile logged out"}
                </p>
              </div>

              <div className="bg-white/90 p-6 rounded-2xl border border-[#ECE7E0]">
                <span className="text-xs font-bold tracking-wide text-[#6B6760]">
                  Facility Operating Hours
                </span>
                <p className="text-4xl font-bold text-[#C93E0B] mt-2 font-display tabular-nums">OPEN</p>
                <p className="text-xs text-[#6B6760] mt-1">Mon - Sat: 06:00 to 22:00</p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[#F7F4EF]/60 border border-[#ECE7E0] text-xs text-[#4A4640] flex items-center justify-between">
              <span>Gate entry is scanned automatically via your digital QR token at the front counter.</span>
            </div>
          </div>
        )}

        {/* ==================== TAB: PROFILE ==================== */}
        {activeTab === "profile" && (
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#ECE7E0]/90 p-7 sm:p-9 space-y-6 shadow-md">
            <div className="pb-6 border-b border-[#ECE7E0]">
              <h2 className="text-3xl font-bold text-[#141414] tracking-tight font-display">
                Member Profile & Registration Details
              </h2>
              <p className="text-xs sm:text-sm text-[#6B6760] mt-1">
                Your registered credentials and club membership profile.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-white/90 border border-[#ECE7E0]">
                  <span className="text-xs font-bold text-[#6B6760] tracking-wide">
                    Full Legal Name
                  </span>
                  <p className="text-lg font-bold text-[#141414] mt-1">{userData.name}</p>
                </div>

                <div className="p-5 rounded-2xl bg-white/90 border border-[#ECE7E0]">
                  <span className="text-xs font-bold text-[#6B6760] tracking-wide">
                    Contact Phone
                  </span>
                  <p className="text-lg font-bold text-[#141414] mt-1">{userData.phone}</p>
                </div>

                <div className="p-5 rounded-2xl bg-white/90 border border-[#ECE7E0]">
                  <span className="text-xs font-bold text-[#6B6760] tracking-wide">
                    Registered Email
                  </span>
                  <p className="text-lg font-bold text-[#141414] mt-1">{userData.email || "N/A"}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-white/90 border border-[#ECE7E0]">
                  <span className="text-xs font-bold text-[#6B6760] tracking-wide">
                    Assigned Coach
                  </span>
                  <p className="text-lg font-bold text-[#C93E0B] mt-1">
                    {userData.assignedTrainer?.name || "General Floor Coach"}
                  </p>
                  <p className="text-xs text-[#6B6760] mt-1">
                    Specialization: {userData.assignedTrainer?.specialization || "General Fitness"}
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-white/90 border border-[#ECE7E0]">
                  <span className="text-xs font-bold text-[#6B6760] tracking-wide">
                    Access Privileges
                  </span>
                  <p className="text-lg font-bold text-[#141414] mt-1">Full All-Access Membership</p>
                  <p className="text-xs text-[#6B6760] mt-1">
                    Weight room, cardio floor, shower rooms, and certified coach assignment.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ==================== FOOTER ==================== */}
      <footer className="border-t border-[#ECE7E0]/60 py-6 px-6 text-center text-xs text-[#7A756D]">
        <p>© 2026 AURA Athletic Club · Professional Fitness & Performance ERP</p>
      </footer>

      {/* ==================== RENEWAL MODAL ==================== */}
      {renewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141414]/60 backdrop-blur-md">
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#ECE7E0] w-full max-w-2xl p-6 sm:p-8 space-y-6 shadow-md relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#ECE7E0]">
              <div>
                <h3 className="text-2xl font-bold text-[#141414] font-display">Renew / Extend Gym Membership</h3>
                <p className="text-xs text-[#6B6760] mt-1">
                  Select a subscription tier to extend your access period seamlessly.
                </p>
              </div>
              <button
                onClick={() => setRenewModalOpen(false)}
                className="text-[#6B6760] hover:text-[#141414] text-sm p-1 rounded-lg hover:bg-[#F1EDE7] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {renewSuccess && (
              <div className="p-3.5 rounded-xl bg-[#FF5A1F]/10 border border-[#FF5A1F]/30 text-[#C93E0B] text-xs font-semibold flex items-center gap-2">
                <IconCheck size={16} />
                <span>{renewSuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {GYM_PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-white/90 rounded-2xl border border-[#ECE7E0] p-5 flex flex-col justify-between hover:border-[#FF5A1F]/50 transition-all"
                >
                  <div className="space-y-3">
                    <span className="text-[11px] font-bold tracking-wide text-[#C93E0B] bg-[#FF5A1F]/10 px-2 py-0.5 rounded border border-[#FF5A1F]/20">
                      {plan.tier}
                    </span>
                    <h4 className="text-base font-bold text-[#141414]">{plan.name}</h4>
                    <p className="text-3xl font-bold text-[#141414] font-display tabular-nums">
                      ₹{plan.price.toLocaleString()}
                    </p>
                    <p className="text-xs text-[#6B6760] leading-relaxed">{plan.description}</p>
                  </div>

                  <button
                    onClick={() => handleRenewPlan(plan.durationMonths, plan.name, plan.price)}
                    disabled={renewing}
                    className="mt-5 w-full py-2.5 rounded-xl bg-[#FF5A1F] hover:bg-[#FF7A45] text-[#141414] font-bold text-xs tracking-wide transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-[#141414]/10"
                  >
                    {renewing ? "Processing..." : `Select ${plan.durationMonths} Mo`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
