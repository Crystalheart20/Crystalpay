import React, { useState, useRef, useEffect } from "react";
import { Member, ChatMessage } from "../types";
import { Send, Image, MessageCircle, User, Sparkles, Check, CheckCheck, Loader2 } from "lucide-react";

interface WhatsAppSimulatorProps {
  members: Member[];
  expectedAmount: number;
  currency: string;
  onReceiptProcessed: (memberId: string, amount: number, transactionRef: string, senderName: string) => void;
  lastDrawNotice?: string;
  activeRecipients: Member[];
}

export default function WhatsAppSimulator({
  members,
  expectedAmount,
  currency,
  onReceiptProcessed,
  lastDrawNotice,
  activeRecipients
}: WhatsAppSimulatorProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [simulateMemberId, setSimulateMemberId] = useState("");
  const [isBotLoading, setIsBotLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Set up default messaging state
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "msg-0",
          senderName: "System Notification",
          senderRole: "admin",
          text: `Welcome to the Rotating Savings (Ajo) Bot Channel simulation! Select a member from the footer dropdown to chat as them or trigger quick actions like uploading payment proofs directly in WhatsApp.`,
          timestamp: "09:00"
        },
        {
          id: "msg-1",
          senderName: "Ajo Bot",
          senderRole: "bot",
          text: `🤖 Hi ROSCA Club! I am active for this group. I'll audit credit proofs and payment alerts as they're uploaded in real-time.`,
          timestamp: "09:01"
        }
      ]);
    }
  }, [messages]);

  // Handle auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isBotLoading]);

  // Inject draw announcement from administrative panel
  useEffect(() => {
    if (lastDrawNotice) {
      const parts = lastDrawNotice.split("\n");
      const title = parts[0] || "📢 BALLOT COMPLETED!";
      const body = parts.slice(1).join("\n");
      
      const newMsg: ChatMessage = {
        id: `notice-${Date.now()}`,
        senderName: "Club Admin",
        senderRole: "admin",
        text: lastDrawNotice,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      setMessages(prev => [...prev, newMsg]);
    }
  }, [lastDrawNotice]);

  const handleSendMessage = async (customText?: string, customImage?: string) => {
    const textToSend = customText !== undefined ? customText : inputText;
    if (!textToSend.trim() && !customImage) return;

    let senderName = "Admin";
    let senderRole: "admin" | "member" = "admin";
    const selectedMember = members.find(m => m.id === simulateMemberId);
    
    if (selectedMember) {
      senderName = selectedMember.name;
      senderRole = "member";
    }

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderName,
      senderRole,
      text: textToSend,
      image: customImage,
      timestamp
    };

    setMessages(prev => [...prev, userMsg]);
    if (customText === undefined) setInputText("");

    // Trigger AI Agent Bot Reply for payments or chat
    const isReceiptRequest = textToSend.toLowerCase().includes("proof") || 
      textToSend.toLowerCase().includes("transfer") || 
      textToSend.toLowerCase().includes("paid") ||
      customImage;

    if (isReceiptRequest && selectedMember) {
      setIsBotLoading(true);
      
      // Simulate real-time bot reading it through the OCR system
      try {
        const response = await fetch("/api/verify-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: customImage || null,
            text: textToSend,
            expectedAmount: expectedAmount,
            memberName: selectedMember.name
          })
        });

        const auditData = await response.json();
        
        // Wait a small timeout to feel biological and real
        setTimeout(() => {
          let replyText = "";
          const botTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          if (auditData.isReceipt && auditData.status === "APPROVED") {
            replyText = `🤖 *[Ajo Bot]* ✅ Verified Contribution from *@${selectedMember.name}*!\n` +
              `• *Amt Credit:* ${auditData.currency || currency} ${Number(auditData.amount || expectedAmount).toLocaleString()}\n` +
              `• *Trans ID:* \`${auditData.transactionReference || 'REF-AJO'}\`\n\n` +
              `The transaction was approved and recorded on your member profile. Excellent job! 🌟`;

            // Commit to parent states
            onReceiptProcessed(
              selectedMember.id,
              auditData.amount || expectedAmount,
              auditData.transactionReference || `TXN-${Date.now()}`,
              auditData.senderName || selectedMember.name
            );
          } else {
            replyText = `🤖 *[Ajo Bot]* ⚠️ flag alert for *@${selectedMember.name}*:\n` +
              `We checked the transfer submission. Details:\n` +
              `• *Status:* ${auditData.status || "FLAGGED"}\n` +
              `• *Detail:* ${auditData.explanation || "Verification mismatch. Please check the amount or screenshot quality."}\n\n` +
              `Admin has been notified. Please upload clear receipts.`;
          }

          setMessages(prev => [...prev, {
            id: `bot-${Date.now()}`,
            senderName: "Ajo Bot",
            senderRole: "bot",
            text: replyText,
            timestamp: botTime
          }]);
          setIsBotLoading(false);
        }, 1200);

      } catch (err) {
        console.error(err);
        setIsBotLoading(false);
      }
    } else {
      // Normal conversational bot responses
      if (textToSend.toLowerCase().includes("hello") || textToSend.toLowerCase().includes("bot")) {
        setIsBotLoading(true);
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: `bot-${Date.now()}`,
            senderName: "Ajo Bot",
            senderRole: "bot",
            text: `🤖 Hello! I am scanning the WhatsApp channel to audit contributions. Anyone can upload bank receipt screenshots, or write: "I paid [amount]".`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }]);
          setIsBotLoading(false);
        }, 800);
      }
    }
  };

  // Automated quick simulation routines
  const executeSimulatorTransfer = (member: Member, amountMatched: boolean = true) => {
    // Generate a beautiful West African instant transaction confirmation mock image or text
    const bankName = "GTBank";
    const ref = "GTB-" + Math.floor(Math.random() * 100000000);
    const amt = amountMatched ? expectedAmount : expectedAmount * 0.3; // mismatched scenario
    const mockSMSAlert = `Txn: CREDIT\n` +
      `Acct: 102****739\n` +
      `Amt: NGN ${amt.toLocaleString()}\n` +
      `Des: Ajo Contribution contribution round from ${member.name}\n` +
      `Date: ${new Date().toLocaleTimeString()} ${new Date().toLocaleDateString()}\n` +
      `Ref: ${ref}\n` +
      `Status: Successful Transfer`;

    // Switch simulated sender to matching member
    setSimulateMemberId(member.id);

    // Post to chat
    handleSendMessage(`Guys, I just made my transfer of ${currency} ${amt.toLocaleString()}! Here is the credit notice code reference:\n\n${mockSMSAlert}`);
  };

  return (
    <div className="bg-slate-900 rounded-3xl p-4 shadow-xl border border-slate-800 max-w-sm mx-auto flex flex-col h-[520px] relative overflow-hidden">
      {/* Phone Ear Piece & Camera Notch */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-4 bg-slate-950 rounded-full z-10 flex items-center justify-center gap-1.5">
        <div className="w-12 h-1 bg-slate-800 rounded-full" />
        <div className="w-2 h-2 bg-slate-800 rounded-full" />
      </div>

      {/* WhatsApp App Header */}
      <div className="bg-[#075e54] text-white pt-4 pb-3 px-3 rounded-t-2xl flex items-center justify-between shadow-sm z-0">
        <div className="flex items-center gap-2 mt-2">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-teal-800 flex items-center justify-center font-bold text-sm text-teal-100">
              WA
            </div>
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border border-teal-900 rounded-full" />
          </div>
          <div>
            <h3 className="text-xs font-bold leading-tight">Ajo Contribution Club</h3>
            <p className="text-[10px] text-teal-100 leading-none">
              {isBotLoading ? "type scanning..." : `Bot active • ${members.length} members`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-teal-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-teal-500/20 text-emerald-300 mt-2">
          <Sparkles className="h-3 w-3" /> Bot
        </div>
      </div>

      {/* Chat Messages Body with WhatsApp background tile style */}
      <div 
        className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#efeae2] flex flex-col min-h-[300px]"
        style={{
          backgroundImage: `radial-gradient(#dfd7cc 0.6px, #efeae2 0.6px)`,
          backgroundSize: '12px 12px'
        }}
      >
        {messages.map((m) => {
          const isAdmin = m.senderRole === "admin";
          const isBot = m.senderRole === "bot";
          const isSelf = m.senderRole === "admin" && simulateMemberId === "";
          
          let cardStyle = "bg-white text-slate-800 self-start rounded-r-xl rounded-bl-xl";
          if (isBot) {
            cardStyle = "bg-teal-50 text-slate-800 border-l-4 border-teal-600 self-start rounded-r-xl rounded-bl-xl";
          } else if (m.senderName === (members.find(mbr => mbr.id === simulateMemberId)?.name)) {
            cardStyle = "bg-[#d9fdd3] text-slate-800 self-end rounded-l-xl rounded-br-xl shadow-sm";
          }

          return (
            <div
              key={m.id}
              className={`max-w-[85%] flex flex-col space-y-0.5 shadow-sm text-xs p-2.5 ${
                m.senderName === (members.find(mbr => mbr.id === simulateMemberId)?.name) ? "self-end" : "self-start"
              } ${cardStyle}`}
            >
              <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-slate-500">
                <span className={isBot ? "text-teal-700" : "text-indigo-600"}>{m.senderName}</span>
                <span className="font-semibold text-[9px] text-slate-400 capitalize">{m.senderRole}</span>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed mt-0.5 font-medium">{m.text}</p>
              {m.image && (
                <div className="mt-1.5 rounded-lg overflow-hidden border border-slate-200">
                  <img src={m.image} alt="WhatsApp upload preview" className="max-h-28 mx-auto" />
                </div>
              )}
              <div className="flex items-center justify-end gap-0.5 text-[8px] text-slate-400 mt-0.5">
                <span>{m.timestamp}</span>
                {!isBot && <CheckCheck className="h-3 w-3 text-[#53bdeb]" />}
              </div>
            </div>
          );
        })}

        {isBotLoading && (
          <div className="self-start max-w-[80%] bg-teal-50 text-slate-800 font-semibold p-3.5 rounded-r-xl rounded-bl-xl shadow-sm border-l-4 border-teal-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            <span className="text-xs text-teal-800 font-mono">Ajo Bot is auditing credits...</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Simulation Controls Dock inside footer */}
      <div className="bg-[#f0f2f5] p-2 border-t border-slate-200 space-y-1.5 rounded-b-2xl">
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight block mb-0.5">Simulate Actor</span>
            <select
              value={simulateMemberId}
              onChange={(e) => setSimulateMemberId(e.target.value)}
              className="w-full text-[10px] font-bold py-1 px-1.5 rounded bg-white border border-slate-300 text-slate-700 focus:outline-none"
            >
              <option value="">Admin Panel</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>Chat as: {m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight block mb-0.5">Trigger Actions</span>
            {simulateMemberId ? (
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    const m = members.find(mbr => mbr.id === simulateMemberId);
                    if (m) executeSimulatorTransfer(m, true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 py-1 px-2 rounded text-[9px] font-bold text-white flex-1"
                >
                  Pay Amount
                </button>
                <button
                  onClick={() => {
                    const m = members.find(mbr => mbr.id === simulateMemberId);
                    if (m) executeSimulatorTransfer(m, false);
                  }}
                  className="bg-amber-600 hover:bg-amber-700 py-1 px-2 rounded text-[9px] font-bold text-white flex-1 relative"
                  title="Simulates payment with mismatched lower amount to test bot warning"
                >
                  Pay Fake
                </button>
              </div>
            ) : (
              <span className="text-[9px] font-medium text-slate-400 leading-tight block pt-1">
                Select a member to simulate a payment proof!
              </span>
            )}
          </div>
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-1.5 mt-1"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type WhatsApp message..."
            className="flex-1 bg-white text-xs px-2.5 py-1.5 rounded-full border border-slate-300 text-slate-700 focus:outline-none"
          />
          <button
            type="submit"
            className="w-8 h-8 rounded-full bg-[#128c7e] hover:bg-[#075e54] text-white flex items-center justify-center transition"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
