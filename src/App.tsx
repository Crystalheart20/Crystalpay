import React, { useState, useEffect } from "react";
import { Member, ContributionMonth, PaymentLog } from "./types";
import Dashboard from "./components/Dashboard";
import BallotWheel from "./components/BallotWheel";
import ReceiptVerifier from "./components/ReceiptVerifier";
import WhatsAppSimulator from "./components/WhatsAppSimulator";
import MemberPortal from "./components/MemberPortal";
import { Users, Coins, Percent, Award, ShieldCheck, MessageSquare, PlusCircle, CreditCard, Sparkles, LayoutDashboard, Calendar, User, Share2 } from "lucide-react";
import { collection, doc, setDoc, onSnapshot, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

// Zero-out default / seed lists to start in pure self-service mode (no mock data)
const INITIAL_MEMBERS: Member[] = [];

const INITIAL_MONTHS: ContributionMonth[] = [
  {
    id: "2026-06",
    name: "June 2026",
    targetAmountPerMember: 100000,
    recipientsCount: 2,
    recipients: [], // Start without default mock winners
    status: "ACTIVE",
    payments: [] // Start without default mock payments
  }
];

export default function App() {
  const [members, setMembers] = useState<Member[]>(() => {
    const saved = localStorage.getItem("ajo_members");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Member[];
        const mockIds = ["mem-1", "mem-2", "mem-3", "mem-4", "mem-5", "mem-6", "mem-7"];
        return parsed.filter(m => !mockIds.includes(m.id));
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [months, setMonths] = useState<ContributionMonth[]>(() => {
    const saved = localStorage.getItem("ajo_months");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ContributionMonth[];
        const mockIds = ["mem-1", "mem-2", "mem-3", "mem-4", "mem-5", "mem-6", "mem-7"];
        return parsed.map(m => {
          const cleanRecipients = m.recipients.filter(r => !mockIds.includes(r));
          const cleanPayments = m.payments.filter(p => !mockIds.includes(p.memberId));
          return {
            ...m,
            targetAmountPerMember: m.targetAmountPerMember === 10000 ? 100000 : m.targetAmountPerMember,
            recipients: cleanRecipients,
            payments: cleanPayments.map(p => p.amount === 10000 ? { ...p, amount: 100000 } : p)
          };
        });
      } catch (e) {
        return INITIAL_MONTHS;
      }
    }
    return INITIAL_MONTHS;
  });

  const [currentMonthId, setCurrentMonthId] = useState<string>("2026-06");
  const [activeTab, setActiveTab] = useState<"dashboard" | "ballot" | "auditor" | "whatsapp" | "portal">(() => {
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

  // Synchronize with central Firestore cloud database and purge synthetic mock members
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "members"), (snapshot) => {
      const list: Member[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as Member);
      });
      
      const mockIds = ["mem-1", "mem-2", "mem-3", "mem-4", "mem-5", "mem-6", "mem-7"];
      const containsMock = list.some(m => mockIds.includes(m.id));
      if (containsMock) {
        // Deep purge from Firestore
        list.forEach(async (m) => {
          if (mockIds.includes(m.id)) {
            try {
              await deleteDoc(doc(db, "members", m.id));
            } catch (e) {
              console.error("Purge member error: ", e);
            }
          }
        });
        const cleaned = list.filter(m => !mockIds.includes(m.id));
        setMembers(cleaned);
      } else {
        setMembers(list);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "months"), (snapshot) => {
      const list: ContributionMonth[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as ContributionMonth);
      });
      
      const mockIds = ["mem-1", "mem-2", "mem-3", "mem-4", "mem-5", "mem-6", "mem-7"];
      let modified = false;
      const sorted = list.sort((a, b) => a.id.localeCompare(b.id));
      const cleanedList = sorted.map(mon => {
        const hasMockRecipient = mon.recipients.some(rId => mockIds.includes(rId));
        const hasMockPayment = mon.payments.some(p => mockIds.includes(p.memberId));
        if (hasMockRecipient || hasMockPayment) {
          modified = true;
          return {
            ...mon,
            recipients: mon.recipients.filter(rId => !mockIds.includes(rId)),
            payments: mon.payments.filter(p => !mockIds.includes(p.memberId))
          };
        }
        return mon;
      });

      if (modified) {
        cleanedList.forEach(async (mon) => {
          try {
            await setDoc(doc(db, "months", mon.id), mon);
          } catch (e) {
            console.error("Purge month references error: ", e);
          }
        });
      }

      if (cleanedList.length > 0) {
        setMonths(cleanedList);
      } else {
        INITIAL_MONTHS.forEach(async (m) => {
          try {
            await setDoc(doc(db, "months", m.id), m);
          } catch (e) {
            console.error("Seed clean months error: ", e);
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem("ajo_members", JSON.stringify(members));
  }, [members]);

  useEffect(() => {
    localStorage.setItem("ajo_months", JSON.stringify(months));
  }, [months]);

  const currentMonth = months.find(m => m.id === currentMonthId) || months[0];
  const currencySymbol = currentMonth?.id ? "NGN" : "NGN"; // Defaults

  // Eligible members for ballot box (members who haven't won a rotation yet)
  const eligibleMembers = members.filter(m => {
    // Has not won currentMonth and hasn't collected historically
    const alreadyWon = months.some(mon => mon.recipients.includes(m.id)) || m.collectedMonths.length > 0;
    return !alreadyWon && m.isActive;
  });

  // Action: Add/Register a New Member
  const handleAddMember = async (newMem: Omit<Member, "id" | "collectedMonths" | "isActive">) => {
    const freshId = "mem-" + Date.now();
    const fresh: Member = {
      ...newMem,
      id: freshId,
      collectedMonths: [],
      isActive: true
    };
    try {
      await setDoc(doc(db, "members", freshId), fresh);
    } catch (e) {
      console.error(e);
      setMembers(prev => [...prev, fresh]);
    }
  };

  // Action: Remove/Delete member
  const handleRemoveMember = async (id: string) => {
    try {
      await deleteDoc(doc(db, "members", id));
      const updatedMonths = months.map(m => ({
        ...m,
        recipients: m.recipients.filter(rId => rId !== id),
        payments: m.payments.filter(p => p.memberId !== id && p.recipientId !== id)
      }));
      for (const m of updatedMonths) {
        await setDoc(doc(db, "months", m.id), m);
      }
    } catch (e) {
      console.error(e);
      setMembers(prev => prev.filter(m => m.id !== id));
      setMonths(prev => prev.map(m => ({
        ...m,
        recipients: m.recipients.filter(rId => rId !== id),
        payments: m.payments.filter(p => p.memberId !== id && p.recipientId !== id)
      })));
    }
  };

  // Action: Reset entire application to pristine start
  const handleResetToPristine = async () => {
    localStorage.removeItem("ajo_members");
    localStorage.removeItem("ajo_months");
    try {
      for (const m of members) {
        await deleteDoc(doc(db, "members", m.id));
      }
      for (const mon of months) {
        await deleteDoc(doc(db, "months", mon.id));
      }
      const defaultMonth: ContributionMonth = {
        id: "2026-06",
        name: "June 2026",
        targetAmountPerMember: 100000,
        recipientsCount: 2,
        recipients: [],
        status: "ACTIVE" as const,
        payments: []
      };
      await setDoc(doc(db, "months", "2026-06"), defaultMonth);
    } catch (e) {
      console.error(e);
    }
    setMembers([]);
    setMonths([
      {
        id: "2026-06",
        name: "June 2026",
        targetAmountPerMember: 100000,
        recipientsCount: 2,
        recipients: [],
        status: "ACTIVE" as const,
        payments: []
      }
    ]);
    setCurrentMonthId("2026-06");
  };

  // Action: Set/configure current round variables
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
        await setDoc(doc(db, "months", currentMonthId), currentM);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Action: Record payment verified (manually or through Gemini OCR)
  const handleRecordPayment = async (memberId: string, amount: number, ref: string, senderName?: string, recipientId?: string) => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;
    const targetRecipient = recipientId || targetMonth.recipients[0];
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

    const updatedMonth: ContributionMonth = {
      ...targetMonth,
      payments: [...targetMonth.payments, newPayment]
    };

    try {
      await setDoc(doc(db, "months", currentMonthId), updatedMonth);
    } catch (e) {
      console.error(e);
    }
  };

  // Action: Approve Ballot Wheel Selection
  const handleApproveBallotSelection = async (selectedWinners: Member[]) => {
    const winnerIds = selectedWinners.map(w => w.id);
    
    // Update active month recipients list
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (targetMonth) {
      const existingRecipients = targetMonth.recipients || [];
      const newRecipients = Array.from(new Set([...existingRecipients, ...winnerIds]));
      const updatedMonth: ContributionMonth = {
        ...targetMonth,
        recipients: newRecipients
      };
      try {
        await setDoc(doc(db, "months", currentMonthId), updatedMonth);
      } catch (e) {
        console.error(e);
      }
    }

    // Mark winner histories in members
    for (const m of members) {
      if (winnerIds.includes(m.id)) {
        const updatedMem: Member = {
          ...m,
          collectedMonths: m.collectedMonths.includes(currentMonthId)
            ? m.collectedMonths
            : [...m.collectedMonths, currentMonthId]
        };
        try {
          await setDoc(doc(db, "members", m.id), updatedMem);
        } catch (e) {
          console.error(e);
        }
      }
    }

    // Trigger notification packet mock in chat
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

  // Action: Toggle / Manual overriding confirmation
  const handleManualPayment = async (memberId: string, approved: boolean, recipientId?: string) => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;

    let updatedMonth: ContributionMonth;

    if (approved) {
      // If recipientId is specified, only pay them, otherwise pay all winners this member owes
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
      await setDoc(doc(db, "months", currentMonthId), updatedMonth);
    } catch (e) {
      console.error(e);
    }
  };

  // Action: Confirm pot payout receipt by winning member
  const handleConfirmPayoutReceipt = async (memberId: string, monthId: string) => {
    const targetMonth = months.find(m => m.id === monthId);
    if (!targetMonth) return;

    const confirmed = targetMonth.payoutConfirmedByRecipients || [];
    if (confirmed.includes(memberId)) return;

    const updatedMonth: ContributionMonth = {
      ...targetMonth,
      payoutConfirmedByRecipients: [...confirmed, memberId]
    };

    try {
      await setDoc(doc(db, "months", monthId), updatedMonth);
    } catch (e) {
      console.error(e);
    }
  };

  // Action: Complete and close existing month pool
  const handleCloseRound = async () => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;

    const updatedCurrentMonth: ContributionMonth = {
      ...targetMonth,
      status: "COMPLETED" as const
    };

    try {
      await setDoc(doc(db, "months", currentMonthId), updatedCurrentMonth);
    } catch (e) {
      console.error(e);
    }

    // Setup newly initialized following month automatically!
    const nextMonthId = "2026-07";
    const nextMonthName = "July 2026";
    
    // Check if next month exists, or append
    const exists = months.some(m => m.id === nextMonthId);
    if (!exists) {
      const nextMonthObj: ContributionMonth = {
        id: nextMonthId,
        name: nextMonthName,
        targetAmountPerMember: targetMonth.targetAmountPerMember,
        recipientsCount: targetMonth.recipientsCount,
        recipients: [],
        status: "ACTIVE" as const,
        payments: []
      };
      try {
        await setDoc(doc(db, "months", nextMonthId), nextMonthObj);
      } catch (e) {
        console.error(e);
      }
    }
    
    setCurrentMonthId(nextMonthId);
    setActiveTab("dashboard");
  };

  const [copiedLink, setCopiedLink] = useState(false);
  const handleCopyLink = () => {
    const link = window.location.origin + window.location.pathname + "?role=member";
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      
      {/* Dynamic Header Frame */}
      <header className="bg-white border-b border-slate-100 py-4 px-6 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          
          {/* Western branding */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-extrabold shadow-md shadow-indigo-600/10 float-left">
              AJO
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">Ajo Contribution Portal</h1>
              <p className="text-xs text-slate-400 font-medium tracking-tight">Rotating Savings & Credit Ledger (ROSCA)</p>
            </div>
          </div>

          {/* Active Round Metrics Indicator */}
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

      {/* Main Core Viewport area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        
        {/* Share Utility / Mode Banner */}
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
            
            <button
              onClick={handleCopyLink}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                copiedLink 
                  ? "bg-emerald-600 text-white shadow font-semibold" 
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow font-semibold"
              }`}
            >
              {copiedLink ? (
                <>
                  <span>✓ Copied Link!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Copy Member Link</span>
                </>
              )}
            </button>
          </div>
        ) : null}

        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap bg-slate-200/50 rounded-xl p-1 max-w-4xl gap-1">
          <button
            onClick={() => setActiveTab("portal")}
            className={`flex items-center gap-1.5 flex-1 min-w-[120px] justify-center py-2.5 px-3 rounded-lg text-xs font-extrabold transition duration-200 ${
              activeTab === "portal" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-800 hover:bg-white/30"
            }`}
          >
            <User className="h-4 w-4" />
            <span>👥 Member Portal</span>
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

        {/* Tab Viewport Routing Container */}
        <div className="min-h-[450px]">
          {activeTab === "portal" && (
            <MemberPortal
              members={members}
              months={months}
              currentMonthId={currentMonthId}
              currency="₦"
              onAddMember={handleAddMember}
              onPaymentApproved={(mId, amt, ref, sName, rId) => handleRecordPayment(mId, amt, ref, sName, rId)}
              onConfirmPayoutReceipt={handleConfirmPayoutReceipt}
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
            />
          )}

          {activeTab === "ballot" && (
            <BallotWheel
              eligibleMembers={eligibleMembers}
              onSelected={handleApproveBallotSelection}
              payoutCount={currentMonth?.recipientsCount || 1}
              monthName={currentMonth?.name || "N/A"}
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
              
              {/* Info panel */}
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

              {/* Mobile Phone Mock UI */}
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

      {/* Modern custom footer credit line */}
      <footer className="bg-white border-t border-slate-100 py-4 px-6 text-center text-xs text-slate-400 font-medium">
        <p>© 2026 Ajo ROSCA Portal • Fully Autonomous WhatsApp Group Contribution Assistant • Running on Gemini 3.5</p>
      </footer>

    </div>
  );
}
