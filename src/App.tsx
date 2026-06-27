import React, { useState, useEffect } from "react";
import { Member, ContributionMonth, PaymentLog } from "./types";
import Dashboard from "./components/Dashboard";
import BallotWheel from "./components/BallotWheel";
import ReceiptVerifier from "./components/ReceiptVerifier";
import WhatsAppSimulator from "./components/WhatsAppSimulator";
import MemberPortal from "./components/MemberPortal";
import RealEstatePools from "./components/RealEstatePools";
import { Users, Coins, Percent, Award, ShieldCheck, MessageSquare, PlusCircle, CreditCard, Sparkles, LayoutDashboard, Calendar, User, Share2, Plus, Building2 } from "lucide-react";
import { collection, doc, setDoc as firebaseSetDoc, onSnapshot, deleteDoc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

// Helper to recursively remove all undefined values from an object for Firestore compatibility
function cleanData<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanData) as any;
  }
  const result: any = {};
  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key];
    if (value !== undefined) {
      result[key] = cleanData(value);
    }
  }
  return result;
}

const setDoc = async (docRef: any, data: any) => {
  return firebaseSetDoc(docRef, cleanData(data));
};

const INITIAL_MEMBERS: Member[] = [];

const INITIAL_MONTHS: ContributionMonth[] = [
  {
    id: "2026-06",
    name: "June 2026",
    targetAmountPerMember: 100000,
    recipientsCount: 2,
    recipients: [],
    status: "ACTIVE",
    payments: []
  }
];

export interface AjoGroup {
  id: string;
  name: string;
  createdAt: string;
}

