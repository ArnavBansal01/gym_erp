"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { IconClock, IconShield, IconCheck, IconLogOut, IconDumbbell } from "@/lib/svgIcons";

export default function PendingApprovalPage() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    let unsubscribeSnap: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/");
        return;
      }

      const userDocRef = doc(db, "users", currentUser.uid);
      unsubscribeSnap = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();

          if (data.role !== "trainer") {
            router.push("/dashboard");
            return;
          }

          const status = data.status || (data.totalSessions > 0 ? "approved" : "pending");

          if (status === "approved") {
            setIsApproved(true);
            setTimeout(() => {
              router.push("/trainer/dashboard");
            }, 1500);
          } else {
            setUserProfile({
              name: data.name || currentUser.displayName || "Trainer",
              email: data.email || currentUser.email || "",
              phone: data.phone || "N/A",
              specialization: data.specialization || "General Fitness",
              status,
            });
          }
        }
        setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnap) unsubscribeSnap();
    };
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-slate-400">Verifying account credentials...</p>
        </div>
      </div>
    );
  }

  // SCREEN: APPROVED (Auto-redirect)
  if (isApproved) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#0f172a] border border-emerald-500/40 rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
            <IconCheck size={28} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Application Approved</h2>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">
            Gym management has authorized your coaching account. Welcome to the Iconic Gym staff.
          </p>
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400">
            Unlocking Trainer Dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-3">
            <IconClock size={24} />
          </div>
          <h1 className="text-xl font-bold text-white">Application Pending Approval</h1>
          <p className="text-xs text-slate-400 mt-1">Management Verification in Progress</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
            <span className="text-slate-400">Status</span>
            <span className="status-pill status-warning">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              Under Review
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Applicant</span>
            <span className="font-semibold text-slate-200">{userProfile?.name}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Specialization</span>
            <span className="text-slate-200">{userProfile?.specialization}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Contact</span>
            <span className="text-slate-300">{userProfile?.phone}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 leading-relaxed mb-6 flex items-start gap-2.5">
          <IconShield size={16} className="shrink-0 mt-0.5" />
          <span>
            This portal automatically monitors verification status in real-time. Once the admin approves your profile, this screen will immediately unlock.
          </span>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="btn-secondary w-full"
        >
          <IconLogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
