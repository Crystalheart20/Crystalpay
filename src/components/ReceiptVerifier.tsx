import React, { useState, useRef } from "react";
import { Member } from "../types";
import { Upload, FileText, CheckCircle, AlertTriangle, ShieldCheck, X, Camera, Sparkles, Loader2 } from "lucide-react";

interface ReceiptVerifierProps {
  members: Member[];
  expectedAmount: number;
  currency: string;
  onPaymentApproved: (memberId: string, amount: number, ref: string, senderName?: string) => void;
}

export default function ReceiptVerifier({
  members,
  expectedAmount,
  currency,
  onPaymentApproved
}: ReceiptVerifierProps) {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [manualText, setManualText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please upload an image file (PNG/JPEG) of your transaction proof.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
      setErrorMsg("");
      setResult(null);
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

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleAuditProof = async () => {
    if (!selectedMemberId) {
      setErrorMsg("Please select the contributing member to trace.");
      return;
    }
    if (!imagePreview && !manualText.trim()) {
      setErrorMsg("Please upload a receipt screenshot or paste credit alert SMS/transaction details.");
      return;
    }

    setUploading(true);
    setErrorMsg("");
    setResult(null);

    const m = members.find(mbr => mbr.id === selectedMemberId);

    try {
      const response = await fetch("/api/verify-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imagePreview,
          text: manualText,
          expectedAmount: expectedAmount,
          memberName: m ? m.name : "Unknown Member"
        })
      });

      if (!response.ok) {
        throw new Error("Receipt processing endpoint returned error status.");
      }

      const auditData = await response.json();
      setResult(auditData);

      // If approved, notify parent controller to record the transaction
      if (auditData.isReceipt && auditData.status === "APPROVED") {
        onPaymentApproved(
          selectedMemberId,
          auditData.amount || expectedAmount,
          auditData.transactionReference || ("TXN-" + Date.now()),
          auditData.senderName
        );
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to process receipt verification with Gemini OCR.");
    } finally {
      setUploading(false);
    }
  };

  const resetVerifier = () => {
    setImagePreview(null);
    setManualText("");
    setResult(null);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div id="receipt_verifying_section" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-50 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-800">AI Receipt Auditor</h2>
        </div>
        <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
          <Sparkles className="h-3.5 w-3.5" />
          Powered by Gemini 3.5
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Column */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Who is contributing?</label>
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="w-full text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
            >
              <option value="">-- Choose Member --</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.bankName})
                </option>
              ))}
            </select>
          </div>

          {/* DND Box */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Upload Receipt Screenshot</label>
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition ${
                dragActive ? "border-indigo-500 bg-indigo-50/20" : "border-slate-200 hover:border-indigo-400 bg-slate-50/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                className="hidden"
              />
              
              {imagePreview ? (
                <div className="relative inline-block group">
                  <img src={imagePreview} alt="Receipt Preview" className="max-h-40 rounded-lg mx-auto shadow-sm" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetVerifier();
                    }}
                    className="absolute -top-2 -right-2 p-1.5 bg-rose-500 text-white rounded-full hover:bg-rose-600 shadow-md transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-500">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Drag & drop receipt receipt image</p>
                    <p className="text-xs text-slate-400 mt-0.5">Click to browse files (JPEG/PNG)</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Transcription Area Option */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-600 uppercase">Or Paste SMS Alert / Transaction Text</label>
              {manualText && (
                <button onClick={() => setManualText("")} className="text-xs text-rose-500 hover:underline">Clear</button>
              )}
            </div>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Paste credit SMS notification text or copy-pasted transaction summaries directly here..."
              rows={3}
              className="w-full text-xs p-3 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
            />
          </div>

          <button
            onClick={handleAuditProof}
            disabled={uploading}
            className={`w-full py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition ${
              uploading 
                ? "bg-slate-300 cursor-not-allowed" 
                : "bg-indigo-600 hover:bg-indigo-700 active:scale-98 shadow-md shadow-indigo-600/10"
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Auditing with Gemini...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Verify Payment Proof
              </>
            )}
          </button>

          {errorMsg && (
            <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 font-semibold p-3 rounded-xl leading-relaxed">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Results Column */}
        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex flex-col justify-between">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Audit Parameters</h3>
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                  result.status === "APPROVED" 
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}>
                  {result.status === "APPROVED" ? (
                    <>
                      <CheckCircle className="h-3.5 w-3.5" /> Approved
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5" /> Flagged
                    </>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200/60">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Detected Sender</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5 max-w-[150px] truncate">{result.senderName || "Unknown"}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200/60">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Elected Amount</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">
                    {result.currency || currency} {Number(result.amount).toLocaleString()}
                  </p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200/60">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Payment Date</p>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">{result.date || "Not found"}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200/60">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Confidence Check</p>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">{(result.confidenceScore * 100).toFixed(0)}% Match</p>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200/60">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">OCR TXN Session ID</p>
                <code className="text-xs font-semibold text-indigo-700 word-break-all bg-indigo-50/50 px-2 py-0.5 rounded">
                  {result.transactionReference || "None"}
                </code>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200/60 text-xs">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">AI Audit Review Narrative</p>
                <p className="text-slate-600 leading-relaxed font-medium">{result.explanation}</p>
              </div>

              {result.status === "APPROVED" && (
                <div className="text-center py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 rounded-xl text-xs font-semibold">
                  Payment automatically verified and checked to member profile.
                </div>
              )}
            </div>
          ) : (
            <div className="h-64 flex flex-col justify-center items-center text-center text-slate-400">
              <FileText className="h-10 w-10 text-slate-300 mb-2 animate-pulse" />
              <p className="font-semibold text-sm">Waiting for Analysis Proof</p>
              <p className="text-xs text-slate-400 max-w-[200px] mt-0.5">Select a member, attach transaction screenshots or text, and click verify.</p>
            </div>
          )}

          {result && (
            <button
              onClick={resetVerifier}
              className="mt-4 text-xs mx-auto text-slate-500 hover:text-slate-700 font-semibold flex items-center gap-1 transition"
            >
              Clear Analysis
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
