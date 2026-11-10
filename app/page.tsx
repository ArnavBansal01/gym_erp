"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { GYM_PLANS } from "@/lib/membershipUtils";
import {
  IconDumbbell,
  IconUser,
  IconUsers,
  IconShield,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconLogOut,
  IconStar,
  IconQrCode,
  IconClock,
} from "@/lib/svgIcons";

export default function Home() {
  const router = useRouter();

  // Loading & Error States
  const [loadingRole, setLoadingRole] = useState<"member" | "trainer" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [rejectedTrainer, setRejectedTrainer] = useState<any | null>(null);

  // Modals
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showTrainerModal, setShowTrainerModal] = useState(false);

  // Active Session State
  const [activeSession, setActiveSession] = useState<{
    user: any;
    email: string;
    name: string;
  } | null>(null);

  // Approved Trainers for Member coach assignment
  const [trainers, setTrainers] = useState<any[]>([]);

  // Registration Form State
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    assignedTrainer: null as any,
    selectedPlan: GYM_PLANS[0],
    specialization: "Strength & Conditioning",
    experience: "1-3 Years",
  });

  // Check active session on load
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          const res = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.exists && data.user) {
              setActiveSession({
                user: data.user,
                email: currentUser.email || "",
                name: data.user.name || currentUser.displayName || "User",
              });
              if (
                data.user.role === "trainer" &&
                (data.user.status === "rejected" || data.user.status === "revoked")
              ) {
                setRejectedTrainer(data.user);
              }
            }
          }
        } catch (e) {
          console.error("Session check error:", e);
        }
      } else {
        setActiveSession(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch approved trainers via server API
  useEffect(() => {
    const fetchApprovedTrainers = async () => {
      try {
        const res = await fetch("/api/trainers");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.trainers)) {
            setTrainers(data.trainers);
          }
        }
      } catch (err) {
        console.error("Error fetching trainers:", err);
      }
    };
    fetchApprovedTrainers();
  }, []);

  // Handle Google Login for a specific role card
  const handleRoleLogin = async (targetRole: "member" | "trainer") => {
    setError("");
    setLoadingRole(targetRole);
    setRejectedTrainer(null);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const idToken = await user.getIdToken();

      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {}

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed on backend");
      }

      if (data.exists && data.user) {
        if (targetRole === "trainer") {
          if (data.user.role === "trainer") {
            if (data.user.status === "pending") {
              router.push("/pending-approval");
            } else if (data.user.status === "rejected" || data.user.status === "revoked") {
              setRejectedTrainer(data.user);
            } else {
              router.push("/trainer/dashboard");
            }
          } else {
            setError(
              `This Google account is registered as a Member (${data.user.name || "User"}). Please sign in under Member, or apply as a Coach.`
            );
          }
        } else {
          // targetRole === "member"
          if (data.user.role === "member") {
            router.push("/dashboard");
          } else if (data.user.role === "trainer") {
            setError(
              `This Google account is registered as a Trainer (${data.user.name || "Coach"}). Please sign in under Trainer.`
            );
          } else {
            router.push("/dashboard");
          }
        }
      } else {
        // User not in DB yet: prompt registration modal
        setFormData((prev) => ({
          ...prev,
          name: user.displayName || "",
          email: user.email || "",
        }));

        if (targetRole === "member") {
          setShowMemberModal(true);
        } else {
          setShowTrainerModal(true);
        }
      }
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError(err.message || "Sign in failed");
      }
    } finally {
      setLoadingRole(null);
    }
  };

  // Submit registration for Member or Trainer
  const submitRegistration = async (role: "member" | "trainer") => {
    setError("");
    setSubmitting(true);

    try {
      let currentUser = auth.currentUser;
      let idToken = "";

      if (!currentUser) {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        currentUser = result.user;
        idToken = await currentUser.getIdToken();
      } else {
        idToken = await currentUser.getIdToken();
      }

      const payload: any = {
        name: formData.name.trim() || "User",
        phone: formData.phone.trim() || "N/A",
        role,
      };

      if (role === "member") {
        payload.assignedTrainer = formData.assignedTrainer
          ? {
              uid: formData.assignedTrainer.uid,
              name: formData.assignedTrainer.name,
              phone: formData.assignedTrainer.phone || "",
            }
          : {
              uid: "general",
              name: "General Floor Coach",
              phone: "",
            };
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + formData.selectedPlan.durationMonths);
        const daysLeft = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

        payload.plan = {
          name: formData.selectedPlan.name,
          tier: formData.selectedPlan.tier,
          price: String(formData.selectedPlan.price),
          durationMonths: formData.selectedPlan.durationMonths,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          daysLeft,
        };
      } else {
        payload.specialization = formData.specialization;
        payload.experience = formData.experience;
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {}

      if (!res.ok) {
        throw new Error(data.error || `Failed to register (${res.status})`);
      }

      if (role === "trainer") {
        setShowTrainerModal(false);
        router.push("/pending-approval");
      } else {
        setShowMemberModal(false);
        router.push("/dashboard");
      }
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError(err.message || "Registration failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setActiveSession(null);
    setRejectedTrainer(null);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#141414] flex flex-col justify-between selection:bg-[#FF5A1F] selection:text-[#141414]">
      {/* ==================== TOP HEADER ==================== */}
      <header className="border-b border-[#ECE7E0]/80 bg-white/80 backdrop-blur-md px-6 py-4 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* LOGO & GYM TITLE */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF5A1F] via-[#FF5A1F] to-[#FFFFFF] flex items-center justify-center text-[#141414] shadow-md shadow-[#141414]/10 ring-1 ring-[#FF5A1F]/30">
              <IconDumbbell size={22} />
            </div>
            <div>
              <span className="font-bold tracking-wide text-base text-[#141414] block leading-tight">
                AURA
              </span>
              <span className="text-[11px] text-[#C93E0B] font-semibold tracking-wide">
                Athletic Club
              </span>
            </div>
          </div>

          {/* TOP RIGHT: ADMIN ONLY */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="px-4 py-2 rounded-xl bg-[#F7F4EF] hover:bg-[#F1EDE7] border border-[#D8D0C5] hover:border-[#BDB6AB] text-[#2A2724] text-sm font-bold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Admin ERP Login"
            >
              <IconShield size={15} />
              <span>Admin</span>
            </button>
          </div>
        </div>
      </header>

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="max-w-5xl mx-auto px-6 py-12 flex-1 flex flex-col justify-center items-center w-full">
        {/* ACTIVE SESSION BANNER */}
        {activeSession && (
          <div className="w-full max-w-2xl mb-8 p-4 rounded-2xl bg-white/90 border border-[#FF5A1F]/30 shadow-md backdrop-blur-md flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF5A1F]/20 text-[#C93E0B] flex items-center justify-center font-bold">
                {activeSession.user.role === "trainer" ? "TR" : "MB"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#141414]">
                    {activeSession.name}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wide bg-[#FF5A1F]/10 text-[#C93E0B] border border-[#FF5A1F]/20">
                    {activeSession.user.role}
                  </span>
                </div>
                <span className="text-xs text-[#6B6760]">{activeSession.email}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (activeSession.user.role === "trainer") {
                    router.push(
                      activeSession.user.status === "approved"
                        ? "/trainer/dashboard"
                        : "/pending-approval"
                    );
                  } else if (activeSession.user.role === "admin") {
                    router.push("/admin");
                  } else {
                    router.push("/dashboard");
                  }
                }}
                className="px-4 py-2 rounded-xl bg-[#FF5A1F] hover:bg-[#FF7A45] text-[#141414] font-bold text-xs tracking-wide transition-all cursor-pointer"
              >
                Go to Portal &rarr;
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 rounded-xl bg-[#F1EDE7] hover:bg-[#E4DED5] text-[#6B6760] hover:text-[#141414] transition-all cursor-pointer"
                title="Sign Out"
              >
                <IconLogOut size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ERROR MESSAGE */}
        {error && (
          <div className="w-full max-w-2xl mb-6 p-4 rounded-xl bg-[#D93636]/10 border border-[#D93636]/30 text-[#C42B2B] text-xs flex items-center gap-3">
            <IconAlertCircle size={18} className="shrink-0 text-[#C42B2B]" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="text-[#6B6760] hover:text-[#141414]"
            >
              <IconX size={16} />
            </button>
          </div>
        )}

        {/* REJECTED COACH NOTICE */}
        {rejectedTrainer && (
          <div className="w-full max-w-2xl mb-6 p-5 rounded-xl bg-[#D93636]/10 border border-[#D93636]/30 text-center space-y-2">
            <IconAlertCircle size={24} className="mx-auto text-[#C42B2B]" />
            <h4 className="text-sm font-bold text-[#141414]">Application Not Approved</h4>
            <p className="text-xs text-[#6B6760]">
              Your application to join the coaching staff has been declined by gym management.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 px-4 py-1.5 rounded-lg bg-[#F1EDE7] hover:bg-[#E4DED5] text-xs text-[#4A4640] font-semibold"
            >
              Sign Out
            </button>
          </div>
        )}

        {/* SECTION TITLE */}
        <div className="text-center mb-10 space-y-2">
          <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wide bg-[#FF5A1F]/10 text-[#C93E0B] border border-[#FF5A1F]/20 inline-block mb-1">
            Sign In Portal
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#141414] tracking-tight font-display">
            Choose Your Account
          </h1>
          <p className="text-[#6B6760] text-xs sm:text-sm max-w-md mx-auto">
            Please select whether you are accessing as a gym member or as coaching staff.
          </p>
        </div>

        {/* ==================== TWO ROLE CARDS ==================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
          {/* CARD 1: MEMBER */}
          <div className="relative rounded-2xl bg-[#FFFFFF]/90 border border-[#ECE7E0] hover:border-[#FF5A1F]/50 p-7 flex flex-col justify-between transition-all duration-300 group hover:shadow-md hover:shadow-[#141414]/10">
            <div className="space-y-5">
              {/* CARD TOP BADGE & ICON */}
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 text-[#C93E0B] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <IconUser size={24} />
                </div>
                <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wide bg-[#FF5A1F]/10 text-[#C93E0B] border border-[#FF5A1F]/20">
                  Member
                </span>
              </div>

              {/* CARD TITLE & DESCRIPTION */}
              <div>
                <h2 className="text-2xl font-bold text-[#141414] group-hover:text-[#C93E0B] transition-colors font-display">
                  Member Portal
                </h2>
                <p className="text-xs text-[#6B6760] mt-1 leading-relaxed">
                  Access your active subscription, scan digital QR passes, and check coach guidance.
                </p>
              </div>

              {/* FEATURES BULLETS */}
              <ul className="space-y-2 pt-2 border-t border-[#ECE7E0]/80 text-xs text-[#4A4640]">
                <li className="flex items-center gap-2">
                  <span className="text-[#C93E0B] font-bold">✓</span>
                  <span>Personal Membership & Renewal Stats</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#C93E0B] font-bold">✓</span>
                  <span>Instant Digital Gate QR Pass</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#C93E0B] font-bold">✓</span>
                  <span>Assigned Certified Coach Details</span>
                </li>
              </ul>
            </div>

            {/* ACTION BUTTON & FOOTER LINK */}
            <div className="pt-6 space-y-3">
              <button
                type="button"
                onClick={() => handleRoleLogin("member")}
                disabled={loadingRole !== null}
                className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-[#F7F4EF] border border-[#D8D0C5] text-[#141414] font-bold text-sm tracking-wide flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8 0-1 .2-2 .4-2.8L1.9 6.3C.7 8.7 0 11.3 0 14c0 2.7.7 5.3 1.9 7.7l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 19.7 7.5 22.3 12 23z"
                  />
                </svg>
                <span>
                  {loadingRole === "member" ? "Signing In..." : "Sign In as Member"}
                </span>
              </button>

              <p className="text-center text-[11px] text-[#7A756D]">
                New member?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setShowMemberModal(true);
                  }}
                  className="text-[#C93E0B] font-bold hover:underline cursor-pointer"
                >
                  Join as a Member
                </button>
              </p>
            </div>
          </div>

          {/* CARD 2: TRAINER */}
          <div className="relative rounded-2xl bg-[#FFFFFF]/90 border border-[#ECE7E0] hover:border-[#FF5A1F]/50 p-7 flex flex-col justify-between transition-all duration-300 group hover:shadow-md hover:shadow-[#141414]/10">
            <div className="space-y-5">
              {/* CARD TOP BADGE & ICON */}
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 text-[#C93E0B] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <IconUsers size={24} />
                </div>
                <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wide bg-[#FF5A1F]/10 text-[#C93E0B] border border-[#FF5A1F]/20">
                  Trainer
                </span>
              </div>

              {/* CARD TITLE & DESCRIPTION */}
              <div>
                <h2 className="text-2xl font-bold text-[#141414] group-hover:text-[#C93E0B] transition-colors font-display">
                  Trainer Terminal
                </h2>
                <p className="text-xs text-[#6B6760] mt-1 leading-relaxed">
                  Manage assigned fitness clients, review workout performance, and log coaching shifts.
                </p>
              </div>

              {/* FEATURES BULLETS */}
              <ul className="space-y-2 pt-2 border-t border-[#ECE7E0]/80 text-xs text-[#4A4640]">
                <li className="flex items-center gap-2">
                  <span className="text-[#C93E0B] font-bold">✓</span>
                  <span>Assigned Trainee Rosters & Goals</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#C93E0B] font-bold">✓</span>
                  <span>Duty Shift Check-In & Attendance</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#C93E0B] font-bold">✓</span>
                  <span>Workout Logs & Performance Feedback</span>
                </li>
              </ul>
            </div>

            {/* ACTION BUTTON & FOOTER LINK */}
            <div className="pt-6 space-y-3">
              <button
                type="button"
                onClick={() => handleRoleLogin("trainer")}
                disabled={loadingRole !== null}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5A1F] to-[#FF5A1F] hover:from-[#FF7A45] hover:to-[#FF7A45] text-[#141414] font-bold text-xs tracking-wide flex items-center justify-center gap-3 transition-all shadow-md shadow-[#141414]/10 cursor-pointer disabled:opacity-50"
              >
                <IconShield size={16} />
                <span>
                  {loadingRole === "trainer" ? "Verifying..." : "Sign In as Trainer"}
                </span>
              </button>

              <p className="text-center text-[11px] text-[#7A756D]">
                Want to coach here?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setShowTrainerModal(true);
                  }}
                  className="text-[#C93E0B] font-bold hover:underline cursor-pointer"
                >
                  Apply as Coach
                </button>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ==================== FOOTER ==================== */}
      <footer className="border-t border-[#ECE7E0]/60 py-6 px-6 text-center text-xs text-[#7A756D]">
        <p>© 2026 AURA Athletic Club · Professional Fitness & Performance ERP</p>
      </footer>

      {/* ==================== MODAL: JOIN AS A MEMBER ==================== */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 bg-[#141414]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#ECE7E0] rounded-2xl w-full max-w-lg p-6 sm:p-7 shadow-md space-y-5 relative max-h-[90vh] overflow-y-auto">
            {/* CLOSE BUTTON */}
            <button
              type="button"
              onClick={() => setShowMemberModal(false)}
              className="absolute top-5 right-5 text-[#6B6760] hover:text-[#141414] p-1 rounded-lg hover:bg-[#F1EDE7] transition-colors cursor-pointer"
            >
              <IconX size={20} />
            </button>

            <div>
              <div className="flex items-center gap-2 text-[#C93E0B] text-xs font-bold tracking-wide mb-1">
                <IconUser size={16} />
                <span>Member Registration</span>
              </div>
              <h3 className="text-2xl font-bold text-[#141414] font-display">Join as a Member</h3>
              <p className="text-xs text-[#6B6760]">
                Select your subscription tier and assigned personal coach.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="gym-input"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="gym-input"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
                  Select Membership Tier
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {GYM_PLANS.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, selectedPlan: plan })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        formData.selectedPlan.id === plan.id
                          ? "bg-[#FF5A1F]/10 border-[#FF5A1F] text-[#141414]"
                          : "bg-[#F7F4EF] border-[#ECE7E0] text-[#6B6760] hover:border-[#E0D9CF]"
                      }`}
                    >
                      <span className="block text-[11px] font-bold text-[#C93E0B]">
                        {plan.durationMonths} Mo
                      </span>
                      <span className="block text-sm font-bold text-[#141414] mt-0.5">
                        ₹{plan.price}
                      </span>
                      <span className="block text-[11px] text-[#7A756D] mt-1 truncate">
                        {plan.tier}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
                  Assigned Coach (Verified Trainers)
                </label>
                <select
                  value={formData.assignedTrainer?.uid || ""}
                  onChange={(e) => {
                    const trainer = trainers.find((t) => t.uid === e.target.value);
                    setFormData({ ...formData, assignedTrainer: trainer || null });
                  }}
                  className="gym-select"
                >
                  <option value="">General Floor Coach (Default)</option>
                  {trainers.map((t) => (
                    <option key={t.uid} value={t.uid}>
                      {t.name} — {t.specialization}
                    </option>
                  ))}
                </select>
                {trainers.length === 0 && (
                  <p className="text-[11px] text-[#8A6100] mt-1 flex items-center gap-1">
                    <IconAlertCircle size={12} />
                    <span>No personal coaches currently listed. General coach assigned.</span>
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => submitRegistration("member")}
                disabled={submitting || !formData.name || !formData.phone}
                className="w-full py-3.5 rounded-xl bg-[#FF5A1F] hover:bg-[#FF7A45] text-[#141414] font-bold text-xs tracking-wide transition-all disabled:opacity-50 mt-2 shadow-md shadow-[#141414]/10 cursor-pointer"
              >
                {submitting ? "Processing..." : "Complete Registration & Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: APPLY AS COACH ==================== */}
      {showTrainerModal && (
        <div className="fixed inset-0 z-50 bg-[#141414]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#ECE7E0] rounded-2xl w-full max-w-lg p-6 sm:p-7 shadow-md space-y-5 relative max-h-[90vh] overflow-y-auto">
            {/* CLOSE BUTTON */}
            <button
              type="button"
              onClick={() => setShowTrainerModal(false)}
              className="absolute top-5 right-5 text-[#6B6760] hover:text-[#141414] p-1 rounded-lg hover:bg-[#F1EDE7] transition-colors cursor-pointer"
            >
              <IconX size={20} />
            </button>

            <div>
              <div className="flex items-center gap-2 text-[#C93E0B] text-xs font-bold tracking-wide mb-1">
                <IconShield size={16} />
                <span>Coach Verification</span>
              </div>
              <h3 className="text-2xl font-bold text-[#141414] font-display">Apply as Coaching Staff</h3>
              <p className="text-xs text-[#6B6760]">
                Staff profiles enter a verification gate pending management approval.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
                  Coach Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vikram Singh"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="gym-input"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="gym-input"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
                  Primary Specialization
                </label>
                <select
                  value={formData.specialization}
                  onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                  className="gym-select"
                >
                  <option value="Strength & Conditioning">Strength & Conditioning</option>
                  <option value="Bodybuilding & Hypertrophy">Bodybuilding & Hypertrophy</option>
                  <option value="CrossFit & Functional Training">CrossFit & Functional Training</option>
                  <option value="Fat Loss & Endurance">Fat Loss & Endurance</option>
                  <option value="Rehabilitation & Mobility">Rehabilitation & Mobility</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
                  Certifications & Experience
                </label>
                <input
                  type="text"
                  placeholder="e.g. ACE Certified, 4 years exp."
                  value={formData.experience}
                  onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                  className="gym-input"
                />
              </div>

              <button
                type="button"
                onClick={() => submitRegistration("trainer")}
                disabled={submitting || !formData.name || !formData.phone}
                className="w-full py-3.5 rounded-xl bg-[#FF5A1F] hover:bg-[#FF7A45] text-[#141414] font-bold text-xs tracking-wide transition-all disabled:opacity-50 mt-2 shadow-md shadow-[#141414]/10 cursor-pointer"
              >
                {submitting ? "Submitting..." : "Submit Trainer Application"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
