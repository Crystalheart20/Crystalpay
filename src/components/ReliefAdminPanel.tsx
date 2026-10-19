import React, { useEffect, useState } from "react";
import { collection, doc, query, where, onSnapshot, runTransaction, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { ReliefContribution, ReliefMember, ReliefWithdrawal, ReliefRepayment, ReliefRequest } from "./ReliefFund";
import { Clock, CheckCircle, Wallet, Users as UsersIcon, Coins, ArrowUpRight, ArrowDownRight, Hourglass } from "lucide-react";

interface Props {
  groupId?: string;
  adminEmail?: string | null;
}

export default function ReliefAdminPanel({ groupId, adminEmail }: Props) {
  const [pending, setPending] = useState<ReliefContribution[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<ReliefWithdrawal[]>([]);
  const [pendingRepayments, setPendingRepayments] = useState<ReliefRepayment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ---- Overall fund monitor (always visible) ----
  const [fundMembers, setFundMembers] = useState<ReliefMember[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<ReliefRequest[]>([]);
  const [showBreakdown, setShowBreakdown] = useState(false);

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

  // ---- Overall fund monitor: live totals for this group ----
  useEffect(() => {
    const q = groupId
      ? query(collection(db, "reliefMembers"), where("groupId", "==", groupId))
      : collection(db, "reliefMembers") as any;
    const unsub = onSnapshot(
      q as any,
      (snap: any) => setFundMembers(snap.docs.map((d: any) => d.data() as ReliefMember)),
      (err: any) => console.error("Relief members monitor error:", err)
    );
    return () => unsub();
  }, [groupId]);

  useEffect(() => {
    const q = groupId
      ? query(collection(db, "reliefRequests"), where("groupId", "==", groupId))
      : collection(db, "reliefRequests") as any;
    const unsub = onSnapshot(
      q as any,
      (snap: any) => {
        const all = snap.docs.map((d: any) => d.data() as ReliefRequest);
        setApprovedRequests(all.filter((r: ReliefRequest) => r.status === "APPROVED"));
      },
      (err: any) => console.error("Relief requests monitor error:", err)
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

  // ---- Derived overall totals (CONFIRMED balances only) ----
  const fundBalance = fundMembers.reduce((s, m) => s + (m.balance || 0), 0);
  const fundTotalContributed = fundMembers.reduce((s, m) => s + (m.totalContributed || 0), 0);
  const fundMemberCount = fundMembers.filter((m) => m.isActive).length;
  const pendingDepositTotal = pending.reduce((s, c) => s + (c.amount || 0), 0);
  const pendingWithdrawalTotal = pendingWithdrawals.reduce((s, w) => s + (w.amount || 0), 0);
  const pendingRepayTotal = pendingRepayments.reduce((s, r) => s + (r.amount || 0), 0);
  const outstandingAdvances = approvedRequests.reduce((s, r) => s + ((r as any).remainingRepayAmount ?? (r as any).amount ?? 0), 0);
  const outstandingCount = approvedRequests.length;
  const sortedFundMembers = [...fundMembers].sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const hasAnyPending = pending.length > 0 || pendingWithdrawals.length > 0 || pendingRepayments.length > 0;

  return (
    <div className="space-y-4">
      {/* ---- Overall Relief Fund Monitor — always visible ---- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-black tracking-widest text-slate-700 uppercase flex items-center gap-1.5">
            <Wallet className="h-4 w-4 text-indigo-600" /> Relief Fund — Overall balance
          </h3>
          <span className="text-[10px] font-bold text-slate-400 border border-slate-200 rounded-full px-2 py-0.5 whitespace-nowrap">
            {fundMemberCount} member{fundMemberCount !== 1 ? "s" : ""} · live
          </span>
        </div>

        <div className="px-4 pb-3">
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">What should be in the Relief bank account (Moniepoint 5361765947)</p>
            <p className="text-2xl font-black text-slate-900 mt-1">₦{fundBalance.toLocaleString()}</p>
            <p className="text-[11px] text-slate-500 mt-1">Sum of every member&apos;s <strong>CONFIRMED</strong> balance. Pending deposits, withdrawals and repayments are <strong>not</strong> counted until you tap Confirm after your bank check.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
              <p className="text-[10px] font-bold tracking-widest text-emerald-700 uppercase flex items-center gap-1"><Coins className="h-3 w-3" /> Lifetime in</p>
              <p className="text-sm font-black text-emerald-900 mt-1">₦{fundTotalContributed.toLocaleString()}</p>
              <p className="text-[10px] text-emerald-700/70">all confirmed deposits</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
              <p className="text-[10px] font-bold tracking-widest text-indigo-700 uppercase flex items-center gap-1"><UsersIcon className="h-3 w-3" /> Active members</p>
              <p className="text-sm font-black text-indigo-900 mt-1">{fundMemberCount}</p>
              <p className="text-[10px] text-indigo-600">{fundMembers.length} record{fundMembers.length !== 1 ? "s" : ""} in this group</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p className="text-[10px] font-bold tracking-widest text-amber-700 uppercase flex items-center gap-1"><Hourglass className="h-3 w-3" /> Loans out</p>
              <p className="text-sm font-black text-amber-900 mt-1">₦{outstandingAdvances.toLocaleString()}</p>
              <p className="text-[10px] text-amber-700">{outstandingCount} advance{outstandingCount !== 1 ? "s" : ""} approved &amp; not yet repaid</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Pending</p>
              <div className="text-[11px] font-bold text-slate-800 mt-1 flex flex-col gap-0.5">
                <span className="flex items-center gap-1"><ArrowUpRight className="h-3 w-3 text-emerald-600" /> +₦{pendingDepositTotal.toLocaleString()} deposits</span>
                <span className="flex items-center gap-1"><ArrowDownRight className="h-3 w-3 text-rose-600" /> −₦{pendingWithdrawalTotal.toLocaleString()} withdrawals</span>
                {pendingRepayTotal > 0 && <span className="flex items-center gap-1"><ArrowUpRight className="h-3 w-3 text-indigo-600" /> +₦{pendingRepayTotal.toLocaleString()} repayments</span>}
                {pendingDepositTotal === 0 && pendingWithdrawalTotal === 0 && pendingRepayTotal === 0 && <span className="text-slate-400 font-normal">Nothing pending</span>}
              </div>
            </div>
          </div>

          {!hasAnyPending ? (
            <p className="text-[11px] text-emerald-700 flex items-center gap-1.5 mt-3 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2"><CheckCircle className="h-3.5 w-3.5" /> No pending items — the bank balance should match the Fund Balance above.</p>
          ) : (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              Pending items are <strong>not</strong> in the Fund Balance until you confirm. After you check Moniepoint 5361765947, tap Confirm below — the total updates automatically.
            </p>
          )}

          <button onClick={() => setShowBreakdown((v) => !v)} className="mt-3 w-full text-xs font-bold text-indigo-600 hover:text-indigo-700 border border-indigo-100 hover:bg-indigo-50 rounded-xl py-2 transition">
            {showBreakdown ? "Hide member breakdown" : `Show member breakdown (${fundMembers.length})`}
          </button>

          {showBreakdown && (
            fundMembers.length === 0 ? (
              <p className="text-xs text-slate-400 italic mt-3 text-center py-4 border border-dashed border-slate-200 rounded-xl">No Relief members yet for this group.</p>
            ) : (
              <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
                        <th className="text-left px-3 py-2">Member</th>
                        <th className="text-right px-3 py-2">Balance</th>
                        <th className="text-right px-3 py-2">Lifetime</th>
                        <th className="text-left px-3 py-2">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFundMembers.map((m) => (
                        <tr key={`${m.groupId}_${m.memberId}`} className="border-t border-slate-100">
                          <td className="px-3 py-2"><span className="font-bold text-slate-800">{m.memberName || m.memberId.slice(0, 8)}</span> <span className="text-slate-400 text-[10px]">{m.isActive ? "" : "· inactive"}</span></td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">₦{(m.balance || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-500">₦{(m.totalContributed || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-slate-500">{m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bg-slate-50 px-3 py-2 flex justify-between text-[11px] font-bold">
                  <span className="text-slate-600">Total</span>
                  <span className="font-mono text-slate-900">₦{fundBalance.toLocaleString()} · ₦{fundTotalContributed.toLocaleString()} lifetime</span>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {!hasAnyPending && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="text-xs font-bold text-slate-600">No pending Deposits / Withdrawals / Repayments right now. Anything new from members will appear below after they tap Deposit / Request Withdrawal / I repaid.</p>
        </div>
      )}

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
