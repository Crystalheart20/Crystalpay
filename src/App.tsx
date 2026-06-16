import React, { useState, useEffect } from "react";
import { Member, ContributionMonth, PaymentLog } from "./types";
import Dashboard from "./components/Dashboard";
import BallotWheel from "./components/BallotWheel";
import ReceiptVerifier from "./components/ReceiptVerifier";
import WhatsAppSimulator from "./components/WhatsAppSimulator";
import MemberPortal from "./components/MemberPortal";
import { Users, Coins, Percent, Award, ShieldCheck, MessageSquare, PlusCircle, CreditCard, Sparkles, LayoutDashboard, Calendar, User, Share2 } from "lucide-react";

// Seed default members for the Rotating Savings (Ajo) system to pre-exist
const INITIAL_MEMBERS: Member[] = [
  { id: "mem-1", name: "Chikodi Nwankwo", phone: "+234 803 111 2222", bankName: "GTBank", accountNo: "0123456789", accountName: "Chikodi Nwankwo", collectedMonths: ["2026-04"], isActive: true },
  { id: "mem-2", name: "Funmi Adebayo", phone: "+234 812 333 4444", bankName: "Zenith Bank", accountNo: "2233445566", accountName: "Funmi Adebayo", collectedMonths: ["2026-05"], isActive: true },
  { id: "mem-3", name: "Ibrahim Musa", phone: "+234 905 555 6666", bankName: "Access Bank", accountNo: "5566778899", accountName: "Ibrahim Musa", collectedMonths: [], isActive: true },
  { id: "mem-4", name: "Ngozi Okafor", phone: "+234 809 777 8888", bankName: "United Bank for Africa (UBA)", accountNo: "1029384756", accountName: "Ngozi Okafor", collectedMonths: [], isActive: true },
  { id: "mem-5", name: "Tunde Bakare", phone: "+234 815 999 0000", bankName: "First Bank", accountNo: "9080706050", accountName: "Tunde Bakare", collectedMonths: [], isActive: true },
  { id: "mem-6", name: "Amara Nwachukwu", phone: "+234 810 123 4567", bankName: "Fidelity Bank", accountNo: "1122334455", accountName: "Amara Nwachukwu", collectedMonths: [], isActive: true },
  { id: "mem-7", name: "Yusuf Alabi", phone: "+234 902 987 6543", bankName: "Sterling Bank", accountNo: "7788990011", accountName: "Yusuf Alabi", collectedMonths: [], isActive: true },
];

const INITIAL_MONTHS: ContributionMonth[] = [
  {
    id: "2026-06",
    name: "June 2026",
    targetAmountPerMember: 100000,
    recipientsCount: 1,
    recipients: ["mem-3"], // Ibrahim Musa was picked previously or represents current winner
    status: "ACTIVE",
    payments: [
      { memberId: "mem-1", amount: 100000, date: "2026-06-05", transactionRef: "REF-GTB-4819741", senderAccountName: "Chikodi Nwankwo", verifiedByAI: true },
      { memberId: "mem-2", amount: 100000, date: "2026-06-08", transactionRef: "REF-ZNT-6490134", senderAccountName: "Funmi Adebayo", verifiedByAI: true }
    ]
  }
];

