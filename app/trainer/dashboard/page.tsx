"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { computeMembership } from "@/lib/membershipUtils";
import {
  IconDumbbell,
  IconUser,
  IconUsers,
  IconQrCode,
  IconLogOut,
  IconCheck,
  IconStar,
  IconAlertCircle,
  IconRefresh,
  IconClock,
  IconCalendar,
} from "@/lib/svgIcons";

export default function TrainerPortal() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"assigned" | "today" | "all" | "duty">("assigned");
  const [assignedClients, setAssignedClients] = useState<any[]>([]);
  const [clientsData, setClientsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Rate Workout Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [ratingValue, setRatingValue] = useState<number>(8);
  const [trainerNotes, setTrainerNotes] = useState("");
  const [savingRating, setSavingRating] = useState(false);

  // Trainer Stats State
  const [trainerStats, setTrainerStats] = useState({
    name: "Trainer",
    currentStatus: "OUT",
    attendanceRate: 100,
    shiftsAssigned: 0,
    shiftsAttended: 0,
    specialization: "General Fitness",
    messages: [
      "Ensure all morning batch trainees complete full mobility warm-ups.",
      "Update workout notes for newly enrolled quarterly members.",
    ],
  });

  useEffect(() => {
    let unsubscribeSnap: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/trainer/login");
        return;
      }

      try {
        const token = await currentUser.getIdToken();
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        let authData: any = {};
        try {
          authData = await res.json();
        } catch {
          // not JSON
        }

        if (!authData.authenticated || !authData.exists) {
          router.push("/trainer/login");
          return;
        }

        if (authData.user.role !== "trainer") {
          router.push("/dashboard");
          return;
        }

        if (authData.user.status !== "approved") {
          router.push("/pending-approval");
          return;
        }

        // Live listener for trainer profile doc in unified 'users' collection
        const trainerDocRef = doc(db, "users", currentUser.uid);
        unsubscribeSnap = onSnapshot(trainerDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            let joinDate = today;
            if (data.joiningDate?.toDate) {
              joinDate = data.joiningDate.toDate();
            } else if (data.createdAt?.toDate) {
              joinDate = data.createdAt.toDate();
            }

            const diffTime = Math.abs(today.getTime() - joinDate.getTime());
            const daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
            const virtualAssigned = Math.max(daysElapsed * 2, 1);
            const actualAttended = data.totalSessions || 0;
            const calcRate = Math.min(Math.round((actualAttended / virtualAssigned) * 100), 100);

            setTrainerStats((prev) => ({
              ...prev,
              name: data.name || currentUser.displayName || "Trainer",
              currentStatus: data.currentStatus === "IN" ? "IN" : "OUT",
              specialization: data.specialization || "General Fitness",
              attendanceRate: calcRate,
              shiftsAssigned: virtualAssigned,
              shiftsAttended: actualAttended,
            }));
          }
        });

        await fetchClients(currentUser.uid);
      } catch (err) {
        console.error("Trainer portal init error:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnap) unsubscribeSnap();
    };
  }, [router]);

  const fetchClients = async (trainerUid: string) => {
    try {
      const res = await fetch(`/api/trainer/clients?trainerUid=${encodeURIComponent(trainerUid)}`);
      if (!res.ok) throw new Error("Failed to fetch clients from server");
      const result = await res.json();

      const processList = (list: any[]) =>
        list.map((c: any) => ({
          ...c,
          membership: computeMembership(c.plan, c.createdAt),
        }));

      setClientsData(processList(result.all || []));
      setAssignedClients(processList(result.assigned || []));
    } catch (error) {
      console.error("Error fetching clients:", error);
    }
  };

  const handleRateClick = (client: any) => {
    setSelectedClient(client);
    setRatingValue(client.rating || 8);
    setTrainerNotes(client.trainerNotes || "");
    setShowModal(true);
  };

  const submitRating = async () => {
    if (!selectedClient) return;
    setSavingRating(true);
    try {
      const res = await fetch("/api/trainer/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: selectedClient.id,
          rating: ratingValue,
          trainerNotes: trainerNotes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update rating");
      }

      const updateLocal = (list: any[]) =>
        list.map((c) =>
          c.id === selectedClient.id
            ? { ...c, rating: ratingValue, trainerNotes: trainerNotes.trim() }
            : c
        );

      setClientsData(updateLocal);
      setAssignedClients(updateLocal);
      setShowModal(false);
    } catch (err: any) {
      console.error("Error saving rating:", err);
      alert("Failed to save rating: " + err.message);
    } finally {
      setSavingRating(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center text-[#4A4640]">
        <div className="flex flex-col items-center gap-3">
          <IconRefresh className="animate-spin text-[#C93E0B]" size={32} />
          <p className="text-sm font-medium tracking-wide">Loading Trainer Terminal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#141414] flex flex-col">
      {/* TOP HEADER */}
      <header className="border-b border-[#ECE7E0] bg-[#FFFFFF]/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF5A1F] to-[#FF5A1F] flex items-center justify-center text-[#141414] shadow-md shadow-[#141414]/10">
              <IconDumbbell size={22} />
            </div>
            <div>
              <span className="font-bold tracking-wide text-base text-[#141414]">AURA Athletic</span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[11px] font-bold tracking-wide bg-[#FF5A1F]/10 text-[#C93E0B] border border-[#FF5A1F]/20">
                Trainer Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide ${
                trainerStats.currentStatus === "IN"
                  ? "bg-[#1F9D55]/10 text-[#17803F] border border-[#1F9D55]/30"
                  : "bg-[#F1EDE7] text-[#6B6760] border border-[#E0D9CF]"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  trainerStats.currentStatus === "IN" ? "bg-[#1F9D55] animate-pulse" : "bg-[#A09A92]"
                }`}
              />
              {trainerStats.currentStatus === "IN" ? "On Duty" : "Off Duty"}
            </span>

            <button
              onClick={() => router.push("/trainer/attendance")}
              className="px-4 py-2 rounded-lg bg-[#FF5A1F] hover:bg-[#FF7A45] text-[#141414] font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-[#141414]/10"
            >
              <IconQrCode size={16} />
              <span>Duty Terminal</span>
            </button>

            <button
              onClick={handleLogout}
              className="p-2 rounded-lg border border-[#E0D9CF] hover:bg-[#F1EDE7] text-[#6B6760] hover:text-[#2A2724] transition-colors"
              title="Sign Out"
            >
              <IconLogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex-1 flex flex-col gap-6">
        {/* WELCOME BAR & TABS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#ECE7E0]/80">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#141414] font-display">
              Coach {trainerStats.name}
            </h1>
            <p className="text-xs sm:text-sm text-[#6B6760] mt-1">
              Specialization: <span className="text-[#2A2724]">{trainerStats.specialization}</span> ·{" "}
              {assignedClients.length} Assigned Clients
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 bg-white/90 p-1.5 rounded-xl border border-[#ECE7E0]">
            <button
              onClick={() => setActiveTab("assigned")}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "assigned"
                  ? "bg-[#F1EDE7] text-[#141414] shadow-sm"
                  : "text-[#6B6760] hover:text-[#2A2724]"
              }`}
            >
              My Clients ({assignedClients.length})
            </button>
            <button
              onClick={() => setActiveTab("today")}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "today"
                  ? "bg-[#F1EDE7] text-[#141414] shadow-sm"
                  : "text-[#6B6760] hover:text-[#2A2724]"
              }`}
            >
              Active Today ({clientsData.filter((c) => c.isPresent).length})
            </button>
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "all"
                  ? "bg-[#F1EDE7] text-[#141414] shadow-sm"
                  : "text-[#6B6760] hover:text-[#2A2724]"
              }`}
            >
              All Members ({clientsData.length})
            </button>
            <button
              onClick={() => setActiveTab("duty")}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "duty"
                  ? "bg-[#F1EDE7] text-[#141414] shadow-sm"
                  : "text-[#6B6760] hover:text-[#2A2724]"
              }`}
            >
              Duty Stats
            </button>
          </div>
        </div>

        {/* TAB 1: ASSIGNED CLIENTS */}
        {activeTab === "assigned" && (
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#ECE7E0] overflow-hidden">
            <div className="p-6 border-b border-[#ECE7E0] flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#141414] font-display">Assigned Trainees Roster</h2>
                <p className="text-xs text-[#6B6760] mt-1">
                  Manage assigned client workout consistency, membership standing, and feedback.
                </p>
              </div>
              <span className="text-xs font-semibold text-[#6B6760]">
                {assignedClients.length} Trainees Assigned
              </span>
            </div>

            {assignedClients.length === 0 ? (
              <div className="p-12 text-center text-[#6B6760]">
                <IconUser size={36} className="mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-[#4A4640]">No trainees assigned to you yet</p>
                <p className="text-xs text-[#7A756D] mt-1">
                  Members who select you as their personal trainer during registration will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-white/80 text-[#6B6760] text-[11px] font-semibold tracking-wide border-b border-[#ECE7E0]">
                    <tr>
                      <th className="py-3.5 px-6">Member Name</th>
                      <th className="py-3.5 px-6">Phone</th>
                      <th className="py-3.5 px-6">Membership</th>
                      <th className="py-3.5 px-6">Sessions</th>
                      <th className="py-3.5 px-6">Status Today</th>
                      <th className="py-3.5 px-6">Score</th>
                      <th className="py-3.5 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECE7E0]/80 text-[#2A2724]">
                    {assignedClients.map((client) => (
                      <tr key={client.id} className="hover:bg-[#F1EDE7]/40 transition-colors">
                        <td className="py-4 px-6 font-semibold text-[#141414]">{client.name}</td>
                        <td className="py-4 px-6 text-[#6B6760]">{client.phone}</td>
                        <td className="py-4 px-6">
                          <span
                            className={`whitespace-nowrap px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide ${
                              client.membership.status === "ACTIVE"
                                ? "bg-[#1F9D55]/10 text-[#17803F] border border-[#1F9D55]/20"
                                : client.membership.status === "EXPIRING_SOON"
                                ? "bg-[#E0A100]/10 text-[#8A6100] border border-[#E0A100]/20"
                                : "bg-[#D93636]/10 text-[#C42B2B] border border-[#D93636]/20"
                            }`}
                          >
                            {client.membership.status === "ACTIVE"
                              ? `Active (${client.membership.daysRemaining}d)`
                              : client.membership.status === "EXPIRING_SOON"
                              ? `Expires in ${client.membership.daysRemaining}d`
                              : "Expired"}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-semibold">{client.attendanceCount}</td>
                        <td className="py-4 px-6">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              client.isPresent
                                ? "bg-[#FF5A1F]/10 text-[#C93E0B]"
                                : "bg-[#F1EDE7] text-[#6B6760]"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                client.isPresent ? "bg-[#FF5A1F]" : "bg-[#A09A92]"
                              }`}
                            />
                            {client.isPresent ? "Checked In" : "Absent"}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="font-bold text-[#8A6100]">
                            {client.rating ? `${client.rating} / 10` : "-"}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => handleRateClick(client)}
                            className="px-3 py-1.5 rounded-lg bg-[#F1EDE7] hover:bg-[#E4DED5] text-[#2A2724] border border-[#E0D9CF] text-xs font-semibold transition-all"
                          >
                            Rate Workout
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

        {/* TAB 2: ACTIVE CLIENTS TODAY */}
        {activeTab === "today" && (
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#ECE7E0] overflow-hidden">
            <div className="p-6 border-b border-[#ECE7E0]">
              <h2 className="text-xl font-bold text-[#141414] font-display">Present on Gym Floor Today</h2>
              <p className="text-xs text-[#6B6760] mt-1">
                Members who have recorded a check-in at the facility entrance terminal.
              </p>
            </div>

            {clientsData.filter((c) => c.isPresent).length === 0 ? (
              <div className="p-12 text-center text-[#6B6760]">
                <IconClock size={36} className="mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-[#4A4640]">No members checked in yet today</p>
                <p className="text-xs text-[#7A756D] mt-1">
                  When members scan their entry QR, their presence will be reflected here in real time.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-white/80 text-[#6B6760] text-[11px] font-semibold tracking-wide border-b border-[#ECE7E0]">
                    <tr>
                      <th className="py-3.5 px-6">Member Name</th>
                      <th className="py-3.5 px-6">Phone</th>
                      <th className="py-3.5 px-6">Assigned Trainer</th>
                      <th className="py-3.5 px-6">Membership</th>
                      <th className="py-3.5 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECE7E0]/80 text-[#2A2724]">
                    {clientsData
                      .filter((c) => c.isPresent)
                      .map((client) => (
                        <tr key={client.id} className="hover:bg-[#F1EDE7]/40 transition-colors">
                          <td className="py-4 px-6 font-semibold text-[#141414]">{client.name}</td>
                          <td className="py-4 px-6 text-[#6B6760]">{client.phone}</td>
                          <td className="py-4 px-6">{client.assignedTrainer?.name || "General"}</td>
                          <td className="py-4 px-6">
                            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#FF5A1F]/10 text-[#C93E0B] border border-[#FF5A1F]/20">
                              {client.membership.planName}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => handleRateClick(client)}
                              className="px-3 py-1.5 rounded-lg bg-[#F1EDE7] hover:bg-[#E4DED5] text-[#2A2724] border border-[#E0D9CF] text-xs font-semibold transition-all"
                            >
                              Rate Workout
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

        {/* TAB 3: ALL MEMBERS */}
        {activeTab === "all" && (
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#ECE7E0] overflow-hidden">
            <div className="p-6 border-b border-[#ECE7E0]">
              <h2 className="text-xl font-bold text-[#141414] font-display">All Registered Gym Members</h2>
              <p className="text-xs text-[#6B6760] mt-1">
                Complete member directory across all training tiers.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-white/80 text-[#6B6760] text-[11px] font-semibold tracking-wide border-b border-[#ECE7E0]">
                  <tr>
                    <th className="py-3.5 px-6">Member Name</th>
                    <th className="py-3.5 px-6">Phone</th>
                    <th className="py-3.5 px-6">Trainer</th>
                    <th className="py-3.5 px-6">Membership Standing</th>
                    <th className="py-3.5 px-6">Total Sessions</th>
                    <th className="py-3.5 px-6">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECE7E0]/80 text-[#2A2724]">
                  {clientsData.map((client) => (
                    <tr key={client.id} className="hover:bg-[#F1EDE7]/40 transition-colors">
                      <td className="py-4 px-6 font-semibold text-[#141414]">{client.name}</td>
                      <td className="py-4 px-6 text-[#6B6760]">{client.phone}</td>
                      <td className="py-4 px-6">{client.assignedTrainer?.name || "Not Assigned"}</td>
                      <td className="py-4 px-6">
                        <span
                          className={`whitespace-nowrap px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide ${
                            client.membership.status === "ACTIVE"
                              ? "bg-[#1F9D55]/10 text-[#17803F] border border-[#1F9D55]/20"
                              : client.membership.status === "EXPIRING_SOON"
                              ? "bg-[#E0A100]/10 text-[#8A6100] border border-[#E0A100]/20"
                              : "bg-[#D93636]/10 text-[#C42B2B] border border-[#D93636]/20"
                          }`}
                        >
                          {client.membership.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-semibold">{client.attendanceCount}</td>
                      <td className="py-4 px-6 font-bold text-[#8A6100]">
                        {client.rating ? `${client.rating} / 10` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: DUTY STATS */}
        {activeTab === "duty" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#FFFFFF] rounded-2xl border border-[#ECE7E0] p-6 space-y-6">
              <div>
                <h3 className="text-xl font-bold text-[#141414] font-display">Duty Attendance Consistency</h3>
                <p className="text-xs text-[#6B6760] mt-1">
                  Track your professional shifts and duty check-in record.
                </p>
              </div>

              <div className="bg-white/80 p-5 rounded-xl border border-[#ECE7E0]">
                <span className="text-xs font-semibold tracking-wide text-[#6B6760]">
                  Consistency Score
                </span>
                <p className="text-5xl font-bold text-[#C93E0B] mt-2 font-display tabular-nums">
                  {trainerStats.attendanceRate}%
                </p>
                <p className="text-xs text-[#6B6760] mt-1">
                  Shifts Attended:{" "}
                  <strong className="text-[#141414]">{trainerStats.shiftsAttended}</strong> /{" "}
                  {trainerStats.shiftsAssigned} assigned
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => router.push("/trainer/attendance")}
                  className="w-full py-3 rounded-xl bg-[#FF5A1F] hover:bg-[#FF7A45] text-[#141414] font-bold text-xs tracking-wide flex items-center justify-center gap-2 transition-all shadow-md shadow-[#141414]/10"
                >
                  <IconQrCode size={18} />
                  <span>Scan Duty Entrance / Exit</span>
                </button>
              </div>
            </div>

            <div className="bg-[#FFFFFF] rounded-2xl border border-[#ECE7E0] p-6 space-y-4">
              <div>
                <h3 className="text-xl font-bold text-[#141414] font-display">Management Notices</h3>
                <p className="text-xs text-[#6B6760] mt-1">Official communications from gym admin.</p>
              </div>

              <div className="space-y-3">
                {trainerStats.messages.map((msg, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl bg-white/80 border border-[#ECE7E0] text-xs text-[#4A4640] leading-relaxed"
                  >
                    <span className="text-[#C93E0B] font-bold block mb-1">Notice #{i + 1}</span>
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RATE WORKOUT MODAL */}
      {showModal && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141414]/60 backdrop-blur-sm">
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#ECE7E0] w-full max-w-lg p-6 sm:p-8 space-y-6 shadow-md">
            <div className="flex items-center justify-between pb-4 border-b border-[#ECE7E0]">
              <div>
                <h3 className="text-xl font-bold text-[#141414] font-display">
                  Rate Workout: {selectedClient.name}
                </h3>
                <p className="text-xs text-[#6B6760] mt-0.5">
                  Record performance score and coach feedback for this trainee.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#6B6760] hover:text-[#141414] text-sm"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs tracking-wide font-semibold text-[#6B6760] mb-2">
                  Performance Score (1 - 10): <span className="text-[#8A6100] font-bold">{ratingValue}/10</span>
                </label>
                <div className="grid grid-cols-10 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setRatingValue(score)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${
                        ratingValue === score
                          ? "bg-[#E0A100] text-[#141414] scale-105 shadow-md shadow-[#141414]/10"
                          : "bg-[#F1EDE7] text-[#4A4640] hover:bg-[#E4DED5]"
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs tracking-wide font-semibold text-[#6B6760] mb-2">
                  Coach Guidance & Session Notes
                </label>
                <textarea
                  rows={3}
                  value={trainerNotes}
                  onChange={(e) => setTrainerNotes(e.target.value)}
                  placeholder="e.g. Great intensity today on compound movements. Focus on posture during deadlifts."
                  className="w-full bg-[#F7F4EF] border border-[#ECE7E0] rounded-xl p-3 text-xs text-[#141414] focus:outline-none focus:border-[#FF5A1F] transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#ECE7E0]">
              <button
                onClick={() => setShowModal(false)}
                disabled={savingRating}
                className="px-4 py-2 rounded-lg bg-[#F1EDE7] hover:bg-[#E4DED5] text-[#4A4640] text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={submitRating}
                disabled={savingRating}
                className="px-5 py-2 rounded-lg bg-[#FF5A1F] hover:bg-[#FF7A45] text-[#141414] font-bold text-xs tracking-wide transition-all disabled:opacity-50"
              >
                {savingRating ? "Saving..." : "Save Rating & Notes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
