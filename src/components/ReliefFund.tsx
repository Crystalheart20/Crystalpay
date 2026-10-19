import React, { useState, useEffect, useRef } from "react";
import { db, handleFirestoreError, OperationType } from "../firebase";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  onSnapshot,
  runTransaction,
  updateDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";

// ============================================================
// TYPES
// ============================================================

export interface ReliefMember {
  memberId: string;
  groupId: string;
  memberName: string;
  balance: number; // current withdrawable balance (sum of contributions - withdrawals)
  totalContributed: number; // lifetime total, never decreases (used for history/trust, not for the 2.5x cap)
  isActive: boolean;
  joinedAt: string;
}

export interface ReliefContribution {
  id: string;
  memberId: string;
  groupId: string;
  amount: number;
  date: string;
  memberName?: string;
  status?: "PENDING" | "CONFIRMED" | "REJECTED";
  transactionRef?: string;
  senderName?: string;
  createdAt?: string;
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface ReliefWithdrawal {
  id: string;
  memberId: string;
  groupId: string;
  amount: number;
  date: string;
}

export type ReliefRequestStatus = "VOTING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface ReliefRequest {
  id: string;
  groupId: string;
  memberId: string;
  memberName: string;
  amount: number;
  reason: string;
  status: ReliefRequestStatus;
  createdAt: string;
  votingDeadline: string;
  balanceAtRequest: number;
  repaymentMonths: number;
  // filled in when voting closes
  settledAt?: string;
  yesVotes?: number;
  noVotes?: number;
  votesCast?: number;
  settleNote?: string;
}

// Anonymous voting is split in two on purpose:
//  - a receipt says WHO has voted (so nobody votes twice), but not how
//  - a ballot says HOW a vote went, but not who cast it
export interface ReliefVoteReceipt {
  requestId: string;
  voterId: string;
  groupId: string;
}

export interface ReliefBallot {
  id: string;
  requestId: string;
  groupId: string;
  vote: "YES" | "NO";
}

// ---- Rules agreed for relief requests ----
// TESTING: set MIN_MEMBERSHIP_MONTHS to 0 only on your own machine to try the form.
// It must be 3 when you commit and push.
const MIN_MEMBERSHIP_MONTHS = 3; // must have been in the fund this long before requesting
const MAX_REQUEST_MULTIPLE = 2.5; // max request = current balance x this
const VOTING_HOURS = 24; // how long members have to vote
// Member-initiated contributions are now enabled as PENDING — admin confirms after bank check.
// Direct Add/Withdraw without admin is OFF: nothing here moves real money, so a member could
// type any amount and credit themselves. Member tabs create PENDING records; admin confirms.
const ALLOW_SELF_SERVICE_MONEY = false;
const REPAYMENT_MONTHS = 6; // approved payouts are repaid in this many monthly instalments

// ============================================================
// PROPS
// ============================================================

interface ReliefFundProps {
  groupId: string;
  memberId: string; // the currently logged-in member
  memberName: string;
  isMemberActive: boolean; // is this person an active Ajo member at all (eligible to opt in)
  hasPendingOwnRequest?: boolean; // wired up in Step 2 — for now always pass false
}

// ============================================================
// COMPONENT
// ============================================================

