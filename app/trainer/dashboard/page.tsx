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
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <IconRefresh className="animate-spin text-emerald-400" size={32} />
          <p className="text-sm font-medium tracking-wide">Loading Trainer Terminal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* TOP HEADER */}
      <header className="border-b border-slate-800 bg-[#0f172a]/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-700 flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
              <IconDumbbell size={22} />
            </div>
            <div>
              <span className="font-extrabold tracking-wider text-base uppercase text-white">Iconic Gym</span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest bg-teal-500/10 text-teal-400 border border-teal-500/20">
                Trainer Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                trainerStats.currentStatus === "IN"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  trainerStats.currentStatus === "IN" ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                }`}
              />
              {trainerStats.currentStatus === "IN" ? "On Duty" : "Off Duty"}
            </span>

            <button
              onClick={() => router.push("/trainer/attendance")}
              className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-teal-500/20"
            >
              <IconQrCode size={16} />
              <span>Duty Terminal</span>
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

      {/* MAIN CONTENT AREA */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex-1 flex flex-col gap-6">
        {/* WELCOME BAR & TABS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Coach {trainerStats.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Specialization: <span className="text-slate-200">{trainerStats.specialization}</span> ·{" "}
              {assignedClients.length} Assigned Clients
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab("assigned")}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "assigned"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              My Clients ({assignedClients.length})
            </button>
            <button
              onClick={() => setActiveTab("today")}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "today"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Active Today ({clientsData.filter((c) => c.isPresent).length})
            </button>
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "all"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All Members ({clientsData.length})
            </button>
            <button
              onClick={() => setActiveTab("duty")}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "duty"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Duty Stats
            </button>
          </div>
        </div>

        {/* TAB 1: ASSIGNED CLIENTS */}
        {activeTab === "assigned" && (
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Assigned Trainees Roster</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Manage assigned client workout consistency, membership standing, and feedback.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                {assignedClients.length} Trainees Assigned
              </span>
            </div>

            {assignedClients.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <IconUser size={36} className="mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-slate-300">No trainees assigned to you yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Members who select you as their personal trainer during registration will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-800">
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
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {assignedClients.map((client) => (
                      <tr key={client.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-4 px-6 font-semibold text-white">{client.name}</td>
                        <td className="py-4 px-6 text-slate-400">{client.phone}</td>
                        <td className="py-4 px-6">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                              client.membership.status === "ACTIVE"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : client.membership.status === "EXPIRING_SOON"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
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
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                client.isPresent ? "bg-emerald-400" : "bg-slate-500"
                              }`}
                            />
                            {client.isPresent ? "Checked In" : "Absent"}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="font-bold text-amber-400">
                            {client.rating ? `${client.rating} / 10` : "-"}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => handleRateClick(client)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all"
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
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white">Present on Gym Floor Today</h2>
              <p className="text-xs text-slate-400 mt-1">
                Members who have recorded a check-in at the facility entrance terminal.
              </p>
            </div>

            {clientsData.filter((c) => c.isPresent).length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <IconClock size={36} className="mx-auto mb-3 opacity-40" />
                <p className="font-semibold text-slate-300">No members checked in yet today</p>
                <p className="text-xs text-slate-500 mt-1">
                  When members scan their entry QR, their presence will be reflected here in real time.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-6">Member Name</th>
                      <th className="py-3.5 px-6">Phone</th>
                      <th className="py-3.5 px-6">Assigned Trainer</th>
                      <th className="py-3.5 px-6">Membership</th>
                      <th className="py-3.5 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {clientsData
                      .filter((c) => c.isPresent)
                      .map((client) => (
                        <tr key={client.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-4 px-6 font-semibold text-white">{client.name}</td>
                          <td className="py-4 px-6 text-slate-400">{client.phone}</td>
                          <td className="py-4 px-6">{client.assignedTrainer?.name || "General"}</td>
                          <td className="py-4 px-6">
                            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {client.membership.planName}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => handleRateClick(client)}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all"
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
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white">All Registered Gym Members</h2>
              <p className="text-xs text-slate-400 mt-1">
                Complete member directory across all training tiers.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-6">Member Name</th>
                    <th className="py-3.5 px-6">Phone</th>
                    <th className="py-3.5 px-6">Trainer</th>
                    <th className="py-3.5 px-6">Membership Standing</th>
                    <th className="py-3.5 px-6">Total Sessions</th>
                    <th className="py-3.5 px-6">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {clientsData.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-4 px-6 font-semibold text-white">{client.name}</td>
                      <td className="py-4 px-6 text-slate-400">{client.phone}</td>
                      <td className="py-4 px-6">{client.assignedTrainer?.name || "Not Assigned"}</td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                            client.membership.status === "ACTIVE"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : client.membership.status === "EXPIRING_SOON"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {client.membership.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-semibold">{client.attendanceCount}</td>
                      <td className="py-4 px-6 font-bold text-amber-400">
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
            <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white">Duty Attendance Consistency</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Track your professional shifts and duty check-in record.
                </p>
              </div>

              <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Consistency Score
                </span>
                <p className="text-4xl font-extrabold text-emerald-400 mt-2">
                  {trainerStats.attendanceRate}%
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Shifts Attended:{" "}
                  <strong className="text-white">{trainerStats.shiftsAttended}</strong> /{" "}
                  {trainerStats.shiftsAssigned} assigned
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => router.push("/trainer/attendance")}
                  className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shadow-teal-500/20"
                >
                  <IconQrCode size={18} />
                  <span>Scan Duty Entrance / Exit</span>
                </button>
              </div>
            </div>

            <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white">Management Notices</h3>
                <p className="text-xs text-slate-400 mt-1">Official communications from gym admin.</p>
              </div>

              <div className="space-y-3">
                {trainerStats.messages.map((msg, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 leading-relaxed"
                  >
                    <span className="text-emerald-400 font-bold block mb-1">Notice #{i + 1}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] rounded-2xl border border-slate-800 w-full max-w-lg p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Rate Workout: {selectedClient.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Record performance score and coach feedback for this trainee.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-slate-400 mb-2">
                  Performance Score (1 - 10): <span className="text-amber-400 font-bold">{ratingValue}/10</span>
                </label>
                <div className="grid grid-cols-10 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setRatingValue(score)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${
                        ratingValue === score
                          ? "bg-amber-400 text-slate-950 scale-105 shadow-md shadow-amber-400/20"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-slate-400 mb-2">
                  Coach Guidance & Session Notes
                </label>
                <textarea
                  rows={3}
                  value={trainerNotes}
                  onChange={(e) => setTrainerNotes(e.target.value)}
                  placeholder="e.g. Great intensity today on compound movements. Focus on posture during deadlifts."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowModal(false)}
                disabled={savingRating}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={submitRating}
                disabled={savingRating}
                className="px-5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
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
