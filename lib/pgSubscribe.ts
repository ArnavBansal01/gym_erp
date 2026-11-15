// Replaces Firestore onSnapshot: polls GET /api/me every 3 s (PostgreSQL has no browser client) and
// hands the callback a snapshot-like object ({ exists(), data(), id }) so page code stays the same.
import { auth } from "@/lib/firebase";

const DATE_KEYS = ["createdAt", "lastActive", "lastCheckIn", "requestedAt", "approvedAt", "rejectedAt", "revokedAt", "joiningDate"];

function toTs(v: any) {
  const d = new Date(v);
  return { toDate: () => d, toMillis: () => d.getTime(), seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 };
}

function revive(data: any) {
  const out = { ...data };
  for (const k of DATE_KEYS) if (typeof out[k] === "string") out[k] = toTs(out[k]);
  if (out.plan && typeof out.plan.lastRenewed === "string") out.plan = { ...out.plan, lastRenewed: toTs(out.plan.lastRenewed) };
  return out;
}

export function subscribeUser(uid: string, onData: (snap: any) => void, onError?: (e: any) => void, intervalMs = 3000): () => void {
  let stopped = false;
  let last = "";
  let timer: any = null;

  const tick = async () => {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== uid) return;
      const token = await user.getIdToken();
      const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load profile (" + res.status + ")");
      const json = await res.json();
      if (stopped) return;
      const sig = JSON.stringify(json);
      if (sig === last) return; // only notify on change, like a real listener
      last = sig;
      onData({ id: uid, exists: () => !!json.exists, data: () => (json.exists ? revive(json.user) : undefined) });
    } catch (e) {
      if (!stopped && onError) onError(e);
    }
  };

  tick();
  timer = setInterval(tick, intervalMs);
  return () => { stopped = true; if (timer) clearInterval(timer); };
}