export default function App() {
  const [members, setMembers] = useState<Member[]>(() => {
    const saved = localStorage.getItem("ajo_members");
    return saved ? JSON.parse(saved) : INITIAL_MEMBERS;
  });

  const [months, setMonths] = useState<ContributionMonth[]>(() => {
    const saved = localStorage.getItem("ajo_months");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ContributionMonth[];
        // Auto-migrate "10000" (the previous default) to "100000" (100,000 NGN) to meet updated guidelines
        return parsed.map(m => {
          if (m.targetAmountPerMember === 10000) {
            return {
              ...m,
              targetAmountPerMember: 100000,
              payments: m.payments.map(p => p.amount === 10000 ? { ...p, amount: 100000 } : p)
            };
          }
          return m;
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
  const handleAddMember = (newMem: Omit<Member, "id" | "collectedMonths" | "isActive">) => {
    const fresh: Member = {
      ...newMem,
      id: "mem-" + Date.now(),
      collectedMonths: [],
      isActive: true
    };
    setMembers(prev => [...prev, fresh]);
  };

  // Action: Remove/Delete member
  const handleRemoveMember = (id: string) => {
    setMembers(prev => prev.filter(m => m.id !== id));
    // Clean up payment logs and recipient slots for deleted members to keep database pristine
    setMonths(prev => prev.map(m => ({
      ...m,
      recipients: m.recipients.filter(rId => rId !== id),
      payments: m.payments.filter(p => p.memberId !== id && p.recipientId !== id)
    })));
  };

  // Action: Reset entire application to pristine start
  const handleResetToPristine = () => {
    localStorage.removeItem("ajo_members");
    localStorage.removeItem("ajo_months");
    setMembers([]);
    setMonths([
      {
        id: "2026-06",
        name: "June 2026",
        targetAmountPerMember: 100000,
        recipientsCount: 1,
        recipients: [],
        status: "ACTIVE" as const,
        payments: []
      }
    ]);
    setCurrentMonthId("2026-06");
  };

  // Action: Set/configure current round variables
  const handleConfigureMonth = (amount: number, spots: 1 | 2, currencyCode: string) => {
    setMonths(prev => prev.map(m => {
      if (m.id === currentMonthId) {
        return {
          ...m,
          targetAmountPerMember: amount,
          recipientsCount: spots
        };
      }
      return m;
    }));
  };

  // Action: Record payment verified (manually or through Gemini OCR)
  const handleRecordPayment = (memberId: string, amount: number, ref: string, senderName?: string, recipientId?: string) => {
    setMonths(prev => prev.map(m => {
      if (m.id === currentMonthId) {
        // Prevent duplicate payment entry log for this recipient
        const targetRecipient = recipientId || m.recipients[0];
        const exists = m.payments.some(p => p.memberId === memberId && p.recipientId === targetRecipient);
        if (exists) return m;

        const newPayment: PaymentLog = {
          memberId,
          amount,
          date: new Date().toISOString().split('T')[0],
          transactionRef: ref,
          senderAccountName: senderName || "Verified Member",
          verifiedByAI: true,
          recipientId: targetRecipient
        };

        return {
          ...m,
          payments: [...m.payments, newPayment]
        };
      }
      return m;
    }));
  };

  // Action: Approve Ballot Wheel Selection
  const handleApproveBallotSelection = (selectedWinners: Member[]) => {
    const winnerIds = selectedWinners.map(w => w.id);
    
    // Update active month recipients list
    setMonths(prev => prev.map(mon => {
      if (mon.id === currentMonthId) {
        return {
          ...mon,
          recipients: winnerIds
        };
      }
      return mon;
    }));

    // Mark winner histories
    setMembers(prev => prev.map(m => {
      if (winnerIds.includes(m.id)) {
        return {
          ...m,
          collectedMonths: [...m.collectedMonths, currentMonthId]
        };
      }
      return m;
    }));

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
  const handleManualPayment = (memberId: string, approved: boolean, recipientId?: string) => {
    setMonths(prev => prev.map(m => {
      if (m.id === currentMonthId) {
        if (approved) {
          // If recipientId is specified, only pay them, otherwise pay all winners this member owes
          const recipientsToPay = recipientId ? [recipientId] : m.recipients.filter(rId => rId !== memberId);
          
          let newPayments = [...m.payments];
          recipientsToPay.forEach(targetRecId => {
            const exists = newPayments.some(p => p.memberId === memberId && p.recipientId === targetRecId);
            if (!exists) {
              newPayments.push({
                memberId,
                amount: m.targetAmountPerMember,
                date: new Date().toISOString().split('T')[0],
                transactionRef: "OVERRIDE-" + Math.floor(Math.random() * 100000),
                senderAccountName: "System Approved",
                verifiedByAI: false,
                recipientId: targetRecId
              });
            }
          });
          
          return {
            ...m,
            payments: newPayments
          };
        } else {
          // Clear payment manual override
          return {
            ...m,
            payments: recipientId
              ? m.payments.filter(p => !(p.memberId === memberId && p.recipientId === recipientId))
              : m.payments.filter(p => p.memberId !== memberId)
          };
        }
      }
      return m;
    }));
  };

  // Action: Confirm pot payout receipt by winning member
  const handleConfirmPayoutReceipt = (memberId: string, monthId: string) => {
    setMonths(prev => prev.map(m => {
      if (m.id === monthId) {
        const confirmed = m.payoutConfirmedByRecipients || [];
        if (confirmed.includes(memberId)) return m;
        return {
          ...m,
          payoutConfirmedByRecipients: [...confirmed, memberId]
        };
      }
      return m;
    }));
  };

  // Action: Complete and close existing month pool
  const handleCloseRound = () => {
    setMonths(prev => prev.map(m => {
      if (m.id === currentMonthId) {
        return {
          ...m,
          status: "COMPLETED" as const
        };
      }
      return m;
    }));

    // Setup newly initialized following month automatically!
    const nextMonthId = "2026-07";
    const nextMonthName = "July 2026";
    
    // Check if next month exists, or append
    const exists = months.some(m => m.id === nextMonthId);
    if (!exists) {
      const nextMonthObj: ContributionMonth = {
        id: nextMonthId,
        name: nextMonthName,
        targetAmountPerMember: currentMonth.targetAmountPerMember,
        recipientsCount: currentMonth.recipientsCount,
        recipients: [],
        status: "ACTIVE" as const,
        payments: []
      };
      setMonths(prev => [...prev, nextMonthObj]);
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
        ) : (
          <div className="bg-amber-500/10 border border-amber-200/70 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
            <div className="space-y-1">
              <span className="font-extrabold text-amber-800 flex items-center gap-1.5">
                👥 Member Only Access Mode
              </span>
              <p className="text-amber-700 leading-relaxed">
                You are currently viewing the group's contribution portal as an end-member. Administrative tools are hidden.
              </p>
            </div>

            <button
              onClick={() => {
                setIsMemberOnlyUrl(false);
                setActiveTab("dashboard");
                // Remove parameter from URL history quietly
                const url = new URL(window.location.href);
                url.searchParams.delete("role");
                url.searchParams.delete("portal");
                window.history.pushState({}, "", url.toString());
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold transition text-[11px]"
            >
              🛠 Switch to Admin Mode (Demo)
            </button>
          </div>
        )}

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
