import React, { useEffect, useState } from "react";
import { collection, doc, query, where, onSnapshot, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import { ReliefContribution, ReliefMember } from "./ReliefFund";
import { Clock, CheckCircle } from "lucide-react";

interface Props {
  groupId?: string;
  adminEmail?: string | null;
}

export default function ReliefAdminPanel({ groupId, adminEmail }: Props) {
  const [pending, setPending] = useState<ReliefContribution[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const q = groupId
      ? query(collection(db, "reliefContributions"), where("groupId", "==", groupId), where("status", "==", "PENDING"))
      : query(collection(db, "reliefContributions"), where("status", "==", "PENDING"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ReliefContribution);
        list.sort((a, b) => (a.createdAt || a.date) < (b.createdAt || b.date) ? 1 : -1);
        setPending(list);
      },
      (err) => console.error("Relief pending listener error:", err)
    );
    return () => unsub();
  }, [groupId]);

  const handleConfirm = async (c: ReliefContribution) => {
    if (!c.id) return;
    setBusyId(c.id);
    try {
      await runTransaction(db, async (tx) => {
        const contribRef = doc(db, "reliefContributions", c.id);
        const contribSnap = await tx.get(contribRef);
        if (!contribSnap.exists()) throw new Error("Contribution not found");
        const data = contribSnap.data() as ReliefContribution;
        if ((data as any).status !== "PENDING") return;
        const memberDocId = `${data.groupId}_${data.memberId}`;
        const memberRef = doc(db, "reliefMembers", memberDocId);
        const memberSnap = await tx.get(memberRef);
        if (!memberSnap.exists()) throw new Error("Member fund record not found");
        const member = memberSnap.data() as ReliefMember;
        tx.update(memberRef, {
          balance: member.balance + data.amount,
          totalContributed: member.totalContributed + data.amount,
        });
        tx.update(contribRef, {
          status: "CONFIRMED",
          confirmedAt: new Date().toISOString(),
          confirmedBy: adminEmail || "admin",
        });
      });
    } catch (e) {
      console.error("Confirm relief contribution failed:", e);
      alert("Confirm failed. Check console and try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (c: ReliefContribution) => {
    if (!c.id) return;
    if (!confirm(`Reject ${c.memberName || c.memberId}'s ₦${c.amount.toLocaleString()} contribution? This will not credit their balance.`)) return;
    setBusyId(c.id);
    try {
      await runTransaction(db, async (tx) => {
        const contribRef = doc(db, "reliefContributions", c.id);
        const contribSnap = await tx.get(contribRef);
        if (!contribSnap.exists()) throw new Error("Contribution not found");
        const data = contribSnap.data() as ReliefContribution;
        if ((data as any).status !== "PENDING") return;
        tx.update(contribRef, {
          status: "REJECTED",
          confirmedAt: new Date().toISOString(),
          confirmedBy: adminEmail || "admin",
        });
      });
    } catch (e) {
      console.error("Reject relief contribution failed:", e);
      alert("Reject failed. Check console and try again.");
    } finally {
      setBusyId(null);
    }
  };

  if (pending.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
        <h3 className="text-xs font-black tracking-widest text-slate-500 uppercase flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4 text-emerald-500" /> Relief Fund — No Pending Contributions
        </h3>
        <p className="text-[11px] text-slate-400 mt-1">When a member taps I Paid in the Relief Fund, it appears here for you to confirm after checking the separate bank account.</p>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3 shadow-sm">
      <h3 className="text-xs font-black tracking-widest text-amber-800 uppercase flex items-center gap-1.5">
        <Clock className="h-4 w-4" /> Relief Fund — {pending.length} Pending — Needs Your Bank Check
      </h3>
      <p className="text-[11px] text-amber-700 leading-snug">
        Members sent to the separate Relief account and tapped I Paid. Check the bank, then tap <strong>Confirm</strong> to credit their Relief balance. <strong>Reject</strong> if not seen.
      </p>
      <div className="space-y-2">
        {pending.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-amber-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs">
              <p className="font-bold text-slate-800">{c.memberName || c.memberId} <span className="font-normal text-slate-400">· {c.groupId}</span></p>
              <p className="text-[11px] text-slate-500 font-mono">₦{c.amount.toLocaleString()} · {new Date(c.createdAt || c.date).toLocaleString()} · {c.id.slice(0, 8)}…</p>
              {c.senderName && <p className="text-[11px] text-slate-400">Sender: {c.senderName}</p>}
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => handleReject(c)}
                disabled={busyId === c.id}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-rose-600 text-xs font-bold disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => handleConfirm(c)}
                disabled={busyId === c.id}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold border border-emerald-600 disabled:opacity-50"
              >
                {busyId === c.id ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
