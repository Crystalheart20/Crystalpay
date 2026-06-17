import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Member } from "../types";
import { Award, RefreshCw, Volume2, VolumeX, Sparkles, AlertCircle, Copy, Check } from "lucide-react";

interface BallotWheelProps {
  eligibleMembers: Member[];
  onSelected: (selected: Member[]) => void;
  payoutCount: 1 | 2;
  monthName: string;
}

export default function BallotWheel({
  eligibleMembers,
  onSelected,
  payoutCount,
  monthName
}: BallotWheelProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedWinners, setSelectedWinners] = useState<Member[]>([]);
  const [copied, setCopied] = useState(false);
  const [ballotReport, setBallotReport] = useState("");
  const [selectedPayoutCount, setSelectedPayoutCount] = useState<number>(1);

  const maxPossibleDraw = Math.min(2, eligibleMembers.length);

  useEffect(() => {
    if (selectedPayoutCount > maxPossibleDraw && maxPossibleDraw > 0) {
      setSelectedPayoutCount(maxPossibleDraw);
    }
  }, [maxPossibleDraw, selectedPayoutCount]);

  // Synthetic sound fx using Web Audio API
  const playSound = (freq: number, type: OscillatorType, duration: number) => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Audio context block browser safety
    }
  };

  const handleSpinBallot = () => {
    if (eligibleMembers.length === 0) return;
    setIsSpinning(true);
    setSelectedWinners([]);
    setBallotReport("");

    const totalSteps = 40;
    let step = 0;
    let intervalTime = 50;

    const runTicker = () => {
      setCurrentIndex((prev) => (prev + 1) % eligibleMembers.length);
      playSound(200 + (step * 8), "triangle", 0.05);

      step++;
      if (step < totalSteps) {
        // Slow down exponentially
        intervalTime = 50 + Math.pow(step / 3.5, 2.2);
        setTimeout(runTicker, intervalTime);
      } else {
        // Select winners!
        const winners: Member[] = [];
        const countToDraft = Math.min(selectedPayoutCount, eligibleMembers.length);
        
        // Randomly grab from eligible pool
        const poolCopy = [...eligibleMembers];
        for (let idx = 0; idx < countToDraft; idx++) {
          const randIdx = Math.floor(Math.random() * poolCopy.length);
          winners.push(poolCopy.splice(randIdx, 1)[0]);
        }

        // Final celebratory sounds
        playSound(440, "sine", 0.1);
        setTimeout(() => playSound(554.37, "sine", 0.1), 100);
        setTimeout(() => playSound(659.25, "sine", 0.15), 200);
        setTimeout(() => playSound(880, "sine", 0.3), 300);

        setSelectedWinners(winners);
        setIsSpinning(false);
        
        // Autogenerate a text announcement for WhatsApp copy-paste
        const winnerNames = winners.map(w => `*${w.name}*`).join(" and ");
        const report = `📢 *AJO / ROSCA MONTHLY BALLOT RESULT* 📢\n` +
          `📅 *Round:* ${monthName}\n` +
          `✨ *Congrats to this Month's Payout Recipient(s):* ${winnerNames}!\n\n` +
          `🏦 *Recipient Bank Details:*\n` +
          winners.map((w, i) => 
            `▫️ *#${i+1} : ${w.name}*\n` +
            `   • Bank: _${w.bankName}_\n` +
            `   • Account No: \`${w.accountNo}\`\n` +
            `   • Account Name: _${w.accountName}_`
          ).join("\n\n") + 
          `\n\n💰 Please proceed with your monthly contributions to their accounts. Remember to upload payment receipts for automated auditing verification! ✅`;

        setBallotReport(report);
      }
    };

    runTicker();
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(ballotReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="ballot_wheel_section" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-800">Monthly Ballot Box</h2>
        </div>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-2 text-slate-400 hover:text-slate-600 transition"
          title={soundEnabled ? "Mute sounds" : "Enable ballot ticker sounds"}
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      </div>

      {eligibleMembers.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <AlertCircle className="h-10 w-10 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-600 font-medium">All members have already collected in this cycle!</p>
          <p className="text-xs text-slate-400 mt-1">Reset cycles or register more members to trigger a ballot.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Wheel/Selector Section */}
          <div className="md:col-span-5 flex flex-col items-center">
            <div className="relative w-56 h-56 rounded-full border-4 border-slate-100 flex items-center justify-center overflow-hidden bg-slate-50 shadow-inner bg-gradient-to-tr from-slate-50 to-white">
              {/* Spinning marker */}
              <div className="absolute top-0 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[16px] border-t-emerald-600 z-10 drop-shadow-sm" />
              
              <div className="text-center p-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentIndex}
                    initial={{ y: isSpinning ? 20 : 0, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: isSpinning ? -20 : 0, opacity: 0 }}
                    transition={{ duration: isSpinning ? 0.05 : 0.2 }}
                  >
                    <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
                      {isSpinning ? "Selecting..." : "Eligible Candidate"}
                    </p>
                    <p className="text-xl font-bold text-slate-800 mt-1 max-w-[180px] break-words">
                      {eligibleMembers[currentIndex]?.name || "None"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {eligibleMembers[currentIndex]?.bankName && `🏦 ${eligibleMembers[currentIndex].bankName}`}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Decorative nodes */}
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2.5 h-2.5 rounded-full bg-slate-200"
                  style={{
                    transform: `rotate(${i * 45}deg) translateY(-94px)`,
                  }}
                />
              ))}
            </div>

            {/* Draw count selector */}
            <div className="mt-4 w-full bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col gap-1.5 align-start text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Draw Size (This spin)</span>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2].map((num) => {
                  const isAvailable = num <= eligibleMembers.length;
                  return (
                    <button
                      key={num}
                      type="button"
                      disabled={isSpinning || !isAvailable}
                      onClick={() => setSelectedPayoutCount(num)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition duration-150 ${
                        selectedPayoutCount === num && isAvailable
                          ? "bg-slate-800 text-white shadow-sm border border-slate-800"
                          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      }`}
                    >
                      {num} {num === 1 ? "Recipient" : "Recipients"}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleSpinBallot}
              disabled={isSpinning}
              className={`mt-4 px-6 py-2.5 w-full rounded-xl font-medium tracking-tight text-white flex items-center justify-center gap-2 transition duration-200 active:scale-95 ${
                isSpinning 
                  ? "bg-slate-300 cursor-not-allowed" 
                  : "bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/10"
              }`}
            >
              <RefreshCw className={`h-4 w-4 ${isSpinning ? "animate-spin" : ""}`} />
              {isSpinning ? "Spinning Drum..." : `Spin Ballot (Pick ${Math.min(selectedPayoutCount, eligibleMembers.length)})`}
            </button>
          </div>

          {/* Results Reveal Area */}
          <div className="md:col-span-7 space-y-4">
            {selectedWinners.length > 0 && !isSpinning ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-emerald-50/50 rounded-xl p-5 border border-emerald-100/60 relative overflow-hidden"
              >
                <div className="absolute -top-12 -right-12 text-emerald-100 opacity-20 pointer-events-none">
                  <Sparkles className="w-32 h-32" />
                </div>
                
                <h3 className="text-emerald-800 font-semibold flex items-center gap-1.5 text-sm uppercase tracking-wider mb-3">
                  <Sparkles className="h-4 w-4" /> Selected Recipient(s)
                </h3>

                <div className="space-y-3 mb-4 animate-in fade-in-50 duration-200">
                  {selectedWinners.map((w, index) => (
                    <div key={w.id} className="bg-white rounded-lg p-3.5 border border-emerald-100 shadow-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
                            {index + 1}
                          </span>
                          <p className="font-semibold text-slate-800">{w.name}</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-slate-500 font-mono">
                          <p>🏛️ Bank Name: <span className="text-slate-700 font-medium">{w.bankName}</span></p>
                          <p>💳 Account ID: <span className="text-slate-700 font-medium font-semibold">{w.accountNo}</span></p>
                          <p className="sm:col-span-2">👤 Account Holder: <span className="text-slate-700 font-medium">{w.accountName}</span></p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onSelected(selectedWinners);
                    playSound(500, "sine", 0.1);
                    setSelectedWinners([]);
                    setBallotReport("");
                  }}
                  className="w-full py-2.5 px-4 mb-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs tracking-wide shadow-md shadow-emerald-600/10 transition duration-150 uppercase-none flex items-center justify-center gap-2"
                >
                  Confirm & Approve Draw selection
                </button>

                {ballotReport && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase">WhatsApp Broadcast Message</label>
                      <button
                        onClick={copyToClipboard}
                        className="text-xs text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-1 transition"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copy Message
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono uppercase-none">
                      {ballotReport}
                    </pre>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="py-12 text-center text-slate-400 h-full flex flex-col justify-center items-center">
                <Sparkles className="h-8 w-8 text-slate-300 animate-pulse mb-2" />
                <p className="font-medium text-sm">Spin the wheel and declare recipient(s)</p>
                <p className="text-xs text-slate-400 mt-0.5">The drum pool lists {eligibleMembers.length} remaining contributors.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
