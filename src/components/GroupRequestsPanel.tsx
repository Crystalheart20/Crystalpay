import React, { useEffect, useState } from "react";
import { collection, doc, query, where, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { ShieldCheck, Building2, Check, X } from "lucide-react";

interface PendingGroup {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
}

// Groups that strangers started and are waiting for the CoVest operator to approve.
export default function GroupRequestsPanel() {
  const [pending, setPending] = useState<PendingGroup[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query(collection(db, "groups"), where("status", "==", "PENDING_REVIEW"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PendingGroup[] = snap.docs.map(d => {
          const data = d.data() as any;
          return { id: d.id, name: data.name, createdAt: data.createdAt, createdBy: data.createdBy };
        });
        list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setPending(list);
      },
      (err) => console.error("Group requests listener error:", err)
    );
    return () => unsub();
  }, []);

  const setStatus = async (group: PendingGroup, status: "ACTIVE" | "REJECTED") => {
    if (!window.confirm(
      status === "ACTIVE"
        ? `Approve "${group.name}"? The founder becomes its group head and can start running rounds.`
        : `Reject "${group.name}"? The founder will not be able to run it.`
    )) return;
    setBusyId(group.id);
    setError("");
    try {
      await updateDoc(doc(db, "groups", group.id), { status });
    } catch (e) {
      console.error(e);
      setError("Could not update that group. Are you signed in as the CoVest operator?");
    } finally {
      setBusyId(null);
    }
  };

  if (pending.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-indigo-600" />
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
          Group requests
        </h3>
        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
          {pending.length} waiting
        </span>
      </div>

      <p className="text-xs text-slate-500">
        New groups start here. Approve one to let its founder run it as group head.
      </p>

      <div className="space-y-2">
        {pending.map((g) => (
          <div
            key={g.id}
            className="flex flex-wrap items-center justify-between gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">{g.name}</p>
              <p className="text-[10px] text-slate-400">
                started {g.createdAt ? new Date(g.createdAt).toLocaleString() : "recently"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStatus(g, "ACTIVE")}
                disabled={busyId === g.id}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[10px] font-extrabold"
              >
                <Check className="w-3 h-3" /> Approve
              </button>
              <button
                onClick={() => setStatus(g, "REJECTED")}
                disabled={busyId === g.id}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500 text-[10px] font-extrabold"
              >
                <X className="w-3 h-3" /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

      <p className="text-[10px] text-slate-400 flex items-center gap-1">
        <ShieldCheck className="w-3 h-3" />
        A group head only ever sees and changes their own group.
      </p>
    </div>
  );
}
