import React, { useState, useRef, useEffect } from "react";
import { Member, ContributionMonth } from "../types";
import { 
  ShieldCheck, 
  Sparkles, 
  Loader2, 
  Copy, 
  Check, 
  Upload, 
  CheckCircle, 
  AlertTriangle, 
  Coins, 
  LogIn, 
  UserPlus, 
  LogOut, 
  Trophy, 
  ArrowRight,
  Phone,
  FileText,
  BadgePercent,
  CheckSquare,
  Inbox
} from "lucide-react";

interface MemberPortalProps {
  members: Member[];
  months: ContributionMonth[];
  currentMonthId: string;
  currency: string;
  onAddMember: (member: Omit<Member, "id" | "collectedMonths" | "isActive">) => void;
  onPaymentApproved: (memberId: string, amount: number, ref: string, senderName?: string, recipientId?: string) => void;
  onConfirmPayoutReceipt: (memberId: string, monthId: string) => void;
  onConfirmPaymentCredit?: (memberId: string, recipientId: string, transactionRef: string) => Promise<void>;
  onLoginChange?: (groupId: string) => void;
}

export default function MemberPortal({
  members,
  months,
  currentMonthId,
  currency,
  onAddMember,
  onPaymentApproved,
  onConfirmPayoutReceipt,
  onConfirmPaymentCredit,
  onLoginChange
}: MemberPortalProps) {
  // Authentication & Session state
  const [loggedInMemberId, setLoggedInMemberId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMemberId = params.get("memberId");
    if (urlMemberId && members.some(m => m.id === urlMemberId)) {
      localStorage.setItem("ajo_member_session", urlMemberId);
      return urlMemberId;
    }
    return localStorage.getItem("ajo_member_session") || "";
  });

  // Sync session once async members load from Firebase
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMemberId = params.get("memberId");
    if (urlMemberId && members.some(m => m.id === urlMemberId)) {
      if (loggedInMemberId !== urlMemberId) {
        setLoggedInMemberId(urlMemberId);
        localStorage.setItem("ajo_member_session", urlMemberId);
      }
    }
  }, [members, loggedInMemberId]);
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Selected Recipient for contribution
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("");

  // Self Registration Form state
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regBank, setRegBank] = useState("");
  const [regAccountNo, setRegAccountNo] = useState("");
  const [regAccountName, setRegAccountName] = useState("");
  const [regSuccessMsg, setRegSuccessMsg] = useState("");

  // Receipt Verifier State inside portal
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [manualText, setManualText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<any | null>(null);
  const [auditError, setAuditError] = useState("");
  
  // UX Copy trigger state
  const [copiedAccNo, setCopiedAccNo] = useState<string | null>(null);
  const [receiptConfirming, setReceiptConfirming] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentMonth = months.find(m => m.id === currentMonthId) || months[0];
  const loggedInMember = members.find(m => m.id === loggedInMemberId);

  // Constants & Metrics
  const activeRecipientsList = currentMonth 
    ? members.filter(m => currentMonth.recipients.includes(m.id))
    : [];

  const targetAmount = currentMonth?.targetAmountPerMember || 100000;

  // Get the recipient(s) that this specific member owes a contribution to this month (Deterministic split-pay)
  const winnersOwed = (() => {
    if (!currentMonth || !loggedInMemberId) return [];
    
    // If the logged-in member is featured as a recipient themselves, they are exempt!
    if (currentMonth.recipients.includes(loggedInMemberId)) {
      return [];
    }

    const recipients = members.filter(m => currentMonth.recipients.includes(m.id));
    if (recipients.length === 0) return [];

    if (recipients.length === 1) {
      // Standard flow: everyone pays the single winner
      return recipients;
    }

    if (recipients.length === 2) {
      // 2 recipients split-billing flow:
      // Sort non-recipient members (contributors) by ID to be perfectly deterministic across all portals
      const contributors = members
        .filter(m => !currentMonth.recipients.includes(m.id))
        .sort((a, b) => a.id.localeCompare(b.id));

      const myIndex = contributors.findIndex(c => c.id === loggedInMemberId);
      if (myIndex === -1) {
        // Fallback context: if not found, let them pay first recipient
        return [recipients[0]];
      }

      const halfLimit = Math.ceil(contributors.length / 2);
      if (myIndex < halfLimit) {
        return [recipients[0]];
      } else {
        return [recipients[1]];
      }
    }

    // Default general fallback
    return recipients;
  })();

  // Auto-initialize selected recipient to the first assigned recipient
  useEffect(() => {
    if (winnersOwed.length > 0) {
      setSelectedRecipientId(winnersOwed[0].id);
    } else {
      setSelectedRecipientId("");
    }
  }, [winnersOwed]);
  
  // Checks if payment is already recorded for current member
  const hasPaidCurrentMonth = currentMonth?.payments.some(p => p.memberId === loggedInMemberId);
  const isSelectedRecipientThisMonth = currentMonth?.recipients.includes(loggedInMemberId);

  // Check if payout is already confirmed by this recipient
  const isPayoutConfirmedByThisRecipient = currentMonth?.payoutConfirmedByRecipients?.includes(loggedInMemberId) || false;

  const handleLogin = (memberId: string) => {
    if (!memberId) return;
    setLoggedInMemberId(memberId);
    localStorage.setItem("ajo_member_session", memberId);
    resetUploadState();

    const loggedMember = members.find(m => m.id === memberId);
    if (loggedMember && loggedMember.groupId && onLoginChange) {
      onLoginChange(loggedMember.groupId);
    }
  };

  const handleLogout = () => {
    setLoggedInMemberId("");
    localStorage.removeItem("ajo_member_session");
    resetUploadState();
  };

  const handleRegisterSelf = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regBank || !regAccountNo) {
      setAuditError("Please fill out all required fields marked with *");
      return;
    }

    // Call registration prop
    onAddMember({
      name: regName,
      phone: regPhone || "N/A",
      bankName: regBank,
      accountNo: regAccountNo,
      accountName: regAccountName || regName
    });

    setRegSuccessMsg(`Congratulations ${regName}! You have registered successfully. You can now log in below.`);
    
    // Auto populate newly registered profile login matching by name or just resetting
    setRegName("");
    setRegPhone("");
    setRegBank("");
    setRegAccountNo("");
    setRegAccountName("");
    
    setTimeout(() => {
      setIsRegisterMode(false);
      setRegSuccessMsg("");
    }, 4000);
  };

  // Drag & Drop Handling
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const compressAndResizeImage = (base64Str: string, maxWidth = 1024, maxHeight = 1024, quality = 0.85): Promise<string> => {
    return new Promise((resolve) => {
      if (base64Str.length < 150000) {
        resolve(base64Str);
        return;
      }
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  const processFile = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAuditError("Please upload an image file (PNG/JPEG/GIF) of your receipt.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      compressAndResizeImage(base64).then((compressed) => {
        setImagePreview(compressed);
        setAuditError("");
        setAuditResult(null);
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleAuditProof = async () => {
    if (!loggedInMemberId) return;
    if (!imagePreview && !manualText.trim()) {
      setAuditError("Please upload an transaction proof screenshot or paste your credit SMS.");
      return;
    }

    setUploading(true);
    setAuditError("");
    setAuditResult(null);

    const targetRecipientId = selectedRecipientId || (winnersOwed.length > 0 ? winnersOwed[0].id : "");

    try {
      const response = await fetch("/api/verify-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imagePreview,
          text: manualText,
          expectedAmount: targetAmount,
          memberName: loggedInMember?.name || "Member"
        })
      });

      if (!response.ok) {
        throw new Error("Gemini audit is temporarily offline or returned an error.");
      }

      const auditData = await response.json();
      setAuditResult(auditData);

      // Save payment state in App if auto-approved by Gemini
      if (auditData.isReceipt && auditData.status === "APPROVED") {
        onPaymentApproved(
          loggedInMemberId,
          auditData.amount || targetAmount,
          auditData.transactionReference || ("TXN-" + Date.now()),
          auditData.senderName || loggedInMember?.name,
          targetRecipientId
        );
      }
    } catch (err: any) {
      console.error(err);
      setAuditError(err.message || "Failed to process receipt validation with Gemini OCR.");
    } finally {
      setUploading(false);
    }
  };

  const resetUploadState = () => {
    setImagePreview(null);
    setManualText("");
    setAuditResult(null);
    setAuditError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAccNo(id);
    setSelectedRecipientId(id); // Auto-select this winner for transfer verification proof
    setTimeout(() => setCopiedAccNo(null), 1500);
  };

  const handleConfirmPayout = () => {
    if (!loggedInMemberId) return;
    setReceiptConfirming(true);
    // Simulate minor visual confirmation timing
    setTimeout(() => {
      onConfirmPayoutReceipt(loggedInMemberId, currentMonthId);
      setReceiptConfirming(false);
    }, 1200);
  };

  // Compute calculated metrics
  const poolSize = targetAmount * (members.length - (currentMonth?.recipients.length || 0));

  // Calculate this specific recipient's expected payout (half of total pool if 2 recipients, whole pool if 1)
  const myExpectedPayout = (() => {
    if (!currentMonth) return 0;
    const totalRecipients = currentMonth.recipients.length;
    if (totalRecipients === 0) return 0;
    
    // Total contributors (non-recipients)
    const contributors = members.filter(m => !currentMonth.recipients.includes(m.id));
    const totalPool = contributors.length * targetAmount;
    
    if (totalRecipients === 1) {
      return totalPool;
    }
    
    if (totalRecipients === 2) {
      const sortedContributors = [...contributors].sort((a, b) => a.id.localeCompare(b.id));
      const recipientIndex = currentMonth.recipients.indexOf(loggedInMemberId);
      if (recipientIndex === -1) {
        return totalPool / 2;
      }
      
      const halfLimit = Math.ceil(sortedContributors.length / 2);
      if (recipientIndex === 0) {
        return halfLimit * targetAmount;
      } else {
        return (sortedContributors.length - halfLimit) * targetAmount;
      }
    }
    
    return totalPool / totalRecipients;
  })();

  return (
    <div className="space-y-6">
      
      {/* Step 1: Not Logged In Viewport */}
      {!loggedInMember ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center min-h-[400px]">
          
          <div className="lg:col-span-6 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>West African Ajo Self-Service</span>
            </div>
            
            <h2 className="text-3xl font-black text-slate-800 tracking-tight leading-tight">
              Secure <span className="text-indigo-600">Ajo Rotating Savings</span> Member Portal
            </h2>

            <p className="text-slate-500 text-sm leading-relaxed">
              Welcome back to your central savings community hub. Log in to copy the active rotational winner's bank numbers, submit system payment proof screenshots, process OCR instant verification audits, and coordinate direct trust transparency.
            </p>

            <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-4 flex gap-3 text-xs leading-relaxed text-amber-800">
              <Coins className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold mb-0.5">Active Contribution Month: {currentMonth?.name || "N/A"}</strong>
                <span>Each scheduled member is contributing <strong className="text-slate-900 font-bold">{currency} {targetAmount.toLocaleString()}</strong> towards the selected winners this round.</span>
              </div>
            </div>

            {activeRecipientsList.length > 0 ? (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wide">
                  <Trophy className="w-4 h-4 text-amber-500 animate-bounce" />
                  <span>🎉 Approved Rotational Winners ({currentMonth?.name})</span>
                </div>
                <div className="space-y-2">
                  {activeRecipientsList.map((winner, idx) => (
                    <div key={winner.id} className="bg-white/85 p-3 rounded-xl border border-emerald-100 flex justify-between items-center gap-2">
                      <div>
                        <p className="font-extrabold text-xs text-slate-800">{idx + 1}. {winner.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{winner.bankName} • {winner.accountNo.slice(0, 4)}****</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase tracking-wider">
                        Selected Recipient
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500">
                <p className="font-semibold">⏳ No Ballot Draw Conducted Yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">The group administrator has not conducted the random ballot draw for this round yet. Log in to check your status or register your profile!</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-6 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
            
            {/* Tab selection for Log in vs Register */}
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setIsRegisterMode(false)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition duration-150 flex items-center justify-center gap-1.5 ${
                  !isRegisterMode ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>Log In Securely</span>
              </button>
              
              <button
                onClick={() => setIsRegisterMode(true)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition duration-150 flex items-center justify-center gap-1.5 ${
                  isRegisterMode ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Register Profile</span>
              </button>
            </div>

            {regSuccessMsg && (
              <div className="bg-emerald-50 text-emerald-800 p-4 border border-emerald-100 rounded-xl text-xs font-semibold leading-relaxed">
                {regSuccessMsg}
              </div>
            )}

            {/* Login View */}
            {!isRegisterMode ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Select Your Member Account</label>
                  <p className="text-[10px] text-slate-400">Choose your name from the certified Ajo register roster to enter your dashboard.</p>
                  
                  <select
                    onChange={(e) => handleLogin(e.target.value)}
                    value=""
                    className="w-full text-sm px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                  >
                    <option value="">-- Choose Profile to Log In --</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>
                        👥 {m.name} ({m.bankName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl text-xs text-slate-400 space-y-1">
                  <h4 className="font-bold text-slate-500 text-[10px] uppercase">Portal Feature Capabilities:</h4>
                  <p>• Copy target winner account numbers with 1 click</p>
                  <p>• Upload transfer receipt images for automated Gemini OCR verification</p>
                  <p>• Recipients can sign off/confirm payout receipts historically</p>
                </div>
              </div>
            ) : (
              /* Self Registration Form */
              <form onSubmit={handleRegisterSelf} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Kolawole Cole"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 mt-0.5 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">WhatsApp Phone</label>
                    <input
                      type="text"
                      placeholder="e.g. +234 803..."
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 mt-0.5 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Your Bank *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. GTBank, Access"
                      value={regBank}
                      onChange={(e) => setRegBank(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 mt-0.5 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Account Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 0123456789"
                      value={regAccountNo}
                      onChange={(e) => setRegAccountNo(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 mt-0.5 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Account Holder Name (If different)</label>
                  <input
                    type="text"
                    placeholder="e.g. Kolawole Cole"
                    value={regAccountName}
                    onChange={(e) => setRegAccountName(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 mt-0.5 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition"
                >
                  Register Profile and Save
                </button>
              </form>
            )}

          </div>

        </div>
      ) : (
        /* Step 2: Member dashboard portal! */
        <div className="space-y-6">
          
          {/* Dashboard Header Bar */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-black text-lg">
                {loggedInMember.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-800">Hello, {loggedInMember.name}!</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                    Ajo Active Contributor
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {loggedInMember.phone} • Bank: {loggedInMember.bankName} Account: {loggedInMember.accountNo}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-rose-500 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-xl border border-rose-100 flex items-center gap-1.5 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out Portal</span>
            </button>
          </div>

          {/* Banner: List of All Active Rotational Winners */}
          {activeRecipientsList.length > 0 ? (
            <div className="bg-gradient-to-r from-emerald-500/10 via-indigo-500/5 to-teal-500/10 border-2 border-emerald-500/20 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500 animate-bounce" />
                <div>
                  <h4 className="text-sm font-black text-slate-800">🎉 Approved Rotational Winners for {currentMonth?.name}</h4>
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    Rotational Pot Size: <strong className="text-slate-800 font-extrabold">{currency} {poolSize.toLocaleString()}</strong>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeRecipientsList.map((winner, idx) => {
                  const hasWonAlready = winner.id === loggedInMemberId;
                  return (
                    <div key={winner.id} className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition duration-200 ${
                      hasWonAlready 
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/15"
                        : "bg-white border-slate-200/70 text-slate-800 hover:border-slate-300"
                    }`}>
                      <div>
                        <p className={`font-extrabold ${hasWonAlready ? "text-white" : "text-slate-800"}`}>
                          {idx + 1}. {winner.name} {hasWonAlready && " (You!)"}
                        </p>
                        <p className={`text-[10px] ${hasWonAlready ? "text-indigo-200" : "text-slate-500"} font-mono mt-0.5`}>
                          {winner.bankName} • {winner.accountNo}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        hasWonAlready 
                          ? "bg-white text-indigo-700" 
                          : "bg-emerald-50 text-emerald-700 border border-emerald-100/60"
                      }`}>
                        Winner
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 text-center max-w-2xl mx-auto space-y-1">
              <p className="text-sm font-bold text-slate-700">⏳ Ballot Draw Awaiting Execution</p>
              <p className="text-xs text-slate-400">
                The group administrator has not conducted the random ballot draw for {currentMonth?.name} yet. Check back soon for approved recipients!
              </p>
            </div>
          )}

          {/* Persona Workflows */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LHS: Task List, Winner details and payment history */}
            <div className="lg:col-span-6 space-y-6">
              
              {/* Box 1: Payout recipient Details and Transfer instructions */}
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
                
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    <h4 className="font-bold text-slate-800 text-sm">Monthly Recipient Account Details</h4>
                  </div>
                  
                  <span className="text-xs font-bold text-indigo-600">
                    Target: {currency} {targetAmount.toLocaleString()}
                  </span>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Please proceed with your monthly direct bank transfer of <strong className="text-slate-900 font-bold">{currency} {targetAmount.toLocaleString()}</strong> to the current rotational pot winners listed below. Drop screenshot proofs in the next box.
                </p>

                {winnersOwed.length > 0 ? (
                  <div className="space-y-3.5">
                    {winnersOwed.map((rec, i) => (
                      <div key={rec.id} className="relative bg-slate-50/50 p-4 rounded-xl border border-slate-200/55 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Your Assigned Recipient</span>
                          <span className="text-sm font-extrabold text-slate-800 block">{rec.name}</span>
                          <div className="font-mono text-xs text-slate-500 space-y-0.5">
                            <p className="font-bold text-slate-600">{rec.bankName}</p>
                            <p>Holder: {rec.accountName}</p>
                            <p className="text-indigo-600 text-sm font-semibold">{rec.accountNo}</p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 self-end sm:self-center">
                          <button
                            onClick={() => copyToClipboard(rec.accountNo, `no-${rec.id}`)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-750 font-bold text-xs flex items-center gap-1.5 transition"
                          >
                            {copiedAccNo === `no-${rec.id}` ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>No. Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy No</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => {
                              const fullDetails = `Bank: ${rec.bankName}\nAccount Name: ${rec.accountName}\nAccount Number: ${rec.accountNo}`;
                              copyToClipboard(fullDetails, `full-${rec.id}`);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition"
                          >
                            {copiedAccNo === `full-${rec.id}` ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Details Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Full Details</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : isSelectedRecipientThisMonth ? (
                  <div className="text-center p-6 bg-emerald-50 rounded-xl border border-emerald-100/60 shadow-inner flex flex-col justify-center items-center gap-2">
                    <Trophy className="mx-auto h-8 w-8 text-emerald-600 animate-bounce" />
                    <p className="text-xs text-emerald-800 font-extrabold uppercase tracking-wide">🎉 Recipient Exemption!</p>
                    <p className="text-xs text-emerald-600 leading-normal max-w-sm mx-auto">
                      Since you are a savings pot recipient for this round, you are exempt from making contributions! The other assigned group members will pay you directly.
                    </p>
                  </div>
                ) : (
                  <div className="text-center p-6 bg-slate-50 rounded-xl">
                    <p className="text-xs text-slate-400 font-medium">Wait! The ballot draw hasn't been conducted for this round yet.</p>
                  </div>
                )}
              </div>

              {/* Box 1B: WINNER SPECIAL CONFIRMATION PORTAL PANEL */}
              {isSelectedRecipientThisMonth && (
                <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/5 to-indigo-500/10 rounded-2xl p-6 border-2 border-amber-500/20 shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-6 w-6 text-amber-500 animate-bounce" />
                    <div>
                      <h4 className="font-black text-slate-800 text-base">You are {currentMonth?.name} Recipient Winner!</h4>
                      <p className="text-[11px] text-slate-500 font-medium">Please check your bank account statement.</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {currentMonth?.recipients.length === 2 ? (
                      <>
                        As one of this round's <strong>two active Ajo recipients</strong>, you share the total round contributions of <strong className="text-slate-800 font-bold">{currency} {poolSize.toLocaleString()}</strong>.
                        Your half-share of the savings pot is exactly <strong className="text-slate-800 font-bold">{currency} {myExpectedPayout.toLocaleString()}</strong>, which is being transferred directly to your bank account of record by your assigned portion of group members.
                      </>
                    ) : (
                      <>
                        As this month's Rotational Ajo recipient, the total estimated savings pot size of <strong className="text-slate-800 font-bold">{currency} {poolSize.toLocaleString()}</strong> is being transferred directly to your bank account of record by the other members.
                      </>
                    )}
                  </p>

                  {/* INCOMING CREDITS SECTION */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wide border-b border-slate-100 pb-2">
                      <Inbox className="w-3.5 h-3.5 text-indigo-500 animate-bounce" />
                      <span>📥 Incoming Credits From Group Members</span>
                    </h5>

                    {(() => {
                      const incomingPayments = currentMonth?.payments.filter(p => p.recipientId === loggedInMemberId) || [];
                      
                      // Deterministic payment assignment matches MemberPortal expected payment calculation:
                      const expectedPayers = members.filter(m => {
                        if (!currentMonth) return false;
                        if (currentMonth.recipients.includes(m.id)) return false; // Recipients do not contribute
                        
                        if (currentMonth.recipients.length === 1) {
                          return true; // everyone pays the single recipient
                        } else if (currentMonth.recipients.length === 2) {
                          const contributors = members
                            .filter(mb => !currentMonth.recipients.includes(mb.id))
                            .sort((a, b) => a.id.localeCompare(b.id));
                          const index = contributors.findIndex(c => c.id === m.id);
                          const halfLimit = Math.ceil(contributors.length / 2);
                          if (loggedInMemberId === currentMonth.recipients[0]) {
                            return index >= 0 && index < halfLimit;
                          } else {
                            return index >= halfLimit;
                          }
                        }
                        return true;
                      });

                      if (expectedPayers.length === 0) {
                        return (
                          <p className="text-[11px] text-slate-400 font-medium">
                            No other members are assigned to contribute to you this round.
                          </p>
                        );
                      }

                      return (
                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                          {expectedPayers.map((payer) => {
                            const payment = incomingPayments.find(p => p.memberId === payer.id);
                            return (
                              <div key={payer.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-800">{payer.name}</span>
                                    <span className="text-[10px] text-slate-400">({payer.phone})</span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Expected: {currency}{targetAmount.toLocaleString()}</p>
                                  {payment ? (
                                    <div className="font-mono text-[10px] text-slate-500 space-y-0.5 mt-1 bg-white p-2 rounded border border-slate-150 shadow-xs">
                                      <p className="text-emerald-700 font-bold">✓ Dues Transferred: {currency}{payment.amount.toLocaleString()}</p>
                                      <p>Ref: <span className="text-indigo-600 font-medium">{payment.transactionRef}</span></p>
                                      {payment.senderAccountName && <p>Sender Name: <span className="text-slate-700 font-medium">{payment.senderAccountName}</span></p>}
                                      <p>Date: {payment.date}</p>
                                    </div>
                                  ) : (
                                    <p className="text-amber-600 text-[10px] font-medium mt-1 animate-pulse">⏳ Awaiting member payment upload...</p>
                                  )}
                                </div>

                                {payment && (
                                  <div className="self-end sm:self-center">
                                    {payment.confirmedByRecipient ? (
                                      <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-[10px] flex items-center gap-1 border border-emerald-100">
                                        <CheckCircle className="w-3 h-3" /> Confirmed
                                      </span>
                                    ) : (
                                      <button
                                        onClick={async () => {
                                          if (onConfirmPaymentCredit) {
                                            await onConfirmPaymentCredit(payment.memberId, loggedInMemberId, payment.transactionRef);
                                          }
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10.5px] transition shadow-sm cursor-pointer whitespace-nowrap"
                                      >
                                        Confirm Credit
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-amber-500/10 text-xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Receipt Confirmation Status</span>
                    {isPayoutConfirmedByThisRecipient ? (
                      <div className="text-emerald-700 font-bold flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4" />
                        <span>You have verified receipt of this month's pot successfully!</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-amber-800 font-medium animate-pulse">Pending your final verification signal before closing the round ledger.</p>
                        
                        <button
                          onClick={handleConfirmPayout}
                          disabled={receiptConfirming}
                          className="w-full text-xs font-bold py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-1.5 transition shadow"
                        >
                          {receiptConfirming ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Submitting confirmation...</span>
                            </>
                          ) : (
                            <>
                              <CheckSquare className="w-4 h-4" />
                              <span>Yes, I confirm I have received all monthly money in my bank</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Box 2: Personal Saving Profile Streak & Contribution History info */}
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
                <h4 className="font-bold text-slate-800 text-sm">Your Personal Contribution Ledger</h4>

                {(() => {
                  const paymentsMade = currentMonth?.payments.filter(p => p.memberId === loggedInMemberId) || [];
                  const isFullyPaid = winnersOwed.length > 0 && winnersOwed.every(w => paymentsMade.some(p => p.recipientId === w.id));
                  const isExempt = winnersOwed.length === 0;

                  return (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-xl">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Payment Status</span>
                          {isExempt ? (
                            <span className="text-rose-700 text-xs font-black mt-1 inline-flex items-center gap-1">
                              🏆 EXEMPT (RECEIVING)
                            </span>
                          ) : isFullyPaid ? (
                            <span className="text-emerald-700 text-sm font-extrabold mt-1 inline-flex items-center gap-1">
                              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 animate-bounce" /> FULLY PAID
                            </span>
                          ) : paymentsMade.length > 0 ? (
                            <span className="text-amber-600 text-xs font-extrabold mt-1 inline-flex items-center gap-1 leading-snug">
                              ⏳ PAID {paymentsMade.length}/{winnersOwed.length}
                            </span>
                          ) : (
                            <span className="text-rose-500 text-xs font-extrabold mt-1 inline-flex items-center gap-1">
                              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 animate-pulse" /> OUTSTANDING
                            </span>
                          )}
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Streaks Index</span>
                          <span className="text-indigo-700 text-base font-extrabold mt-1 block">🏆 100% On-Time</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h5 className="text-[10px] font-bold text-slate-400 uppercase">Transfer Status Checklist</h5>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 space-y-2">
                          {isExempt ? (
                            <p className="text-xs text-slate-500 italic">No transfers due this month. You are collecting this month's savings pot!</p>
                          ) : (
                            winnersOwed.map(w => {
                              const pLog = paymentsMade.find(p => p.recipientId === w.id);
                              return (
                                <div key={w.id} className="flex justify-between items-center text-xs pb-1.5 last:pb-0 border-b border-slate-200/50 last:border-0">
                                  <div>
                                    <p className="font-extrabold text-slate-700">{w.name}</p>
                                    <p className="text-[10px] text-slate-400">{w.bankName} • ₦{targetAmount.toLocaleString()}</p>
                                  </div>
                                  <div>
                                    {pLog ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold text-[10px]">
                                        ✓ Paid
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-600 font-bold text-[10px] animate-pulse">
                                        ⏳ Outstanding
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}

                <div className="space-y-2">
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase">Ajo Rotation History</h5>
                  <div className="text-xs text-slate-600 divide-y divide-slate-100">
                    <div className="py-2 flex justify-between">
                      <span className="font-semibold text-slate-700">June 2026 Rotation</span>
                      <span>Processed</span>
                    </div>
                    {loggedInMember.collectedMonths.map(mon => (
                      <div key={mon} className="py-2 flex justify-between">
                        <span className="font-semibold text-indigo-700">🏆 Earned payout slot for round {mon}</span>
                        <span className="text-emerald-600">FULLY COLLECTED</span>
                      </div>
                    ))}
                    <div className="py-2 flex justify-between text-slate-400">
                      <span>May 2026 Rotation</span>
                      <span>Paid On-time</span>
                    </div>
                    <div className="py-2 flex justify-between text-slate-400">
                      <span>April 2026 Rotation</span>
                      <span>Paid On-time</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* RHS: OCR Upload Proof Center */}
            <div className="lg:col-span-6 space-y-6">
              
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-5">
                
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    <h4 className="font-bold text-slate-800 text-sm">Quick Contribution OCR Audit</h4>
                  </div>
                  
                  <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    <Sparkles className="w-3 h-3" /> Gemini 3.5 AI Verified
                  </div>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Make your transfer, then upload the receipt screenshot or paste the instant SMS transaction alert code here. Our AI auditor will analyze it, auto-approve the payment, and check you off as <strong>PAID</strong> immediately!
                </p>

                {/* File Upload center */}
                <div className="space-y-4">
                  
                  {(() => {
                    const winnersOwedStatus = winnersOwed;
                    if (winnersOwedStatus.length <= 1) return null;
                    return (
                      <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-100 flex flex-col gap-1.5 animate-fade-in text-xs">
                        <label className="text-[10.5px] font-bold text-indigo-800 uppercase block tracking-wider">Recipient Target for this Transfer</label>
                        <p className="text-[10px] text-slate-500">Specify which active monthly winner you spent this ₦{targetAmount.toLocaleString()} transfer on:</p>
                        <select
                          value={selectedRecipientId}
                          onChange={(e) => setSelectedRecipientId(e.target.value)}
                          className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold focus:outline-none"
                        >
                          <option value="">-- Choice of Recipient --</option>
                          {winnersOwedStatus.map(w => (
                            <option key={w.id} value={w.id}>
                              Recipient: {w.name} ({w.bankName})
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}

                  {/* Image attachment box */}
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition ${
                      dragActive ? "border-emerald-500 bg-emerald-50/20" : "border-slate-200 hover:border-emerald-400 bg-slate-50/20"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {imagePreview ? (
                      <div className="relative inline-block">
                        <img src={imagePreview} alt="Transfer Receipt Preview" className="max-h-40 rounded-lg mx-auto shadow-sm" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            resetUploadState();
                          }}
                          className="absolute -top-1.5 -right-1.5 p-1 bg-rose-500 text-white rounded-full hover:bg-rose-600 shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-400">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-700">Drag & drop your transfer receipt image</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Click to browse your device files (PNG/JPEG)</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SMS Text Option */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Or paste Credit SMS Notification Alert text</label>
                    <textarea
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="Paste your mobile credit SMS alert code or transactional copy-paste texts here directly..."
                      rows={3}
                      className="w-full text-xs p-3 rounded-xl border border-slate-250 font-mono bg-slate-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Actions buttons */}
                  <div className="flex gap-2">
                    { (imagePreview || manualText.trim()) && (
                      <button
                        onClick={resetUploadState}
                        className="px-4 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600 font-bold text-xs"
                      >
                        Reset
                      </button>
                    )}
                    
                    <button
                      onClick={handleAuditProof}
                      disabled={uploading}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5 transition ${
                        uploading 
                          ? "bg-slate-300 cursor-not-allowed" 
                          : "bg-emerald-600 hover:bg-emerald-700 shadow shadow-emerald-600/10"
                      }`}
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Gemini Auditing...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Audit and Clear My Payment</span>
                        </>
                      )}
                    </button>
                  </div>

                  {auditError && (
                    <div className="bg-rose-50 border border-rose-100 p-3.5 rounded-xl text-xs text-rose-600 font-semibold leading-relaxed">
                      {auditError}
                    </div>
                  )}

                  {/* Audit Live Verification Result Pane */}
                  {auditResult && (
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-3.5">
                      <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
                        <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Gemini OCR Result</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          auditResult.status === "APPROVED" 
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                            : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}>
                          {auditResult.status === "APPROVED" ? "APPROVED" : "FLAGGED CHECK"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white p-2 rounded-lg border border-slate-200/60">
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">Sender Identity</span>
                          <span className="font-extrabold text-slate-800">{auditResult.senderName || loggedInMember.name}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-200/60">
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">Audited Amount</span>
                          <span className="font-extrabold text-slate-800">{auditResult.currency || currency} {Number(auditResult.amount || targetAmount).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/60 font-mono text-[10px] text-slate-500 break-words">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5 font-sans">Reference ID</span>
                        <span>{auditResult.transactionReference || "AUTO-REF"}</span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/60 text-xs text-slate-600 leading-relaxed font-medium">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Audit Comment</span>
                        {auditResult.explanation}
                      </div>

                      {auditResult.status === "APPROVED" && (
                        <div className="bg-emerald-50 text-emerald-800 p-2.5 rounded-lg text-center text-xs font-semibold leading-snug border border-emerald-100">
                          🎉 Excellent! Your savings contribution is verified. Checked off as Paid on the main ledger dashboard.
                        </div>
                      )}
                    </div>
                  )}

                </div>

              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}
