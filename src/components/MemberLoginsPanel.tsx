import React, { useMemo, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { Member } from "../types";
import { Mail, KeyRound, Copy, Check, AlertTriangle, Users } from "lucide-react";

interface MemberLoginsPanelProps {
  members: Member[];
}

// Admin/group-head view of who can log in: the email saved on each member's
// profile, and a button that sends Firebase's password-reset mail. Nobody can
// read a password — a reset link is the only way to help a member who forgot it.
export default function MemberLoginsPanel({ members }: MemberLoginsPanelProps) {
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...members]
      .filter(m => !q || (m.name || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [members, query]);

  const withoutLogin = members.filter(m => !m.authUid || !m.email);

  const copyEmail = async (member: Member) => {
    if (!member.email) return;
    try {
      await navigator.clipboard.writeText(member.email);
      setCopiedId(member.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setResults(prev => ({ ...prev, [member.id]: { ok: false, message: "Could not copy — select the email and copy it by hand." } }));
    }
  };

  const sendReset = async (member: Member) => {
    if (!member.email) return;
    setSendingId(member.id);
    try {
      await sendPasswordResetEmail(auth, member.email);
      setResults(prev => ({
        ...prev,
        [member.id]: { ok: true, message: `Reset link sent to ${member.email}` }
      }));
    } catch (e: any) {
      const code = e?.code || "";
      const message =
        code === "auth/user-not-found"
          ? "No Firebase account uses this email. The member must register again with it."
          : code === "auth/invalid-email"
          ? "The email on this profile is not a valid address. Correct it before sending."
          : code === "auth/too-many-requests"
          ? "Too many reset emails were sent. Wait a few minutes and try again."
          : code === "auth/network-request-failed"
          ? "No internet connection. Check the network and try again."
          : "Could not send the reset email. Check the email address and try again.";
      setResults(prev => ({ ...prev, [member.id]: { ok: false, message } }));
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div className="flex items-start gap-2">
        <KeyRound className="h-5 w-5 text-indigo-600 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Member logins</h3>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            The email saved on each member's profile. Nobody can read a member's password — if one
            is forgotten, send the reset link and they choose a new one. If a member says they made
            an account but no email shows here, look in the Firebase console under
            Authentication → Users.
          </p>
        </div>
      </div>

      {withoutLogin.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {withoutLogin.length} member{withoutLogin.length === 1 ? "" : "s"} cannot log in or upload receipts yet
          </p>
          <p>{withoutLogin.map(m => m.name).join(", ")}</p>
          <p className="text-amber-700">
            Ask them to tap “Set up email login” in the member portal. Until then the group ledger
            refuses anything they try to save.
          </p>
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-3 font-bold">Member</th>
              <th className="py-2 pr-3 font-bold">Login status</th>
              <th className="py-2 pr-3 font-bold">Email</th>
              <th className="py-2 font-bold">Reset</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(m => {
              const linked = !!m.authUid && !!m.email;
              const res = results[m.id];
              return (
                <tr key={m.id} className="border-b border-slate-50 align-top">
                  <td className="py-2.5 pr-3">
                    <p className="font-bold text-slate-800">{m.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {m.id}{m.authUid ? ` · uid ${String(m.authUid).slice(0, 8)}…` : ""}
                    </p>
                  </td>
                  <td className="py-2.5 pr-3">
                    {linked ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-100">
                        Email login
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-100">
                        PIN only
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    {m.email ? (
                      <span className="text-slate-700 font-medium break-all">{m.email}</span>
                    ) : (
                      <span className="text-slate-400">no email on file</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => copyEmail(m)}
                        disabled={!m.email}
                        className={`px-2 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition ${
                          m.email
                            ? "border-slate-300 text-slate-600 hover:bg-slate-50"
                            : "border-slate-200 text-slate-300 cursor-not-allowed"
                        }`}
                      >
                        {copiedId === m.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedId === m.id ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={() => sendReset(m)}
                        disabled={!m.email || sendingId === m.id}
                        className={`px-2 py-1 rounded-lg text-white text-[10px] font-bold flex items-center gap-1 transition ${
                          m.email && sendingId !== m.id
                            ? "bg-indigo-600 hover:bg-indigo-700"
                            : "bg-slate-300 cursor-not-allowed"
                        }`}
                      >
                        <Mail className="w-3 h-3" />
                        {sendingId === m.id ? "Sending…" : "Send reset"}
                      </button>
                    </div>
                    {res && (
                      <p className={`mt-1 text-[10px] font-semibold ${res.ok ? "text-emerald-700" : "text-rose-600"}`}>
                        {res.ok ? "✓ " : "⚠ "}{res.message}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  <Users className="w-4 h-4 inline mr-1" />
                  No member matches that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-400">
        The reset email comes from Firebase (noreply@concentrated-drummer-7wh20.firebaseapp.com). It
        is safe to send: it only reaches the owner of that inbox.
      </p>
    </div>
  );
}
