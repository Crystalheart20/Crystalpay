import React, { useState } from "react";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { roleDocId } from "../groupAccess";

interface MigrationReport {
  stamped: Record<string, number>;
  rolesCreated: number;
  rolesExisting: number;
  membersWithoutAccount: { id: string; name: string; groupId: string }[];
  legacyAmountRounds: string[];
  errors: string[];
}

// Groups whose id is "default" were seeded before the group model existed.
const DEFAULT_GROUP = "default";

// groupId out of a document id like "default_2026-06" or "default_mem-123"
function groupFromDocId(docId: string): string {
  const idx = docId.indexOf("_");
  return idx > 0 ? docId.slice(0, idx) : DEFAULT_GROUP;
}

export default function MigrationPanel() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setRunning(true);
    setError("");
    setReport(null);
    const stamped: Record<string, number> = {};
    const errors: string[] = [];
    const legacyAmountRounds: string[] = [];
    const membersWithoutAccount: { id: string; name: string; groupId: string }[] = [];

    try {
      // 1. Every document that belongs to a group must carry groupId, otherwise
      //    the rules cannot tell which group a write belongs to.
      const stampCollection = async (
        col: string,
        resolve: (docId: string, data: any) => string | null | Promise<string | null>
      ) => {
        const snap = await getDocs(collection(db, col));
        let n = 0;
        for (const d of snap.docs) {
          const data = d.data();
          if (data.groupId) continue;
          const gid = await resolve(d.id, data);
          if (!gid) continue;
          try {
            await updateDoc(doc(db, col, d.id), { groupId: gid });
            n++;
          } catch (e: any) {
            errors.push(`${col}/${d.id}: ${e?.message || e}`);
          }
        }
        stamped[col] = n;
      };

      await stampCollection("members", () => DEFAULT_GROUP);
      await stampCollection("months", (id) => groupFromDocId(id));
      await stampCollection("reliefMembers", (id) => groupFromDocId(id));
      await stampCollection("reliefContributions", () => DEFAULT_GROUP);
      await stampCollection("reliefWithdrawals", () => DEFAULT_GROUP);
      await stampCollection("reliefRequests", () => DEFAULT_GROUP);
      await stampCollection("reliefVoteReceipts", () => DEFAULT_GROUP);
      await stampCollection("reliefBallots", () => DEFAULT_GROUP);
      await stampCollection("reliefRepayments", () => DEFAULT_GROUP);
      await stampCollection("real_estate_pools", () => DEFAULT_GROUP);

      // Pool children have no group of their own — take it from the pool they belong to.
      const poolGroup = async (poolId: string) => {
        if (!poolId) return DEFAULT_GROUP;
        const snap = await getDoc(doc(db, "real_estate_pools", poolId));
        return snap.exists() && snap.data().groupId ? snap.data().groupId : DEFAULT_GROUP;
      };
      await stampCollection("pool_contributions", (_id, data) => poolGroup(data.poolId));
      await stampCollection("pool_disputes", (_id, data) => poolGroup(data.poolId));
      await stampCollection("ownership_certificates", (_id, data) => poolGroup(data.poolId));

      // 2. Warning only — rounds that still store the old amount while the app
      //    displays a different one. The app rewrites these when it reads them,
      //    so a member's confirmation would be rejected by the rules until the
      //    round is re-saved once from the admin panel.
      const monthsSnap = await getDocs(collection(db, "months"));
      for (const d of monthsSnap.docs) {
        const data = d.data();
        if (data.targetAmountPerMember === 10000) legacyAmountRounds.push(d.id);
      }

      // 2. One role document per member that has a login. Members without a
      //    login cannot transact until they register with email + password.
      const membersSnap = await getDocs(collection(db, "members"));
      let rolesCreated = 0;
      let rolesExisting = 0;

      for (const d of membersSnap.docs) {
        const m = d.data();
        const gid = m.groupId || DEFAULT_GROUP;
        if (!m.authUid) {
          membersWithoutAccount.push({ id: d.id, name: m.name || "?", groupId: gid });
          continue;
        }
        const ref = doc(db, "groupRoles", roleDocId(gid, m.authUid));
        const existing = await getDoc(ref);
        if (existing.exists()) {
          rolesExisting++;
          continue;
        }
        try {
          await setDoc(ref, {
            groupId: gid,
            uid: m.authUid,
            email: m.email || "",
            memberId: d.id,
            role: "MEMBER",
            createdAt: new Date().toISOString(),
          });
          rolesCreated++;
        } catch (e: any) {
          errors.push(`groupRoles/${roleDocId(gid, m.authUid)}: ${e?.message || e}`);
        }
      }

      setReport({ stamped, rolesCreated, rolesExisting, membersWithoutAccount, legacyAmountRounds, errors });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
            Step 1 — Role &amp; group migration
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Adds <code>groupId</code> to any document that is missing it and creates a
            role document for every member that has an email login. Safe to run more than
            once — it only ever adds fields, never deletes anything.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-extrabold transition"
        >
          {running ? "Running…" : "Run migration"}
        </button>
      </div>

      {error && <p className="text-xs font-semibold text-rose-600">Migration failed: {error}</p>}

      {report && (
        <div className="text-xs space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(report.stamped).map(([col, n]) => (
              <div key={col} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{col}</p>
                <p className="text-sm font-black text-slate-800">{n} stamped</p>
              </div>
            ))}
          </div>

          <p className="font-bold text-slate-700">
            Role documents — {report.rolesCreated} created, {report.rolesExisting} already there.
          </p>

          {report.membersWithoutAccount.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
              <p className="font-bold text-amber-800">
                {report.membersWithoutAccount.length} member(s) still log in with a PIN only.
              </p>
              <p className="text-amber-700">
                They must register with email + password before the new rules are published,
                otherwise they will not be able to confirm payments or use the Relief Fund.
              </p>
              <ul className="text-amber-700 list-disc pl-4">
                {report.membersWithoutAccount.map((m) => (
                  <li key={m.id}>
                    {m.name} — group {m.groupId}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.legacyAmountRounds.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
              <p className="font-bold text-amber-800">
                {report.legacyAmountRounds.length} round(s) still store an older amount.
              </p>
              <p className="text-amber-700">
                The app shows a different amount for these rounds than what is stored, and
                members cannot confirm payments until they match. Re-save each round once
                from the Admin Control Panel (open it and press Save) to bring the stored
                figure in line with what members see.
              </p>
              <ul className="text-amber-700 list-disc pl-4">
                {report.legacyAmountRounds.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </div>
          )}

          {report.errors.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-1">
              <p className="font-bold text-rose-800">{report.errors.length} error(s):</p>
              <ul className="text-rose-700 list-disc pl-4">
                {report.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
