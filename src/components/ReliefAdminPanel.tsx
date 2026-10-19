import React, { useEffect, useState } from "react";
import { collection, doc, query, where, onSnapshot, runTransaction, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { ReliefContribution, ReliefMember, ReliefWithdrawal, ReliefRepayment } from "./ReliefFund";
import { Clock, CheckCircle } from "lucide-react";

interface Props {
  groupId?: string;
  adminEmail?: string | null;
}

export default function ReliefAdminPanel({ groupId, adminEmail }: Props) {
  const [pending, setPending] = useState<ReliefContribution[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<ReliefWithdrawal[]>([]);
  const [pendingRepayments, setPendingRepayments] = useState<ReliefRepayment[]>([]);
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

  useEffect(() => {
    const q = groupId
      ? query(collection(db, "reliefWithdrawals"), where("groupId", "==", groupId), where("status", "==", "PENDING"))
      : query(collection(db, "reliefWithdrawals"), where("status", "==", "PENDING"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ReliefWithdrawal);
        list.sort((a, b) => (a.createdAt || a.date) < (b.createdAt || b.date) ? 1 : -1);
        setPendingWithdrawals(list);
      },
      (err) => console.error("Relief pending withdrawals listener error:", err)
    );
    return () => unsub();
  }, [groupId]);

  useEffect(() => {
    const q = query(collection(db, "reliefRepayments"), where("status", "==", "PENDING"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ReliefRepayment);
        if (groupId) {
          const filtered = list.filter((x) => x.groupId === groupId);
          filtered.sort((a, b) => (a.createdAt || a.paidAt) < (b.createdAt || b.paidAt) ? 1 : -1);
          setPendingRepayments(filtered);
        } else {
          list.sort((a, b) => (a.createdAt || a.paidAt) < (b.createdAt || b.paidAt) ? 1 : -1);
          setPendingRepayments(list);
        }
      },
      (err) => console.error("Relief pending repayments listener error:", err)
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

  const handleConfirmWithdrawal = async (w: ReliefWithdrawal) => {
    if (!w.id) return;
    setBusyId(w.id);
    try {
      await runTransaction(db, async (tx) => {
        const wRef = doc(db, "reliefWithdrawals", w.id);
        const wSnap = await tx.get(wRef);
        if (!wSnap.exists()) throw new Error("Withdrawal not found");
        const data = wSnap.data() as ReliefWithdrawal;
        if ((data as any).status !== "PENDING") return;
        const memberDocId = `${data.groupId}_${data.memberId}`;
        const memberRef = doc(db, "reliefMembers", memberDocId);
        const memberSnap = await tx.get(memberRef);
        if (!memberSnap.exists()) throw new Error("Member fund record not found");
        const member = memberSnap.data() as ReliefMember;
        if (data.amount > member.balance) throw new Error("Insufficient balance");
        tx.update(memberRef, { balance: member.balance - data.amount });
        tx.update(wRef, { status: "CONFIRMED", confirmedAt: new Date().toISOString(), confirmedBy: adminEmail || "admin" });
      });
    } catch (e) {
      console.error("Confirm relief withdrawal failed:", e);
      alert("Confirm failed. Check console and try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectWithdrawal = async (w: ReliefWithdrawal) => {
    if (!w.id) return;
    if (!confirm(`Reject ${w.memberName || w.memberId} - withdraw ₦${w.amount.toLocaleString()}?`)) return;
    setBusyId(w.id);
    try {
      await runTransaction(db, async (tx) => {
        const wRef = doc(db, "reliefWithdrawals", w.id);
        const wSnap = await tx.get(wRef);
        if (!wSnap.exists()) throw new Error("Withdrawal not found");
        const data = wSnap.data() as ReliefWithdrawal;
        if ((data as any).status !== "PENDING") return;
        tx.update(wRef, { status: "REJECTED", confirmedAt: new Date().toISOString(), confirmedBy: adminEmail || "admin" });
      });
    } catch (e) {
      console.error("Reject relief withdrawal failed:", e);
      alert("Reject failed. Check console and try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmRepayment = async (r: ReliefRepayment) => {
    if (!r.id || !r.requestId) return;
    setBusyId(r.id);
    try {
      await runTransaction(db, async (tx) => {
        const repayRef = doc(db, "reliefRepayments", r.id);
        const repaySnap = await tx.get(repayRef);
        if (!repaySnap.exists()) throw new Error("Repayment not found");
        const data = repaySnap.data() as ReliefRepayment;
        if ((data as any).status !== "PENDING") return;
        const reqRef = doc(db, "reliefRequests", data.requestId);
        const reqSnap = await tx.get(reqRef);
        if (!reqSnap.exists()) throw new Error("Request not found");
        const req = reqSnap.data() as any;
        if (req.status !== "APPROVED") throw new Error("Request not approved");
        const total = req.amount as number;
        const months = (req.repaymentMonths as number) || 6;
        const paid = (req.paidInstalments as number) || 0;
        const remaining = (req.remainingRepayAmount as number) ?? total;
        const newPaid = paid + 1;
        const newRemaining = Math.max(0, remaining - data.amount);
        const fullyRepaid = newRemaining === 0 || newPaid >= months;
        tx.update(repayRef, { status: "CONFIRMED", confirmedAt: new Date().toISOString(), confirmedBy: adminEmail || "admin" });
        const update: Record<string, unknown> = { paidInstalments: newPaid, remainingRepayAmount: newRemaining };
        if (fullyRepaid) {
          update.status = "REPAID";
          update.repaidAt = new Date().toISOString();
        }
        tx.update(reqRef, update);
      });
    } catch (e) {
      console.error("Confirm relief repayment failed:", e);
      alert("Confirm failed. Check console and try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectRepayment = async (r: ReliefRepayment) => {
    if (!r.id) return;
    if (!confirm(`Reject repayment ₦${r.amount.toLocaleString()}?`)) return;
    setBusyId(r.id);
    try {
      await updateDoc(doc(db, "reliefRepayments", r.id), {
        status: "REJECTED",
        confirmedAt: new Date().toISOString(),
        confirmedBy: adminEmail || "admin",
      });
    } catch (e) {
      console.error("Reject repayment failed:", e);
      alert("Reject failed.");
    } finally {
      setBusyId(null);
    }
  };

  if (pending.length === 0 && pendingWithdrawals.length === 0 && pendingRepayments.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
        <h3 className="text-xs font-black tracking-widest text-slate-500 uppercase flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4 text-emerald-500" /> Relief Fund — No Pending
        </h3>
        <p className="text-[11px] text-slate-400 mt-1">When a member taps Deposit / Request Withdrawal / Repays an advance, it appears here for you to confirm after the bank check.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
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
                  <button onClick={() => handleReject(c)} disabled={busyId === c.id} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-rose-600 text-xs font-bold disabled:opacity-50">
                    Reject
                  </button>
                  <button onClick={() => handleConfirm(c)} disabled={busyId === c.id} className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold border border-emerald-600 disabled:opacity-50">
                    {busyId === c.id ? "Working…" : "Confirm"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {pendingWithdrawals.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <h3 className="text-xs font-black tracking-widest text-rose-800 uppercase flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Relief Fund — {pendingWithdrawals.length} Withdrawals Pending — Pay Then Confirm
          </h3>
          <p className="text-[11px] text-rose-700 leading-snug">
            Members requested to withdraw to their bank. Transfer from the Relief account (Moniepoint 5361765947) then tap <strong>Confirm sent</strong>.
          </p>
          <div className="space-y-2">
            {pendingWithdrawals.map((w) => (
              <div key={w.id} className="bg-white rounded-xl border border-rose-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs">
                  <p className="font-bold text-slate-800">{w.memberName || w.memberId} <span className="font-normal text-slate-400">· {w.groupId}</span></p>
                  <p className="text-[11px] text-slate-500 font-mono">₦{w.amount.toLocaleString()} · {new Date(w.createdAt || w.date).toLocaleString()} · {w.id.slice(0, 8)}…</p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button onClick={() => handleRejectWithdrawal(w)} disabled={busyId === w.id} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-rose-600 text-xs font-bold disabled:opacity-50">Reject</button>
                  <button onClick={() => handleConfirmWithdrawal(w)} disabled={busyId === w.id} className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold border border-emerald-600 disabled:opacity-50">{busyId === w.id ? "Working…" : "Confirm sent"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {pendingRepayments.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <h3 className="text-xs font-black tracking-widest text-indigo-800 uppercase flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Relief Fund — {pendingRepayments.length} Repayments Pending — Confirm Bank Receipt
          </h3>
          <p className="text-[11px] text-indigo-700 leading-snug">
            Borrowers tapped I repaid and sent to Moniepoint 5361765947. Check the bank, then tap <strong>Confirm</strong>.
          </p>
          <div className="space-y-2">
            {pendingRepayments.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-indigo-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs">
                  <p className="font-bold text-slate-800">₦{r.amount.toLocaleString()} · {r.memberId.slice(0, 8)}… <span className="font-normal text-slate-400">· {r.requestId.slice(0, 8)}…</span></p>
                  <p className="text-[11px] text-slate-500 font-mono">{new Date(r.createdAt || r.paidAt).toLocaleString()} · {r.id.slice(0, 8)}…</p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button onClick={() => handleRejectRepayment(r)} disabled={busyId === r.id} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-rose-600 text-xs font-bold disabled:opacity-50">Reject</button>
                  <button onClick={() => handleConfirmRepayment(r)} disabled={busyId === r.id} className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold border border-emerald-600 disabled:opacity-50">{busyId === r.id ? "Working…" : "Confirm"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
