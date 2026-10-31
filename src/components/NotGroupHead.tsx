import React from "react";
import { ShieldAlert, ArrowRight, LayoutDashboard } from "lucide-react";

interface Props {
  email: string;
  groups: string[]; // group ids this login runs
  groupNames: Record<string, string>;
  onOpenGroup: (groupId: string) => void;
}

// Shown when someone signs in at ?role=head but is not a head of any group.
export default function NotGroupHead({ email, groups, groupNames, onOpenGroup }: Props) {
  const memberPortalLink =
    window.location.origin + window.location.pathname + "?role=member";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-md space-y-5">
        <div className="flex flex-col items-center text-center">
          <img src="/mark.svg" alt="CoVest" className="h-12 w-12 rounded-xl shadow-sm mb-3" />
          <div className="flex items-center gap-1.5 text-amber-600">
            <ShieldAlert className="w-4 h-4" />
            <h1 className="text-lg font-black text-slate-800">Not a group head</h1>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            You are signed in as <strong>{email}</strong>, but this account is not the head of
            the group you opened.
          </p>
        </div>

        {groups.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Groups you run
            </p>
            {groups.map((gid) => (
              <button
                key={gid}
                onClick={() => onOpenGroup(gid)}
                className="w-full flex items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 hover:bg-indigo-100 transition text-left"
              >
                <span className="text-xs font-bold text-indigo-900 truncate">
                  {groupNames[gid] || gid}
                </span>
                <ArrowRight className="w-4 h-4 text-indigo-600 shrink-0" />
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 space-y-2">
          <a
            href={memberPortalLink}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            <LayoutDashboard className="w-4 h-4" /> Go to the member portal
          </a>
          <p className="text-[10px] text-slate-400 text-center leading-relaxed">
            Want to run a group of your own? Start one from the member portal — the CoVest
            operator reviews it before it goes live.
          </p>
        </div>
      </div>
    </div>
  );
}