export default function App() {
  const [groups, setGroups] = useState<AjoGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlGroupId = params.get("groupId");
    if (urlGroupId) {
      localStorage.setItem("selected_ajo_group_id", urlGroupId);
      return urlGroupId;
    }
    return localStorage.getItem("selected_ajo_group_id") || "default";
  });

  const [allMembers, setAllMembers] = useState<(Member & { groupId?: string })[]>(() => {
    const saved = localStorage.getItem("ajo_members");
    if (saved) {
      try {
        return JSON.parse(saved) as (Member & { groupId?: string })[];
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [allMonths, setAllMonths] = useState<(ContributionMonth & { groupId?: string })[]>(() => {
    const saved = localStorage.getItem("ajo_months");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as (ContributionMonth & { groupId?: string })[];
        return parsed.map(m => {
          return {
            ...m,
            targetAmountPerMember: m.targetAmountPerMember === 10000 ? 100000 : m.targetAmountPerMember,
            payments: m.payments.map(p => p.amount === 10000 ? { ...p, amount: 100000 } : p)
          };
        });
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [currentMonthId, setCurrentMonthId] = useState<string>("2026-06");
  const [activeTab, setActiveTab] = useState<"dashboard" | "ballot" | "auditor" | "whatsapp" | "portal" | "realestate">(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("role") === "member" || params.get("portal") === "true") {
      return "portal";
    }
    return "dashboard";
  });
  const [isMemberOnlyUrl, setIsMemberOnlyUrl] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("role") === "member" || params.get("portal") === "true";
  });
  const [lastDrawNotice, setLastDrawNotice] = useState<string>("");
  const [firestoreMonthsReady, setFirestoreMonthsReady] = useState<boolean>(false);

  const members = allMembers.filter(m => (m.groupId || "default") === selectedGroupId);
  const months = allMonths.filter(m => (m.groupId || "default") === selectedGroupId);

  // Subscribe to Ajo groups in central Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "groups"), async (snapshot) => {
      const list: AjoGroup[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          ...data,
          id: doc.id
        } as AjoGroup);
      });
      
      if (list.length === 0) {
        const defaultGroup: AjoGroup = {
          id: "default",
          name: "Primary Co-Op Pool",
          createdAt: new Date().toISOString()
        };
        try {
          await setDoc(doc(db, "groups", "default"), defaultGroup);
        } catch (e) {
          console.error("Seeding default group error: ", e);
        }
        setGroups([defaultGroup]);
      } else {
        setGroups(list);
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to members in central Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "members"), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          ...data,
          id: doc.id
        });
      });
      
      const mappedList = list.map(m => {
        if (!m.groupId) {
          return { ...m, groupId: "default" };
        }
        return m;
      });
      setAllMembers(mappedList);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to months in central Firestore
  // PERMANENT FIX: skip any document whose ID has no underscore prefix
  // (e.g. bare "2026-06" is rogue; valid ones are "default_2026-06")
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "months"), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        // Skip rogue documents that have no groupId prefix in their doc ID
        if (!doc.id.includes("_")) return;

        const data = doc.data();
        const docMonthId = doc.id.split("_").pop() || doc.id;
        list.push({
          ...data,
          id: data.id || docMonthId
        });
      });
      
      const cleanedList = list.map(mon => {
        const gId = mon.groupId || "default";
        return {
          ...mon,
          groupId: gId,
          targetAmountPerMember: mon.targetAmountPerMember === 10000 ? 100000 : mon.targetAmountPerMember,
          recipients: mon.recipients || [],
          payments: (mon.payments || []).map((p: any) => p.amount === 10000 ? { ...p, amount: 100000 } : p)
        };
      });

      setAllMonths(cleanedList);
      setFirestoreMonthsReady(true); // Mark Firestore as loaded — auto-seed can now safely check
    });
    return () => unsubscribe();
  }, []);

  // Auto-seed ONLY if the Firestore document does not already exist
  // Uses getDoc to check first — NEVER overwrites existing ballot/winner data
  useEffect(() => {
    if (!selectedGroupId) return;
    const docId = `${selectedGroupId}_2026-06`;
    const docRef = doc(db, "months", docId);
    getDoc(docRef).then((snap) => {
      if (!snap.exists()) {
        const initialMonth: ContributionMonth & { groupId: string } = {
          id: "2026-06",
          name: "June 2026",
          targetAmountPerMember: 100000,
          recipientsCount: 1,
          recipients: [],
          status: "ACTIVE" as const,
          payments: [],
          groupId: selectedGroupId
        };
        setDoc(docRef, initialMonth).catch(console.error);
      }
      // Document exists — do nothing, never overwrite
    }).catch(console.error);
  }, [selectedGroupId]);

  // Synchronize selectedGroupId with logged-in member's groupId if accessing via member portal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMemberId = params.get("memberId") || localStorage.getItem("ajo_member_session");
    if (urlMemberId && allMembers.length > 0) {
      const loggedMember = allMembers.find(m => m.id === urlMemberId);
      if (loggedMember && loggedMember.groupId && loggedMember.groupId !== selectedGroupId) {
        setSelectedGroupId(loggedMember.groupId);
        localStorage.setItem("selected_ajo_group_id", loggedMember.groupId);
      }
    }
  }, [allMembers, selectedGroupId]);

  // Synchronize currentMonthId with the active month in the selected group
  useEffect(() => {
    if (selectedGroupId && allMonths.length > 0) {
      const groupMonths = allMonths.filter(m => (m.groupId || "default") === selectedGroupId);
      const activeMonth = groupMonths.find(m => m.status === "ACTIVE");
      if (activeMonth && activeMonth.id !== currentMonthId) {
        setCurrentMonthId(activeMonth.id);
      } else if (!activeMonth && groupMonths.length > 0) {
        const sorted = [...groupMonths].sort((a, b) => b.id.localeCompare(a.id));
        if (sorted[0] && sorted[0].id !== currentMonthId) {
          setCurrentMonthId(sorted[0].id);
        }
      }
    }
  }, [allMonths, selectedGroupId, currentMonthId]);

  useEffect(() => {
    localStorage.setItem("ajo_members", JSON.stringify(allMembers));
  }, [allMembers]);

  useEffect(() => {
    localStorage.setItem("ajo_months", JSON.stringify(allMonths));
  }, [allMonths]);

  const currentMonth = months.find(m => m.id === currentMonthId) || months[0] || INITIAL_MONTHS[0];
  const currencySymbol = currentMonth?.id ? "NGN" : "NGN";

  const eligibleMembers = members.filter(m => {
    const alreadyWon = months.some(mon => mon.recipients.includes(m.id)) || m.collectedMonths.length > 0;
    return !alreadyWon && m.isActive;
  });

  const handleAddMember = async (newMem: Omit<Member, "id" | "collectedMonths" | "isActive text-indigo-600">) => {
    const freshId = "mem-" + Date.now();
    const fresh: Member & { groupId: string } = {
      ...newMem,
      id: freshId,
      groupId: selectedGroupId,
      collectedMonths: [],
      isActive: true
    };
    try {
      await setDoc(doc(db, "members", freshId), fresh);
    } catch (e) {
      console.error(e);
      setAllMembers(prev => [...prev, fresh]);
    }
  };

  const handleRemoveMember = async (id: string) => {
    try {
      await deleteDoc(doc(db, "members", id));
      const updatedMonths = months.map(m => ({
        ...m,
        recipients: m.recipients.filter(rId => rId !== id),
        payments: m.payments.filter(p => p.memberId !== id && p.recipientId !== id),
        groupId: selectedGroupId
      }));
      for (const m of updatedMonths) {
        await setDoc(doc(db, "months", `${selectedGroupId}_${m.id}`), m);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetToPristine = async () => {
    try {
      for (const m of members) {
        await deleteDoc(doc(db, "members", m.id));
      }
      for (const mon of months) {
        const docId = `${selectedGroupId}_${mon.id}`;
        await deleteDoc(doc(db, "months", docId));
      }
      const defaultMonth: ContributionMonth & { groupId: string } = {
        id: "2026-06",
        name: "June 2026",
        targetAmountPerMember: 100000,
        recipientsCount: 2,
        recipients: [],
        status: "ACTIVE" as const,
        payments: [],
        groupId: selectedGroupId
      };
      await setDoc(doc(db, "months", `${selectedGroupId}_2026-06`), defaultMonth);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetBallot = async () => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;

    const recipientIds = targetMonth.recipients || [];

    const updatedMonth: ContributionMonth & { groupId: string } = {
      ...targetMonth,
      recipients: [],
      payments: [],
      payoutConfirmedByRecipients: [],
      groupId: selectedGroupId
    };

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedMonth);
    } catch (e) {
      console.error(e);
    }

    for (const m of members) {
      if (recipientIds.includes(m.id) || m.collectedMonths.includes(currentMonthId)) {
        const updatedMem: Member = {
          ...m,
          collectedMonths: m.collectedMonths.filter(id => id !== currentMonthId)
        };
        try {
          await setDoc(doc(db, "members", m.id), updatedMem);
        } catch (e) {
          console.error(e);
        }
      }
    }

    setLastDrawNotice("");
  };

  const handleConfigureMonth = async (amount: number, spots: 1 | 2, currencyCode: string) => {
    const updated = months.map(m => {
      if (m.id === currentMonthId) {
        return {
          ...m,
          targetAmountPerMember: amount,
          recipientsCount: spots
        };
      }
      return m;
    });
    const currentM = updated.find(m => m.id === currentMonthId);
    if (currentM) {
      try {
        await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), {
          ...currentM,
          groupId: selectedGroupId
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleRecordPayment = async (memberId: string, amount: number, ref: string, senderName?: string, recipientId?: string) => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;
    const targetRecipient = recipientId || targetMonth.recipients[0] || "unassigned";
    const exists = targetMonth.payments.some(p => p.memberId === memberId && p.recipientId === targetRecipient);
    if (exists) return;

    const newPayment: PaymentLog = {
      memberId,
      amount,
      date: new Date().toISOString().split('T')[0],
      transactionRef: ref,
      senderAccountName: senderName || "Verified Member",
      verifiedByAI: true,
      recipientId: targetRecipient
    };

    const updatedPayments = [...targetMonth.payments, newPayment];

    setAllMonths(prev => prev.map(m =>
      m.id === currentMonthId && (m.groupId || "default") === selectedGroupId
        ? { ...m, payments: updatedPayments }
        : m
    ));

    const updatedMonth: ContributionMonth & { groupId: string } = {
      ...targetMonth,
      payments: updatedPayments,
      groupId: selectedGroupId
    };

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedMonth);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApproveBallotSelection = async (selectedWinners: Member[]) => {
    const winnerIds = selectedWinners.map(w => w.id);
    
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (targetMonth) {
      const oldRecipients = targetMonth.recipients || [];
      
      const updatedMonth: ContributionMonth & { groupId: string } = {
        ...targetMonth,
        recipients: winnerIds,
        groupId: selectedGroupId
      };

      setAllMonths(prev => prev.map(m =>
        m.id === currentMonthId && (m.groupId || "default") === selectedGroupId
          ? { ...m, recipients: winnerIds }
          : m
      ));

      try {
        await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedMonth);
      } catch (e) {
        console.error(e);
      }

      const removedRecipients = oldRecipients.filter(id => !winnerIds.includes(id));
      for (const mId of removedRecipients) {
        const memObj = members.find(m => m.id === mId);
        if (memObj) {
          const updatedMem: Member = {
            ...memObj,
            collectedMonths: memObj.collectedMonths.filter(id => id !== currentMonthId)
          };
          try {
            await setDoc(doc(db, "members", mId), updatedMem);
          } catch (e) {
            console.error(e);
          }
        }
      }

      for (const mId of winnerIds) {
        const memObj = members.find(m => m.id === mId);
        if (memObj) {
          const updatedMem: Member = {
            ...memObj,
            collectedMonths: memObj.collectedMonths.includes(currentMonthId)
              ? memObj.collectedMonths
              : [...memObj.collectedMonths, currentMonthId]
          };
          try {
            await setDoc(doc(db, "members", mId), updatedMem);
          } catch (e) {
            console.error(e);
          }
        }
      }
    }

    const winnersStr = selectedWinners.map(w => `*${w.name}*`).join(" and ");
    const notificationText = `📢 *OFFICIAL BALLOT RESULT* 📢\n` +
      `🏆 Recipient selected for *${currentMonth.name}*: ${winnersStr}!\n` +
      `Payout pool size: *NGN ${(currentMonth.targetAmountPerMember * (members.length - selectedWinners.length)).toLocaleString()}*\n\n` +
      `🏦 Bank Account details:\n` +
      selectedWinners.map((w, i) => 
        `▫️ *${w.name}* (${w.bankName})\n` +
        `• Account No: \`${w.accountNo}\``
      ).join("\n") +
      `\n\nProceed with transfers and drop credit notifications screenshots here. ✅`;
      
    setLastDrawNotice(notificationText);
    setActiveTab("whatsapp");
  };

  const handleManualPayment = async (memberId: string, approved: boolean, recipientId?: string) => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;

    let updatedMonth: ContributionMonth;

    if (approved) {
      const recipientsToPay = recipientId ? [recipientId] : targetMonth.recipients.filter(rId => rId !== memberId);
      
      let newPayments = [...targetMonth.payments];
      recipientsToPay.forEach(targetRecId => {
        const exists = newPayments.some(p => p.memberId === memberId && p.recipientId === targetRecId);
        if (!exists) {
          newPayments.push({
            memberId,
            amount: targetMonth.targetAmountPerMember,
            date: new Date().toISOString().split('T')[0],
            transactionRef: "OVERRIDE-" + Math.floor(Math.random() * 100000),
            senderAccountName: "System Approved",
            verifiedByAI: false,
            recipientId: targetRecId
          });
        }
      });
      
      updatedMonth = {
        ...targetMonth,
        payments: newPayments
      };
    } else {
      updatedMonth = {
        ...targetMonth,
        payments: recipientId
          ? targetMonth.payments.filter(p => !(p.memberId === memberId && p.recipientId === recipientId))
          : targetMonth.payments.filter(p => p.memberId !== memberId)
      };
    }

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), {
        ...updatedMonth,
        groupId: selectedGroupId
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmPayoutReceipt = async (memberId: string, monthId: string) => {
    const targetMonth = months.find(m => m.id === monthId);
    if (!targetMonth) return;

    const confirmed = targetMonth.payoutConfirmedByRecipients || [];
    if (confirmed.includes(memberId)) return;

    const updatedConfirmed = [...confirmed, memberId];

    setAllMonths(prev => prev.map(m =>
      m.id === monthId && (m.groupId || "default") === selectedGroupId
        ? { ...m, payoutConfirmedByRecipients: updatedConfirmed }
        : m
    ));

    const updatedMonth: ContributionMonth & { groupId: string } = {
      ...targetMonth,
      payoutConfirmedByRecipients: updatedConfirmed,
      groupId: selectedGroupId
    };

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${monthId}`), updatedMonth);
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmPaymentCredit = async (memberId: string, recipientId: string, transactionRef: string) => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;

    const updatedPayments = targetMonth.payments.map(p => {
      if (p.memberId === memberId && p.recipientId === recipientId && p.transactionRef === transactionRef) {
        return { ...p, confirmedByRecipient: true };
      }
      return p;
    });

    setAllMonths(prev => prev.map(m =>
      m.id === currentMonthId && (m.groupId || "default") === selectedGroupId
        ? { ...m, payments: updatedPayments }
        : m
    ));

    const updatedMonth: ContributionMonth & { groupId: string } = {
      ...targetMonth,
      payments: updatedPayments,
      groupId: selectedGroupId
    };

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedMonth);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCloseRound = async () => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;

    const updatedCurrentMonth: ContributionMonth & { groupId: string } = {
      ...targetMonth,
      status: "COMPLETED" as const,
      groupId: selectedGroupId
    };

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedCurrentMonth);
    } catch (e) {
      console.error(e);
    }

    const nextMonthId = "2026-07";
    const nextMonthName = "July 2026";
    
    const exists = months.some(m => m.id === nextMonthId);
    if (!exists) {
      const nextMonthObj: ContributionMonth & { groupId: string } = {
        id: nextMonthId,
        name: nextMonthName,
        targetAmountPerMember: targetMonth.targetAmountPerMember,
        recipientsCount: targetMonth.recipientsCount,
        recipients: [],
        status: "ACTIVE" as const,
        payments: [],
        groupId: selectedGroupId
      };
      try {
        await setDoc(doc(db, "months", `${selectedGroupId}_${nextMonthId}`), nextMonthObj);
      } catch (e) {
        console.error(e);
      }
    }
    
    setCurrentMonthId(nextMonthId);
    setActiveTab("dashboard");
  };

  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = () => {
    const link = window.location.origin + window.location.pathname + `?role=member&groupId=${selectedGroupId}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // NEW: WhatsApp invite — opens WhatsApp with a pre-written message containing the member portal link
  const handleWhatsAppInvite = () => {
    const link = window.location.origin + window.location.pathname + `?role=member&groupId=${selectedGroupId}`;
    const groupName = groups.find(g => g.id === selectedGroupId)?.name || "our CoVest group";
    const message =
      `👋 You've been invited to join *${groupName}* on CoVest.\n\n` +
      `CoVest helps us manage our Ajo contributions digitally — track payments, see your status, and confirm receipts.\n\n` +
      `Tap the link below to access your member portal:\n${link}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      
      <header className="bg-white border-b border-slate-100 py-4 px-6 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-extrabold shadow-md shadow-indigo-600/10 float-left">
              CV
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">CoVest</h1>
              <p className="text-xs text-slate-400 font-medium tracking-tight">Group Contributions & Real Estate Pools</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-indigo-50/50 rounded-xl px-4 py-1.5 border border-indigo-100 flex items-center gap-2 text-xs text-indigo-700 font-bold">
              <Calendar className="h-4 w-4" />
              <span>Round: <span className="text-slate-700">{currentMonth?.name || "N/A"}</span></span>
            </div>
            
            <div className="bg-emerald-50 text-emerald-800 rounded-xl px-4 py-1.5 border border-emerald-100 flex items-center gap-2 text-xs font-bold">
              <Coins className="h-4 w-4" />
              <span>Target: <span className="text-slate-800">₦ {currentMonth?.targetAmountPerMember.toLocaleString() || 0}</span></span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">

        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600 shrink-0" />
              Active Co-Op Group / Asset Pool
            </h2>
            <p className="text-xs text-slate-500">
              Select or create distinct cooperative savings or asset co-investment groups.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2/5 w-full sm:w-auto">
            <select
              value={selectedGroupId}
              onChange={(e) => {
                const gId = e.target.value;
                setSelectedGroupId(gId);
                localStorage.setItem("selected_ajo_group_id", gId);
                const params = new URLSearchParams(window.location.search);
                params.set("groupId", gId);
                window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
              }}
              className="w-full sm:w-48 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            {!isMemberOnlyUrl && (
              <button
                onClick={async () => {
                  const groupName = prompt("Enter a name for the new Co-Op / Asset Group:");
                  if (groupName && groupName.trim()) {
                    const cleanName = groupName.trim();
                    const newGroupId = "group-" + Date.now();
                    const newGrp: AjoGroup = {
                      id: newGroupId,
                      name: cleanName,
                      createdAt: new Date().toISOString()
                    };
                    try {
                      await setDoc(doc(db, "groups", newGroupId), newGrp);
                      setSelectedGroupId(newGroupId);
                      localStorage.setItem("selected_ajo_group_id", newGroupId);
                      
                      const params = new URLSearchParams(window.location.search);
                      params.set("groupId", newGroupId);
                      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
                    } catch (err) {
                      console.error("Create group error: ", err);
                    }
                  }
                }}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700/80 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 shadow-sm border border-indigo-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                <span>Create Group</span>
              </button>
            )}
          </div>
        </div>
        
        {!isMemberOnlyUrl ? (
          <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-indigo-500/10 border border-indigo-150/50 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="space-y-1">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Share2 className="w-4 h-4 text-indigo-600 shrink-0" />
                Invite Members to the Portal
              </span>
              <p className="text-xs text-slate-500 leading-relaxed">
                Send members their direct secure link so they bypass admin panels and open the <strong>Member Portal</strong> directly.
              </p>
            </div>
            
            {/* UPDATED: Two invite buttons — copy link + WhatsApp share */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleCopyLink}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                  copiedLink 
                    ? "bg-emerald-600 text-white shadow font-semibold" 
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow font-semibold"
                }`}
              >
                {copiedLink ? (
                  <span>✓ Copied!</span>
                ) : (
                  <><Share2 className="w-3.5 h-3.5" /><span>Copy Link</span></>
                )}
              </button>

              <button
                onClick={handleWhatsAppInvite}
                className="px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition bg-emerald-500 hover:bg-emerald-600 text-white shadow"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Share via WhatsApp</span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap bg-slate-200/50 rounded-xl p-1 max-w-5xl gap-1">
          <button
            onClick={() => setActiveTab("portal")}
            className={`flex items-center gap-1.5 flex-1 min-w-[120px] justify-center py-2.5 px-3 rounded-lg text-xs font-extrabold transition duration-200 ${
              activeTab === "portal" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-800 hover:bg-white/30"
            }`}
          >
            <User className="h-4 w-4" />
            <span>👥 Member Portal</span>
          </button>

          <button
            onClick={() => setActiveTab("realestate")}
            className={`flex items-center gap-1.5 flex-1 min-w-[140px] justify-center py-2.5 px-3 rounded-lg text-xs font-extrabold transition duration-200 ${
              activeTab === "realestate" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-800 hover:bg-white/30"
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>🏙️ Real Estate Pools</span>
          </button>

          {!isMemberOnlyUrl && (
            <>
              <button
                onClick={() => setActiveTab("dashboard")}
                className={`flex items-center gap-1.5 flex-1 min-w-[125px] justify-center py-2.5 px-3 rounded-lg text-xs font-bold transition duration-200 ${
                  activeTab === "dashboard" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/30"
                }`}
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Admin Control Panel</span>
              </button>
              
              <button
                onClick={() => setActiveTab("ballot")}
                className={`flex items-center gap-1.5 flex-1 min-w-[110px] justify-center py-2.5 px-3 rounded-lg text-xs font-bold transition duration-150 ${
                  activeTab === "ballot" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/30"
                }`}
              >
                <Award className="h-4 w-4" />
                <span>Ballot Drawer</span>
              </button>

              <button
                onClick={() => setActiveTab("auditor")}
                className={`flex items-center gap-1.5 flex-1 min-w-[130px] justify-center py-2.5 px-3 rounded-lg text-xs font-bold transition duration-150 ${
                  activeTab === "auditor" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/30"
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Receipt Auditing OCR</span>
              </button>

              <button
                onClick={() => setActiveTab("whatsapp")}
                className={`flex items-center gap-1.5 flex-1 min-w-[140px] justify-center py-2.5 px-3 rounded-lg text-xs font-bold transition duration-150 ${
                  activeTab === "whatsapp" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/30"
                }`}
              >
                <MessageSquare className="h-4 w-4" />
                <span>WhatsApp group simulator</span>
              </button>
            </>
          )}
        </div>

        <div className="min-h-[450px]">
          {activeTab === "portal" && (
            <MemberPortal
              members={allMembers}
              months={allMonths}
              currentMonthId={currentMonthId}
              currency="₦"
              onAddMember={handleAddMember}
              onPaymentApproved={(mId, amt, ref, sName, rId) => handleRecordPayment(mId, amt, ref, sName, rId)}
              onConfirmPayoutReceipt={handleConfirmPayoutReceipt}
              onConfirmPaymentCredit={handleConfirmPaymentCredit}
              onLoginChange={(groupId) => {
                setSelectedGroupId(groupId);
                localStorage.setItem("selected_ajo_group_id", groupId);
              }}
            />
          )}

          {activeTab === "realestate" && (
            <RealEstatePools
              members={members}
              selectedGroupId={selectedGroupId}
              isMemberOnlyUrl={isMemberOnlyUrl}
            />
          )}

          {activeTab === "dashboard" && (
            <Dashboard
              members={members}
              months={months}
              currentMonthId={currentMonthId}
              currency="₦"
              onAddMember={handleAddMember}
              onRemoveMember={handleRemoveMember}
              onConfigureMonth={handleConfigureMonth}
              onManualPayment={handleManualPayment}
              onCloseRound={handleCloseRound}
              onResetToPristine={handleResetToPristine}
              onResetBallot={handleResetBallot}
            />
          )}

          {activeTab === "ballot" && (
            <BallotWheel
              eligibleMembers={eligibleMembers}
              onSelected={handleApproveBallotSelection}
              onResetBallot={handleResetBallot}
              payoutCount={currentMonth?.recipientsCount || 1}
              monthName={currentMonth?.name || "N/A"}
              currentMonthRecipients={currentMonth?.recipients}
            />
          )}

          {activeTab === "auditor" && (
            <ReceiptVerifier
              members={members}
              expectedAmount={currentMonth?.targetAmountPerMember || 10000}
              currency="₦"
              onPaymentApproved={(mId, amt, ref, sName, rId) => handleRecordPayment(mId, amt, ref, sName, rId)}
            />
          )}

          {activeTab === "whatsapp" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-lg font-semibold text-slate-800">WhatsApp Group & Bot Integration</h2>
                </div>
                
                <p className="text-slate-500 text-sm leading-relaxed">
                  Normally, establishing actual API loops with meta-WhatsApp requires verified business IDs. 
                  This interactive area **simulates exact WhatsApp web hooks**!
                </p>

                <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-200 text-xs">
                  <h4 className="font-bold text-slate-700">How to test simulated automation:</h4>
                  <ol className="list-decimal pl-4 text-slate-500 space-y-1">
                    <li>Select a member in the mobile simulator's footer dropdown (e.g. "Chat as: Ngozi Okafor").</li>
                    <li>Click the <strong className="text-emerald-700">"Pay Amount"</strong> quick-trigger button, which drops a mockup of a transfer confirmation.</li>
                    <li>The <strong className="text-teal-700">Ajo Bot</strong> will automatically activate, call the server's Gemini-enabled processing, and review the receipt details!</li>
                    <li>If checked off correctly, the system updates their payment state in the dashboard instantly!</li>
                  </ol>
                </div>

                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 text-xs space-y-1 flex items-start gap-2.5">
                  <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-indigo-800">Copier Reminder</h4>
                    <p className="text-slate-600 leading-relaxed">
                      You can go back to the <strong>Admin Control Panel</strong> dashboard, compile copy-paste warnings (Draw notices, Pending lists, closing remark drafts) in 1 tap, and paste them into your real WhatsApp group room!
                    </p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5">
                <WhatsAppSimulator
                  members={members}
                  expectedAmount={currentMonth?.targetAmountPerMember || 10000}
                  currency="₦"
                  onReceiptProcessed={(mId, amt, ref, sName) => handleRecordPayment(mId, amt, ref, sName)}
                  lastDrawNotice={lastDrawNotice}
                  activeRecipients={members.filter(m => currentMonth?.recipients.includes(m.id))}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-white border-t border-slate-100 py-4 px-6 text-center text-xs text-slate-400 font-medium">
        <p>© 2026 CoVest Platform • Fully Autonomous Co-Op & Group Investment Assistant • Running on Gemini 3.5</p>
      </footer>

    </div>
  );
}
