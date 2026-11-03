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
    <div className="min-h-screen bg-[#FAF8F5] text-[#141414] flex flex-col justify-center items-center p-6 selection:bg-[#FF5A1F] selection:text-[#141414]">
      <div className="w-full max-w-md bg-[#FFFFFF] border border-[#ECE7E0] rounded-2xl p-6 sm:p-8 shadow-md space-y-6 relative">
        {/* TOP BRANDING */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF5A1F] to-[#FF5A1F] flex items-center justify-center text-[#141414] mx-auto shadow-md shadow-[#141414]/10">
            <IconDumbbell size={24} />
          </div>
          <h2 className="text-3xl font-bold text-[#141414] tracking-wide font-display">Coach Terminal</h2>
          <p className="text-xs text-[#6B6760]">
            Certified Trainers & Fitness Coaching Staff Portal
          </p>
        </div>

        {/* TABS SWITCHER */}
        <div className="flex items-center gap-1 bg-white/90 p-1.5 rounded-xl border border-[#ECE7E0]">
          <button
            type="button"
            onClick={() => {
              setActiveTab("login");
              setError("");
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "login"
                ? "bg-[#F1EDE7] text-[#C93E0B] shadow-sm"
                : "text-[#6B6760] hover:text-[#2A2724]"
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
                ? "bg-[#F1EDE7] text-[#C93E0B] shadow-sm"
                : "text-[#6B6760] hover:text-[#2A2724]"
            }`}
          >
            Apply as Staff
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-[#D93636]/10 border border-[#D93636]/30 text-[#C42B2B] text-xs flex items-center gap-2">
            <IconAlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-[#FF5A1F]/10 border border-[#FF5A1F]/30 text-[#C93E0B] text-xs flex items-center gap-2">
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
              className="w-full py-3.5 px-4 bg-white hover:bg-[#F7F4EF] border border-[#D8D0C5] text-[#141414] font-bold rounded-xl text-sm tracking-wide flex items-center justify-center gap-3 transition-all disabled:opacity-50"
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

            <div className="p-3.5 rounded-xl bg-white/90 border border-[#ECE7E0] text-xs text-[#6B6760] space-y-1">
              <span className="font-semibold text-[#2A2724] block">Trainer Access Note:</span>
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
              <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
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
              <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
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
              <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
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
              <label className="block text-xs font-semibold text-[#6B6760] tracking-wide mb-1">
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
              className="w-full py-3 rounded-xl bg-[#FF5A1F] hover:bg-[#FF7A45] text-[#141414] font-bold text-xs tracking-wide transition-all disabled:opacity-50 mt-1 shadow-md shadow-[#141414]/10"
            >
              {loading ? "Submitting..." : "Submit Coach Application"}
            </button>
          </form>
        )}

        {/* BOTTOM NAVIGATION LINKS */}
        <div className="pt-2 border-t border-[#ECE7E0]/80 flex items-center justify-between text-xs text-[#7A756D]">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="hover:text-[#C93E0B] transition-colors"
          >
            &larr; Member Portal
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="hover:text-[#8A6100] transition-colors"
          >
            Admin ERP &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
