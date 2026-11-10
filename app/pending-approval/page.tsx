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
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#FF5A1F] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-[#6B6760]">Verifying account credentials...</p>
        </div>
      </div>
    );
  }

  // SCREEN: APPROVED (Auto-redirect)
  if (isApproved) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#FFFFFF] border border-[#FF5A1F]/40 rounded-2xl p-8 shadow-md text-center">
          <div className="w-14 h-14 rounded-full bg-[#FF5A1F]/10 text-[#C93E0B] flex items-center justify-center mx-auto mb-4 border border-[#FF5A1F]/30">
            <IconCheck size={28} />
          </div>
          <h2 className="text-2xl font-bold text-[#141414] mb-2 font-display">Application Approved</h2>
          <p className="text-sm text-[#6B6760] leading-relaxed mb-6">
            Gym management has authorized your coaching account. Welcome to the AURA Athletic staff.
          </p>
          <div className="p-3 rounded-lg bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 text-xs font-semibold text-[#C93E0B]">
            Unlocking Trainer Dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#FFFFFF] border border-[#ECE7E0] rounded-2xl p-8 shadow-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#E0A100]/10 border border-[#E0A100]/20 text-[#8A6100] mb-3">
            <IconClock size={24} />
          </div>
          <h1 className="text-2xl font-bold text-[#141414] font-display">Application Pending Approval</h1>
          <p className="text-xs text-[#6B6760] mt-1">Management Verification in Progress</p>
        </div>

        <div className="bg-[#F7F4EF] border border-[#ECE7E0] rounded-xl p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-[#ECE7E0]">
            <span className="text-[#6B6760]">Status</span>
            <span className="status-pill status-warning">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E0A100] animate-pulse"></span>
              Under Review
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6B6760]">Applicant</span>
            <span className="font-semibold text-[#2A2724]">{userProfile?.name}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6B6760]">Specialization</span>
            <span className="text-[#2A2724]">{userProfile?.specialization}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6B6760]">Contact</span>
            <span className="text-[#4A4640]">{userProfile?.phone}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-[#2F6FED]/10 border border-[#2F6FED]/20 text-xs text-[#1F57C9] leading-relaxed mb-6 flex items-start gap-2.5">
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