export default function ReliefFund({
  groupId,
  memberId,
  memberName,
  isMemberActive,
  hasPendingOwnRequest: hasPendingOwnRequestProp = false,
  reliefAccountName = "Moharb Business World",
  reliefAccountNo = "5361765947",
  reliefBankName = "Moniepoint MFB",
}: ReliefFundProps & { reliefAccountName?: string; reliefAccountNo?: string; reliefBankName?: string }) {
  const [reliefMember, setReliefMember] = useState<ReliefMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [contributeAmount, setContributeAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [showDepositSheet, setShowDepositSheet] = useState(false);
  const [pendingDepositAmount, setPendingDepositAmount] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{ type: "contribution" | "withdrawal"; amount: number; date: string; label?: string; status?: string }>
  >([]);

  const reliefMemberDocId = `${groupId}_${memberId}`;

  // ---- Relief requests ----
  const [myRequests, setMyRequests] = useState<ReliefRequest[]>([]);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "reliefRequests"),
      where("groupId", "==", groupId),
      where("memberId", "==", memberId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ReliefRequest);
        list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setMyRequests(list);
      },
      (err) => console.error("Relief requests listener error:", err)
    );
    return () => unsub();
  }, [groupId, memberId]);

  // ---- Voting (anonymous) ----
  const [groupVoting, setGroupVoting] = useState<ReliefRequest[]>([]);
  const [groupMembers, setGroupMembers] = useState<ReliefMember[]>([]);
  const [groupReceipts, setGroupReceipts] = useState<ReliefVoteReceipt[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const [votingId, setVotingId] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const settling = useRef<Set<string>>(new Set());

  // re-check deadlines every 30 seconds while the card is open
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // all requests in this group that are still being voted on
  useEffect(() => {
    const q = query(
      collection(db, "reliefRequests"),
      where("groupId", "==", groupId),
      where("status", "==", "VOTING")
    );
    const unsub = onSnapshot(
      q,
      (snap) => setGroupVoting(snap.docs.map((d) => d.data() as ReliefRequest)),
      (err) => console.error("Voting requests listener error:", err)
    );
    return () => unsub();
  }, [groupId]);

  // everyone in the fund for this group (to know who is allowed to vote)
  useEffect(() => {
    const q = query(collection(db, "reliefMembers"), where("groupId", "==", groupId));
    const unsub = onSnapshot(
      q,
      (snap) => setGroupMembers(snap.docs.map((d) => d.data() as ReliefMember)),
      (err) => console.error("Fund members listener error:", err)
    );
    return () => unsub();
  }, [groupId]);

  // who has voted (not how)
  useEffect(() => {
    const q = query(collection(db, "reliefVoteReceipts"), where("groupId", "==", groupId));
    const unsub = onSnapshot(
      q,
      (snap) => setGroupReceipts(snap.docs.map((d) => d.data() as ReliefVoteReceipt)),
      (err) => console.error("Vote receipts listener error:", err)
    );
    return () => unsub();
  }, [groupId]);

  // Members who may vote on a request: in the fund, not the requester, and joined before the request was made
  const eligibleVoters = (r: ReliefRequest) =>
    groupMembers.filter(
      (m) => m.isActive && m.memberId !== r.memberId && m.joinedAt <= r.createdAt
    );

  // Close a request once its 24 hours are up, or everyone eligible has voted.
  // There is no server, so whichever member's browser notices first does this.
  const settleRequest = async (r: ReliefRequest) => {
    if (settling.current.has(r.id)) return;
    settling.current.add(r.id);
    try {
      // read fresh from the database so we never settle on stale numbers
      const [ballotSnap, receiptSnap, memberSnap] = await Promise.all([
        getDocs(query(collection(db, "reliefBallots"), where("requestId", "==", r.id))),
        getDocs(query(collection(db, "reliefVoteReceipts"), where("requestId", "==", r.id))),
        getDocs(query(collection(db, "reliefMembers"), where("groupId", "==", r.groupId))),
      ]);
      const ballots = ballotSnap.docs.map((d) => d.data() as ReliefBallot);
      const receipts = receiptSnap.docs.map((d) => d.data() as ReliefVoteReceipt);
      const eligible = memberSnap.docs
        .map((d) => d.data() as ReliefMember)
        .filter((m) => m.isActive && m.memberId !== r.memberId && m.joinedAt <= r.createdAt);

      const deadlinePassed = Date.now() >= new Date(r.votingDeadline).getTime();
      const allVoted = eligible.length > 0 && receipts.length >= eligible.length;
      if (!deadlinePassed && !allVoted) return;

      const yes = ballots.filter((b) => b.vote === "YES").length;
      const no = ballots.filter((b) => b.vote === "NO").length;
      const votesCast = yes + no;

      let status: "APPROVED" | "REJECTED";
      let note = "";
      if (ballots.length !== receipts.length) {
        status = "REJECTED";
        note = "The vote count did not match the voter list, so the request was rejected. Please submit it again.";
      } else if (votesCast === 0) {
        status = "REJECTED";
        note = "No votes were cast in time.";
      } else if (yes > votesCast / 2) {
        status = "APPROVED";
      } else {
        status = "REJECTED";
      }

      await runTransaction(db, async (transaction) => {
        const ref = doc(db, "reliefRequests", r.id);
        const snap = await transaction.get(ref);
        if (!snap.exists() || (snap.data() as ReliefRequest).status !== "VOTING") return;
        transaction.update(ref, {
          status,
          settledAt: new Date().toISOString(),
          yesVotes: yes,
          noVotes: no,
          votesCast,
          settleNote: note,
        });
      });
    } catch (e) {
      console.error("Could not settle relief request:", e);
    } finally {
      settling.current.delete(r.id);
    }
  };

  // look for requests that are ready to close
  useEffect(() => {
    groupVoting.forEach((r) => {
      const deadlinePassed = nowTick >= new Date(r.votingDeadline).getTime();
      const eligible = eligibleVoters(r).length;
      const voted = groupReceipts.filter((x) => x.requestId === r.id).length;
      if (deadlinePassed || (eligible > 0 && voted >= eligible)) {
        settleRequest(r);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupVoting, groupMembers, groupReceipts, nowTick]);

  // A request still being voted on (or approved and not yet repaid) blocks withdrawals and new requests
  const hasPendingOwnRequest =
    hasPendingOwnRequestProp ||
    myRequests.some((r) => r.status === "VOTING" || r.status === "APPROVED");

  // Listen for this member's relief fund status in real time
  useEffect(() => {
    const ref = doc(db, "reliefMembers", reliefMemberDocId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setReliefMember(snap.exists() ? (snap.data() as ReliefMember) : null);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [reliefMemberDocId]);

  // Listen for this member's contribution + withdrawal history
  useEffect(() => {
    if (!reliefMember) return;

    const contribQuery = query(
      collection(db, "reliefContributions"),
      where("groupId", "==", groupId),
      where("memberId", "==", memberId)
    );
    const withdrawQuery = query(
      collection(db, "reliefWithdrawals"),
      where("groupId", "==", groupId),
      where("memberId", "==", memberId)
    );

    let contribs: ReliefContribution[] = [];
    let withdrawals: ReliefWithdrawal[] = [];

    const mergeAndSet = () => {
      const merged = [
        ...contribs.map((c) => {
          const status = (c as any).status as string | undefined;
          const label =
            status === "PENDING"
              ? "⏳ Pending contribution"
              : status === "REJECTED"
              ? "✕ Rejected"
              : "➕ Contribution";
          return {
            type: "contribution" as const,
            amount: c.amount,
            date: c.date,
            label,
            status: status || "CONFIRMED",
          };
        }),
        ...withdrawals.map((w) => ({
          type: "withdrawal" as const,
          amount: w.amount,
          date: w.date,
          label: "➖ Withdrawal",
          status: "CONFIRMED",
        })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1)) as any;
      setHistory(merged as any);
    };

    const unsub1 = onSnapshot(contribQuery, (snap) => {
      contribs = snap.docs.map((d) => d.data() as ReliefContribution);
      mergeAndSet();
    });
    const unsub2 = onSnapshot(withdrawQuery, (snap) => {
      withdrawals = snap.docs.map((d) => d.data() as ReliefWithdrawal);
      mergeAndSet();
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [reliefMember, groupId, memberId]);

  // ------------------------------------------------------------
  // OPT IN
  // ------------------------------------------------------------
  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      const newReliefMember: ReliefMember = {
        memberId,
        groupId,
        memberName,
        balance: 0,
        totalContributed: 0,
        isActive: true,
        joinedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "reliefMembers", reliefMemberDocId), newReliefMember);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `reliefMembers/${reliefMemberDocId}`);
      setError("Could not join the relief fund. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  // ------------------------------------------------------------
  // CONTRIBUTE — Deposit sheet: amount -> copy account -> Payment made
  // ------------------------------------------------------------
  const openDepositSheet = () => {
    const amount = parseFloat(contributeAmount);
    if (!amount || amount <= 0) {
      setError("Enter the amount you want to deposit.");
      return;
    }
    setError(null);
    setPendingDepositAmount(amount);
    setShowDepositSheet(true);
  };

  const copyReliefAccount = async () => {
    const text = `${reliefBankName} - ${reliefAccountName} - ${reliefAccountNo}`.trim() || reliefAccountNo || "";
    if (!text || text === "-" || text === "--") return;
    try {
      await navigator.clipboard.writeText(reliefAccountNo || text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Please copy the number manually.");
    }
  };

  const confirmPaymentMade = async () => {
    if (!pendingDepositAmount || pendingDepositAmount <= 0) {
      setError("Amount missing. Close and try again.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const contribRef = doc(collection(db, "reliefContributions"));
      const contribution: ReliefContribution = {
        id: contribRef.id,
        memberId,
        groupId,
        amount: pendingDepositAmount,
        date: new Date().toISOString(),
        memberName,
        status: "PENDING",
        senderName: memberName,
        createdAt: new Date().toISOString(),
      };
      await setDoc(contribRef, contribution);
      setShowDepositSheet(false);
      setPendingDepositAmount(null);
      setContributeAmount("");
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `reliefContributions/${memberId}`);
      setError("Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------
  // WITHDRAW
  // ------------------------------------------------------------
  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      setError("Enter a valid amount to withdraw.");
      return;
    }
    if (hasPendingOwnRequest) {
      setError(
        "You can't withdraw while you have an active relief request awaiting a vote."
      );
      return;
    }
    if (!reliefMember || amount > reliefMember.balance) {
      setError("You can't withdraw more than your current balance.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await runTransaction(db, async (transaction) => {
        const memberRef = doc(db, "reliefMembers", reliefMemberDocId);
        const memberSnap = await transaction.get(memberRef);
        if (!memberSnap.exists()) throw new Error("Relief member record not found.");

        const current = memberSnap.data() as ReliefMember;
        if (amount > current.balance) {
          throw new Error("Insufficient balance.");
        }

        transaction.update(memberRef, {
          balance: current.balance - amount,
        });

        const withdrawRef = doc(collection(db, "reliefWithdrawals"));
        const withdrawal: ReliefWithdrawal = {
          id: withdrawRef.id,
          memberId,
          groupId,
          amount,
          date: new Date().toISOString(),
        };
        transaction.set(withdrawRef, withdrawal);
      });
      setWithdrawAmount("");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `reliefMembers/${reliefMemberDocId}`);
      setError("Withdrawal failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------
  // CAST A VOTE (anonymous)
  // ------------------------------------------------------------
  const handleVote = async (r: ReliefRequest, vote: "YES" | "NO") => {
    setVoteError(null);
    if (!reliefMember) return;
    if (r.memberId === memberId) {
      setVoteError("You can't vote on your own request.");
      return;
    }
    if (reliefMember.joinedAt > r.createdAt) {
      setVoteError("Only members who were in the fund when the request was made can vote.");
      return;
    }
    if (Date.now() >= new Date(r.votingDeadline).getTime()) {
      setVoteError("Voting on this request has closed.");
      return;
    }
    if (!window.confirm("Your vote is anonymous and can't be changed. Continue?")) return;

    setVotingId(r.id);
    try {
      const batch = writeBatch(db);
      // receipt: who voted (no choice recorded)
      batch.set(doc(db, "reliefVoteReceipts", `${r.id}_${memberId}`), {
        requestId: r.id,
        voterId: memberId,
        groupId,
      });
      // ballot: the choice (no voter recorded)
      const ballotRef = doc(collection(db, "reliefBallots"));
      batch.set(ballotRef, { id: ballotRef.id, requestId: r.id, groupId, vote });
      await batch.commit();
    } catch (e) {
      console.error(e);
      setVoteError("Could not record your vote. You may have already voted on this request.");
    } finally {
      setVotingId(null);
    }
  };

  // ------------------------------------------------------------
  // REQUEST RELIEF
  // ------------------------------------------------------------
  const eligibleFromDate = reliefMember
    ? (() => {
        const d = new Date(reliefMember.joinedAt);
        d.setMonth(d.getMonth() + MIN_MEMBERSHIP_MONTHS);
        return d;
      })()
    : null;
  const oldEnough = eligibleFromDate ? new Date() >= eligibleFromDate : false;

  const handleSubmitRequest = async () => {
    setRequestError(null);
    const amount = parseFloat(requestAmount);
    const reason = requestReason.trim();

    if (!reliefMember) return;
    if (!oldEnough) {
      setRequestError(
        `You can request relief ${MIN_MEMBERSHIP_MONTHS} months after joining the fund.`
      );
      return;
    }
    if (hasPendingOwnRequest) {
      setRequestError("You already have an open relief request.");
      return;
    }
    if (!amount || amount <= 0) {
      setRequestError("Enter a valid amount.");
      return;
    }
    if (!reason) {
      setRequestError("Please give a reason for your request.");
      return;
    }
    const maxAllowed = reliefMember.balance * MAX_REQUEST_MULTIPLE;
    if (amount > maxAllowed) {
      setRequestError(
        `You can request at most ₦${maxAllowed.toLocaleString()} (2.5× your current balance).`
      );
      return;
    }

    setRequestSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const memberRef = doc(db, "reliefMembers", reliefMemberDocId);
        const memberSnap = await transaction.get(memberRef);
        if (!memberSnap.exists()) throw new Error("Relief member record not found.");
        const current = memberSnap.data() as ReliefMember;
        if (amount > current.balance * MAX_REQUEST_MULTIPLE) {
          throw new Error("Request is above 2.5x your current balance.");
        }

        const now = new Date();
        const reqRef = doc(collection(db, "reliefRequests"));
        const request: ReliefRequest = {
          id: reqRef.id,
          groupId,
          memberId,
          memberName,
          amount,
          reason,
          status: "VOTING",
          createdAt: now.toISOString(),
          votingDeadline: new Date(
            now.getTime() + VOTING_HOURS * 60 * 60 * 1000
          ).toISOString(),
          balanceAtRequest: current.balance,
          repaymentMonths: REPAYMENT_MONTHS,
        };
        transaction.set(reqRef, request);
      });
      setRequestAmount("");
      setRequestReason("");
      setShowRequestForm(false);
    } catch (e) {
      console.error(e);
      setRequestError("Could not submit your request. Please try again.");
    } finally {
      setRequestSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!window.confirm("Cancel this relief request?")) return;
    try {
      await updateDoc(doc(db, "reliefRequests", requestId), { status: "CANCELLED" });
    } catch (e) {
      console.error(e);
      setRequestError("Could not cancel the request. Please try again.");
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-5 border border-slate-200 text-sm text-slate-500">
        Loading relief fund…
      </div>
    );
  }

  // Not yet opted in
  if (!reliefMember) {
    return (
      <div className="bg-white rounded-xl p-5 border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-1">🤝 Relief Fund</h3>
        <p className="text-xs text-slate-500 mb-4">
          A separate, optional fund members can contribute to and draw on during
          emergencies — approved by a group vote. Not connected to your Ajo
          contributions.
        </p>
        {!isMemberActive ? (
          <p className="text-xs text-slate-400 italic">
            Only active group members can join the relief fund.
          </p>
        ) : (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-xl transition"
          >
            {joining ? "Joining…" : "Opt In to Relief Fund"}
          </button>
        )}
        {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
      </div>
    );
  }

  const maxRequestAmount = reliefMember.balance * 2.5;

  // other members' open requests this member may still vote on
  const votableRequests = groupVoting.filter(
    (r) =>
      r.memberId !== memberId &&
      reliefMember.joinedAt <= r.createdAt &&
      new Date(r.votingDeadline).getTime() > nowTick
  );

  // Opted in — show balance + contribute/withdraw
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200">
      <h3 className="text-sm font-bold text-slate-800 mb-1">🤝 Relief Fund</h3>

      <div className="bg-slate-50 rounded-lg p-4 my-3">
        <p className="text-xs text-slate-500">Your balance</p>
        <p className="text-2xl font-bold text-slate-800">
          ₦{reliefMember.balance.toLocaleString()}
        </p>
        <p className="text-[11px] text-slate-400 mt-1">
          Lifetime contributed: ₦{reliefMember.totalContributed.toLocaleString()} ·
          Max relief request (2.5×): ₦{maxRequestAmount.toLocaleString()}
        </p>
      </div>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {hasPendingOwnRequest && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Withdrawals and new relief requests are paused while you have an open request being voted on or approved.
        </p>
      )}

      {/* Contribute — Deposit: amount -> copy account -> Payment made */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-slate-600 mb-1 block">
          Add to Fund <span className="font-normal text-slate-400">(tap Deposit to see account)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={contributeAmount}
            onChange={(e) => setContributeAmount(e.target.value)}
            placeholder="Amount you want to deposit"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={openDepositSheet}
            disabled={submitting}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg transition whitespace-nowrap"
          >
            Deposit
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Deposit shows the Relief account to copy. After you pay in your bank app, tap Payment made — it goes pending until admin confirms.</p>
      </div>

      {showDepositSheet && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-800">Relief Fund account — pay here</p>
          <p className="text-xs text-slate-500 mt-1">
            Amount: <strong className="text-slate-800">₦{(pendingDepositAmount ?? 0).toLocaleString()}</strong>
          </p>
          <div className="mt-3 bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-[11px] text-slate-400">Bank</p>
            <p className="text-sm font-bold text-slate-800">{reliefBankName || "—"}</p>
            <p className="text-[11px] text-slate-400 mt-2">Account name</p>
            <p className="text-sm font-semibold text-slate-700">{reliefAccountName || "—"}</p>
            <p className="text-[11px] text-slate-400 mt-2">Account number</p>
            <p className="text-lg font-mono font-bold tracking-widest text-slate-900">{reliefAccountNo || "Not set — ask admin"}</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={copyReliefAccount}
                disabled={!reliefAccountNo}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg transition"
              >
                {copied ? "Copied ✓" : "Copy account number"}
              </button>
              <button
                onClick={() => { setShowDepositSheet(false); }}
                className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">After you transfer in your bank app, come back and tap below.</p>
          </div>
          <button
            onClick={confirmPaymentMade}
            disabled={submitting || !pendingDepositAmount}
            className="mt-3 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg transition"
          >
            {submitting ? "Submitting…" : "Payment made — notify admin"}
          </button>
        </div>
      )}

      {/* Withdraw — still self-service for now; will become admin-confirmed in Step 2 */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-slate-600 mb-1 block">
          Withdraw
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="Amount"
            disabled={hasPendingOwnRequest}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
          />
          <button
            onClick={handleWithdraw}
            disabled={submitting || hasPendingOwnRequest}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg transition whitespace-nowrap"
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* Requests awaiting this member's vote */}
      <div className="mb-4 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-600 mb-1">Requests awaiting your vote</p>
        <p className="text-[11px] text-slate-400 mb-2">
          Votes are anonymous. Others can see that you voted, but not how.
        </p>

        {voteError && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2">
            {voteError}
          </p>
        )}

        {votableRequests.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No requests need your vote right now.</p>
        ) : (
          <ul className="space-y-2">
            {votableRequests.map((r) => {
              const voted = groupReceipts.some(
                (x) => x.requestId === r.id && x.voterId === memberId
              );
              const votedCount = groupReceipts.filter((x) => x.requestId === r.id).length;
              return (
                <li
                  key={r.id}
                  className="border border-slate-100 rounded-lg p-3 text-xs text-slate-600"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-slate-800">{r.memberName}</span>
                    <span className="font-bold text-slate-800">
                      ₦{r.amount.toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1">{r.reason}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {votedCount} of {eligibleVoters(r).length} members have voted · closes{" "}
                    {new Date(r.votingDeadline).toLocaleString()}
                  </p>
                  {voted ? (
                    <p className="text-[11px] text-emerald-600 font-semibold mt-2">
                      ✓ You have voted
                    </p>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleVote(r, "YES")}
                        disabled={votingId === r.id}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-bold rounded-lg transition"
                      >
                        Yes, approve
                      </button>
                      <button
                        onClick={() => handleVote(r, "NO")}
                        disabled={votingId === r.id}
                        className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-bold rounded-lg transition"
                      >
                        No, decline
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Relief requests */}
      <div className="mb-4 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-600 mb-2">Relief requests</p>

        {MIN_MEMBERSHIP_MONTHS !== 3 && (
          <p className="text-[11px] font-bold text-white bg-rose-600 rounded-lg px-3 py-2 mb-2">
            TEST MODE: the {MIN_MEMBERSHIP_MONTHS}-month waiting period is changed. Set it back to 3 before pushing.
          </p>
        )}

        {requestError && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2">
            {requestError}
          </p>
        )}

        {!oldEnough ? (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            You can request relief from {eligibleFromDate?.toLocaleDateString()},{" "}
            {MIN_MEMBERSHIP_MONTHS} months after you joined the fund.
          </p>
        ) : reliefMember.balance <= 0 ? (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            Your balance is zero. Once the admin has recorded a contribution from you, you can request up to 2.5× your balance.
          </p>
        ) : hasPendingOwnRequest ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            You have an open request. You can make another once it is settled.
          </p>
        ) : !showRequestForm ? (
          <button
            onClick={() => setShowRequestForm(true)}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition"
          >
            Request relief
          </button>
        ) : (
          <div className="space-y-2 bg-slate-50 rounded-lg p-3">
            <input
              type="number"
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              placeholder={`Amount (up to ₦${maxRequestAmount.toLocaleString()})`}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              placeholder="Why do you need relief? (e.g. hospital bill)"
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-slate-500">
              If approved, this is an interest-free advance. You repay it in{" "}
              {REPAYMENT_MONTHS} equal monthly instalments, and your balance stays
              locked as security until it is cleared. Members vote for {VOTING_HOURS}{" "}
              hours.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSubmitRequest}
                disabled={requestSubmitting}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg transition"
              >
                {requestSubmitting ? "Submitting…" : "Submit request"}
              </button>
              <button
                onClick={() => {
                  setShowRequestForm(false);
                  setRequestError(null);
                }}
                className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {myRequests.length > 0 && (
          <ul className="space-y-2 mt-3">
            {myRequests.map((r) => (
              <li
                key={r.id}
                className="border border-slate-100 rounded-lg p-3 text-xs text-slate-600"
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="font-bold text-slate-800">
                    ₦{r.amount.toLocaleString()}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      r.status === "VOTING"
                        ? "bg-amber-100 text-amber-700"
                        : r.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-700"
                        : r.status === "REJECTED"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {r.status === "VOTING" ? "Voting" : r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                  </span>
                </div>
                <p className="mt-1">{r.reason}</p>
                {r.status === "VOTING" && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    {groupReceipts.filter((x) => x.requestId === r.id).length} of{" "}
                    {eligibleVoters(r).length} members have voted
                  </p>
                )}
                {(r.status === "APPROVED" || r.status === "REJECTED") && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Yes {r.yesVotes ?? 0} · No {r.noVotes ?? 0}
                    {r.settleNote ? ` · ${r.settleNote}` : ""}
                  </p>
                )}
                {r.status === "VOTING" && (
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[10px] text-slate-400">
                      Voting closes {new Date(r.votingDeadline).toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleCancelRequest(r.id)}
                      className="text-[10px] text-rose-500 hover:text-rose-700 underline"
                    >
                      Cancel request
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* History */}
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">Recent activity</p>
        {history.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No activity yet.</p>
        ) : (
          <ul className="space-y-1.5 max-h-40 overflow-y-auto">
            {history.slice(0, 10).map((h, i) => (
              <li
                key={i}
                className="flex justify-between text-xs text-slate-600 border-b border-slate-100 pb-1.5"
              >
                <span>
                  {(h as any).label || (h.type === "contribution" ? "➕ Contribution" : "➖ Withdrawal")}
                  {(h as any).status === "PENDING" && <span className="ml-1 text-[10px] text-amber-600">(pending admin)</span>}
                </span>
                <span
                  className={
                    h.type === "contribution"
                      ? (h as any).status === "PENDING"
                        ? "text-amber-600"
                        : "text-emerald-600"
                      : "text-rose-600"
                  }
                >
                  {h.type === "contribution" ? "+" : "-"}₦
                  {h.amount.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
