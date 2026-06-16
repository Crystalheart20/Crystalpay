import React, { useState } from "react";
import { Member, ContributionMonth, PaymentLog } from "../types";
import { Users, Coins, ClipboardList, Send, Calendar, CheckCircle, Clock, Plus, Trash2, Edit2, AlertCircle, Sparkles, Copy, Check, ChevronRight } from "lucide-react";

interface DashboardProps {
  members: Member[];
  months: ContributionMonth[];
  currentMonthId: string;
  currency: string;
  onAddMember: (member: Omit<Member, "id" | "collectedMonths" | "isActive">) => void;
  onRemoveMember: (id: string) => void;
  onConfigureMonth: (targetAmount: number, spots: 1 | 2, currencyCode: string) => void;
  onManualPayment: (memberId: string, approved: boolean) => void;
  onCloseRound: () => void;
}

export default function Dashboard({
  members,
  months,
  currentMonthId,
  currency,
  onAddMember,
  onRemoveMember,
  onConfigureMonth,
  onManualPayment,
  onCloseRound
}: DashboardProps) {
  // Member Registration State
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [newMemberBank, setNewMemberBank] = useState("");
  const [newMemberAccNo, setNewMemberAccNo] = useState("");
  const [newMemberAccName, setNewMemberAccName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // Month Configuration State
  const [amountInput, setAmountInput] = useState(20000);
  const [spotsInput, setSpotsInput] = useState<1 | 2>(1);
  const [currencyInput, setCurrencyInput] = useState("NGN");

  // WhatsApp reminder generator state
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const currentMonth = months.find(m => m.id === currentMonthId);
  const totalRecipients = currentMonth ? currentMonth.recipients.length : 0;
  
  // Calculate dynamic stats
  const totalMembersCount = members.length;
  const paidMembersCount = currentMonth 
    ? members.filter(m => currentMonth.payments.some(p => p.memberId === m.id)).length
    : 0;
  const pendingMembersCount = totalMembersCount - paidMembersCount;
  
  const payoutGoal = currentMonth 
    ? (currentMonth.targetAmountPerMember * (totalMembersCount - currentMonth.recipients.length))
    : 0;

  const currentPoolPaid = currentMonth 
    ? currentMonth.payments.reduce((sum, p) => sum + p.amount, 0)
    : 0;

  const activeRecipientsList = currentMonth 
    ? members.filter(m => currentMonth.recipients.includes(m.id))
    : [];

  const handleRegisterMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName || !newMemberBank || !newMemberAccNo) return;
    onAddMember({
      name: newMemberName,
      phone: newMemberPhone || "N/A",
      bankName: newMemberBank,
      accountNo: newMemberAccNo,
      accountName: newMemberAccName || newMemberName
    });
    
    // Reset Form
    setNewMemberName("");
    setNewMemberPhone("");
    setNewMemberBank("");
    setNewMemberAccNo("");
    setNewMemberAccName("");
    setIsRegistering(false);
  };

  const handleApplyConfiguration = () => {
    onConfigureMonth(amountInput, spotsInput, currencyInput);
  };

  const handleGenerateWhatsAppNotice = async (type: "draw" | "reminder" | "closing") => {
    if (!currentMonth) return;
    setGeneratingType(type);
    setGeneratedMessage("");
    
    const paidList = members.filter(m => currentMonth.payments.some(p => p.memberId === m.id));
    const pendingList = members.filter(m => !currentMonth.payments.some(p => p.memberId === m.id) && !currentMonth.recipients.includes(m.id));

    try {
      const res = await fetch("/api/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          roundName: currentMonth.name,
          payoutAmount: payoutGoal,
          currency: currencyInput,
          recipients: activeRecipientsList,
          paidMembers: paidList,
          pendingMembers: pendingList,
          additionalNotes: "Generated dynamically via Group Ledger System."
        })
      });
      const data = await res.json();
      setGeneratedMessage(data.text);
    } catch (e) {
      console.error(e);
      setGeneratedMessage("Failed to connect to AI writer. Please check connection.");
    } finally {
      setGeneratingType(null);
    }
  };

  const copyText = () => {
    navigator.clipboard.writeText(generatedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Level Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Total Pool size */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-tight">Pot Goal size</span>
            <h3 className="text-xl font-extrabold text-slate-800 mt-1">
              {currency} {payoutGoal.toLocaleString()}
            </h3>
            <p className="text-[10px] text-slate-400 mt-1">
              {currency} {currentMonth?.targetAmountPerMember.toLocaleString()} × {totalMembersCount - (currentMonth?.recipients.length || 0)} members
            </p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Coins className="h-6 w-6" />
          </div>
        </div>

        {/* Card 2: Current Collection size */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center justify-between animate-fade-in">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-tight">Collected Pool</span>
            <h3 className="text-xl font-extrabold text-slate-800 mt-1">
              {currency} {currentPoolPaid.toLocaleString()}
            </h3>
            <p className="text-[10px] text-emerald-600 font-semibold mt-1">
              {payoutGoal > 0 ? ((currentPoolPaid / payoutGoal) * 100).toFixed(0) : 0}% Complete
            </p>
          </div>
          <div className="p-3 bg-teal-50 rounded-xl text-teal-600">
            <ClipboardList className="h-6 w-6" />
          </div>
        </div>

        {/* Card 3: Paid members ratio */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-tight">Audited Accounts</span>
            <h3 className="text-xl font-extrabold text-slate-800 mt-1">
              {paidMembersCount} / {totalMembersCount} Paid
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-500 animate-spin" /> {pendingMembersCount} outstanding invoices
            </p>
          </div>
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <CheckCircle className="h-6 w-6" />
          </div>
        </div>

        {/* Card 4: Recipients slots count */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-tight">Elected Recipients</span>
            <h3 className="text-xl font-extrabold text-slate-800 mt-1">
              {totalRecipients > 0 ? activeRecipientsList.map(r => r.name).join(", ") : "Pending Ballot..."}
            </h3>
            <p className="text-[10px] text-slate-400 mt-1">
              Target recipients: {currentMonth?.recipientsCount || 1} Slot(s)
            </p>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
            <Users className="h-6 w-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Members Management Column */}
        <div className="lg:col-span-8 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-slate-800">Members Ledger</h2>
            </div>
            
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Register Member
            </button>
          </div>

          {/* Member Registration Expandable Panel */}
          {isRegistering && (
            <form onSubmit={handleRegisterMember} className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Memeber Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chukwuma Obi"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-white border border-slate-300 mt-1 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Phone Number (WhatsApp)</label>
                <input
                  type="text"
                  placeholder="e.g. +234 812 345 6789"
                  value={newMemberPhone}
                  onChange={(e) => setNewMemberPhone(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-white border border-slate-300 mt-1 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Bank/Institution Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Access Bank"
                  value={newMemberBank}
                  onChange={(e) => setNewMemberBank(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-white border border-slate-300 mt-1 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Account Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 0123456789"
                  value={newMemberAccNo}
                  onChange={(e) => setNewMemberAccNo(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-white border border-slate-300 mt-1 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Account Holder Name</label>
                <input
                  type="text"
                  placeholder="Leave empty if same as Name"
                  value={newMemberAccName}
                  onChange={(e) => setNewMemberAccName(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-white border border-slate-300 mt-1 focus:outline-none"
                />
              </div>
              <div className="md:col-span-3 flex justify-end gap-2 mt-2 border-t border-slate-200/40 pt-3">
                <button
                  type="button"
                  onClick={() => setIsRegistering(false)}
                  className="text-xs px-3.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  Register Profile
                </button>
              </div>
            </form>
          )}

          {/* Members Grid List / Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-2.5">Member Name</th>
                  <th className="py-2.5">Bank Accounts Details</th>
                  <th className="py-2.5">Collected Status</th>
                  <th className="py-2.5">Current Payment Status</th>
                  <th className="py-2.5 text-right">Auditor Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const isRecipient = currentMonth?.recipients.includes(m.id);
                  const isPaid = currentMonth?.payments.some(p => p.memberId === m.id);
                  const paymentLog = currentMonth?.payments.find(p => p.memberId === m.id);

                  return (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/40 transition">
                      <td className="py-3.5">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{m.name}</span>
                          <span className="text-[10px] font-mono text-slate-400 mt-0.5">{m.phone}</span>
                        </div>
                      </td>
                      <td className="py-3.5 font-mono">
                        <div className="flex flex-col text-[10px] text-slate-500">
                          <span className="font-semibold text-slate-700">{m.bankName}</span>
                          <span>{m.accountNo} • {m.accountName}</span>
                        </div>
                      </td>
                      <td className="py-3.5">
                        {isRecipient ? (
                          <span className="inline-flex px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px]">
                            🏆 Recipient
                          </span>
                        ) : m.collectedMonths.length > 0 ? (
                          <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium text-[10px]">
                            Won Round {m.collectedMonths[0]}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Eligible in pool</span>
                        )}
                      </td>
                      <td className="py-3.5">
                        {isRecipient ? (
                          <span className="text-rose-500 text-[10px] font-semibold">Exempted (Receiving)</span>
                        ) : isPaid ? (
                          <div className="flex flex-col">
                            <span className="inline-flex text-emerald-800 font-semibold gap-1 items-center">
                              ✅ Confirmed Alert
                            </span>
                            <span className="text-[9px] font-mono text-slate-400 truncate max-w-[100px]" title={paymentLog?.transactionRef}>
                              Ref: {paymentLog?.transactionRef.slice(0, 8)}...
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex text-amber-500 font-bold items-center gap-1">
                            ⏳ Outstanding
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        {!isRecipient && (
                          <button
                            onClick={() => onManualPayment(m.id, !isPaid)}
                            className={`px-2 py-1 rounded text-[10px] font-bold ${
                              isPaid 
                                ? "bg-amber-50 text-amber-600 hover:bg-amber-100" 
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                          >
                            {isPaid ? "Uncleared" : "Override Confirm"}
                          </button>
                        )}
                        <button
                          onClick={() => onRemoveMember(m.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition inline-block align-middle"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Configurations Column */}
        <div className="lg:col-span-4 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
            <Calendar className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">Configurations</h2>
          </div>

          {/* Month Target Form */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Set Monthly Contribution Target</h3>
            <div className="space-y-3.5 bg-slate-50/50 p-4 rounded-xl border border-slate-200/40">
              <div>
                <label className="text-[10px] font-bold text-slate-500">Contribution Target per Member</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">{currencyInput}</span>
                  <input
                    type="number"
                    value={amountInput}
                    onChange={(e) => setAmountInput(Number(e.target.value))}
                    className="w-full text-xs pl-12 pr-3 py-2 rounded-lg bg-white border border-slate-300 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500">Recipient Count</label>
                  <select
                    value={spotsInput}
                    onChange={(e) => setSpotsInput(Number(e.target.value) as 1 | 2)}
                    className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 mt-1 focus:outline-none"
                  >
                    <option value={1}>1 Member</option>
                    <option value={2}>2 Members</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500">Currency Code</label>
                  <select
                    value={currencyInput}
                    onChange={(e) => setCurrencyInput(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg bg-white border border-slate-300 mt-1 focus:outline-none"
                  >
                    <option value="NGN">NGN (₦)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GHS">GHS (₵)</option>
                    <option value="KES">KES (Sh)</option>
                    <option value="ZAR">ZAR (R)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleApplyConfiguration}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition"
              >
                Apply Parameters
              </button>
            </div>
          </div>

          {/* AI Message generators Copier */}
          {currentMonth && (
            <div className="space-y-4 pt-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> WhatsApp Template Generator
              </h3>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => handleGenerateWhatsAppNotice("draw")}
                  disabled={generatingType !== null}
                  className="bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-[10px] font-bold py-1.5 rounded transition"
                >
                  Draw Notice
                </button>
                <button
                  onClick={() => handleGenerateWhatsAppNotice("reminder")}
                  disabled={generatingType !== null}
                  className="bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-[10px] font-bold py-1.5 rounded transition"
                >
                  Pay Notice
                </button>
                <button
                  onClick={() => handleGenerateWhatsAppNotice("closing")}
                  disabled={generatingType !== null}
                  className="bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-[10px] font-bold py-1.5 rounded transition"
                >
                  Closing Log
                </button>
              </div>

              {generatingType && (
                <div className="text-center py-4 bg-slate-50 rounded-lg">
                  <div className="animate-pulse text-xs text-indigo-700 font-semibold">Generators compiling prompt...</div>
                </div>
              )}

              {generatedMessage && (
                <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 text-slate-100 relative">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Draft Markdown</span>
                    <button
                      onClick={copyText}
                      className="text-white hover:text-indigo-300 text-[10px] font-semibold flex items-center gap-1 transition"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="text-xs font-mono font-medium leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {generatedMessage}
                  </pre>
                </div>
              )}

              {/* Close Round button */}
              <button
                onClick={onCloseRound}
                disabled={currentMonth.status === "COMPLETED"}
                className={`w-full py-3 mt-4 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition ${
                  currentMonth?.status === "COMPLETED" 
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200" 
                    : "bg-rose-600 hover:bg-rose-700 text-white"
                }`}
              >
                End Monthly Round
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
