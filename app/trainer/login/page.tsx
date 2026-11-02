"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import {
  IconDumbbell,
  IconShield,
  IconAlertCircle,
  IconCheck,
  IconUser,
} from "@/lib/svgIcons";

export default function TrainerLoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"login" | "apply">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [applyForm, setApplyForm] = useState({
    name: "",
    phone: "",
    specialization: "Strength & Conditioning",
    experience: "1-3 Years",
  });

  // Check if already logged in as trainer
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
            if (data.exists && data.user?.role === "trainer") {
              if (data.user.status === "approved") {
                router.push("/trainer/dashboard");
              } else if (data.user.status === "pending") {
                router.push("/pending-approval");
              }
            }
          }
        } catch (e) {
          console.error("Coach check error:", e);
        }
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);

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
      } catch {
        // non-json
      }

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed on backend");
      }

      if (data.exists && data.user) {
        if (data.user.role === "trainer") {
          if (data.user.status === "approved") {
            router.push("/trainer/dashboard");
          } else if (data.user.status === "pending") {
            router.push("/pending-approval");
          } else {
            setError("Your coaching application is not active. Please contact management.");
          }
        } else {
          setError(
            `This Google account is registered as a Member (${data.user.name || "User"}). Please sign in with your Coach credentials, or apply as a coach.`
          );
        }
      } else {
        // Not registered yet
        setApplyForm((prev) => ({
          ...prev,
          name: user.displayName || "",
        }));
        setActiveTab("apply");
        setError("No coach profile found for this account. Please complete your coach application below.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to sign in with Google");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

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

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          role: "trainer",
          name: applyForm.name.trim(),
          phone: applyForm.phone.trim(),
          specialization: applyForm.specialization,
          experience: applyForm.experience,
        }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {}

      if (!res.ok) {
        throw new Error(data.error || "Application submission failed");
      }

      router.push("/pending-approval");
    } catch (err: any) {
      setError(err.message || "Failed to submit application");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col justify-center items-center p-6 selection:bg-teal-500 selection:text-slate-950">
      <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 relative">
        {/* TOP BRANDING */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-700 flex items-center justify-center text-white mx-auto shadow-lg shadow-teal-500/20">
            <IconDumbbell size={24} />
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-wide">Coach Terminal</h2>
          <p className="text-xs text-slate-400">
            Certified Trainers & Fitness Coaching Staff Portal
          </p>
        </div>

        {/* TABS SWITCHER */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setActiveTab("login");
              setError("");
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "login"
                ? "bg-slate-800 text-teal-400 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Coach Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("apply");
              setError("");
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "apply"
                ? "bg-slate-800 text-teal-400 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Apply as Staff
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <IconAlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <IconCheck size={16} className="shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* TAB 1: COACH SIGN IN */}
        {activeTab === "login" && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-md disabled:opacity-50"
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
              <span>{loading ? "Verifying Coach Account..." : "Continue with Google (Coach)"}</span>
            </button>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-400 space-y-1">
              <span className="font-semibold text-slate-200 block">Trainer Access Note:</span>
              <p className="text-[11px] leading-relaxed">
                Coaching staff accounts require verified status approved by gym management before accessing client rosters and shift terminals.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: APPLY AS COACH */}
        {activeTab === "apply" && (
          <form onSubmit={handleApply} className="space-y-3.5">
            <div>
              <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1">
                Full Legal Name
              </label>
              <input
                type="text"
                placeholder="e.g. Vikram Singh"
                value={applyForm.name}
                onChange={(e) => setApplyForm({ ...applyForm, name: e.target.value })}
                className="gym-input"
                required
              />
            </div>

            <div>
              <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={applyForm.phone}
                onChange={(e) => setApplyForm({ ...applyForm, phone: e.target.value })}
                className="gym-input"
                required
              />
            </div>

            <div>
              <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1">
                Primary Specialization
              </label>
              <select
                value={applyForm.specialization}
                onChange={(e) => setApplyForm({ ...applyForm, specialization: e.target.value })}
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
              <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1">
                Certifications & Experience
              </label>
              <input
                type="text"
                placeholder="e.g. ACE Certified, 4 Years Exp."
                value={applyForm.experience}
                onChange={(e) => setApplyForm({ ...applyForm, experience: e.target.value })}
                className="gym-input"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !applyForm.name || !applyForm.phone}
              className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 mt-1 shadow-md shadow-teal-500/20"
            >
              {loading ? "Submitting..." : "Submit Coach Application"}
            </button>
          </form>
        )}

        {/* BOTTOM NAVIGATION LINKS */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="hover:text-emerald-400 transition-colors"
          >
            &larr; Member Portal
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="hover:text-amber-400 transition-colors"
          >
            Admin ERP &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
