import React, { useState, useEffect, useRef } from "react";
import { Member, ContributionMonth, PaymentLog, GroupRole, GroupRoleDoc } from "./types";
import Dashboard from "./components/Dashboard";
import BallotWheel from "./components/BallotWheel";
import ReceiptVerifier from "./components/ReceiptVerifier";
import WhatsAppSimulator from "./components/WhatsAppSimulator";
import MemberPortal from "./components/MemberPortal";
import RealEstatePools from "./components/RealEstatePools";
import ReliefAdminPanel from "./components/ReliefAdminPanel";
import { Users, Coins, Percent, Award, ShieldCheck, MessageSquare, PlusCircle, CreditCard, Sparkles, LayoutDashboard, Calendar, User, Share2, Plus, Building2 } from "lucide-react";
import { collection, doc, setDoc as firebaseSetDoc, onSnapshot, deleteDoc, getDoc, updateDoc, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { auth } from "./firebase";
import { onAuthStateChanged, User as FirebaseUser, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import AdminLogin from "./components/AdminLogin";
import MigrationPanel from "./components/MigrationPanel";
import MemberLoginsPanel from "./components/MemberLoginsPanel";
import {
  ensureGroupRole,
  roleDocId,
  withFreshToken,
  getGroupRole,
  getMyHeadGroups,
  setMemberHeadRole,
  createGroupAsHead,
  withdrawGroup,
} from "./groupAccess";
import GroupRequestsPanel from "./components/GroupRequestsPanel";
import NotGroupHead from "./components/NotGroupHead";

// Helper to recursively remove all undefined values from an object for Firestore compatibility
function cleanData<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanData) as any;
  }
  const result: any = {};
  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key];
    if (value !== undefined) {
      result[key] = cleanData(value);
    }
  }
  return result;
}

const setDoc = async (docRef: any, data: any) => {
  return firebaseSetDoc(docRef, cleanData(data));
};

const INITIAL_MEMBERS: Member[] = [];

const INITIAL_MONTHS: ContributionMonth[] = [
  {
    id: "2026-06",
    name: "June 2026",
    targetAmountPerMember: 100000,
    recipientsCount: 2,
    recipients: [],
    status: "ACTIVE",
    payments: []
  }
];

export interface AjoGroup {
  id: string;
  name: string;
  createdAt: string;
  status?: "ACTIVE" | "PENDING_REVIEW" | "SUSPENDED";
  createdBy?: string;
}

export default function App() {
  const [groups, setGroups] = useState<AjoGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlGroupId = params.get("groupId");
    if (urlGroupId) {
      localStorage.setItem("selected_ajo_group_id", urlGroupId);
      return urlGroupId;
    }
    return localStorage.getItem("selected_ajo_group_id") || "default";
  });

  // ?role=head opens the group head surface instead of the operator's.
  const isHeadUrl = new URLSearchParams(window.location.search).get("role") === "head";

  const [allMembers, setAllMembers] = useState<(Member & { groupId?: string })[]>(() => {
    const saved = localStorage.getItem(`ajo_members_${localStorage.getItem("selected_ajo_group_id") || "default"}`);
    if (saved) {
      try {
        return JSON.parse(saved) as (Member & { groupId?: string })[];
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [allMonths, setAllMonths] = useState<(ContributionMonth & { groupId?: string })[]>(() => {
    const saved = localStorage.getItem(`ajo_months_${localStorage.getItem("selected_ajo_group_id") || "default"}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as (ContributionMonth & { groupId?: string })[];
        return parsed.map(m => {
          return {
            ...m,
            targetAmountPerMember: m.targetAmountPerMember === 10000 ? 100000 : m.targetAmountPerMember,
            payments: m.payments.map(p => p.amount === 10000 ? { ...p, amount: 100000 } : p)
          };
        });
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [adminUser, setAdminUser] = useState<FirebaseUser | null>(null);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [myRole, setMyRole] = useState<GroupRoleDoc | null>(null);
  const [myHeadGroups, setMyHeadGroups] = useState<GroupRoleDoc[]>([]);
  const [groupRoleDocs, setGroupRoleDocs] = useState<GroupRoleDoc[]>([]);
const [authLoading, setAuthLoading] = useState(true);
  const [currentMonthId, setCurrentMonthId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "ballot" | "auditor" | "whatsapp" | "portal" | "realestate">(() => {
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
  const [firestoreMonthsReady, setFirestoreMonthsReady] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const members = allMembers.filter(m => (m.groupId || "default") === selectedGroupId);
  const months = allMonths.filter(m => (m.groupId || "default") === selectedGroupId);

  const isPlatformAdmin = !!adminUser;
  const isGroupHead = myRole?.role === "HEAD";
  const canManageGroup = isPlatformAdmin || isGroupHead;
  const myHeadGroupIds = new Set(myHeadGroups.map(r => r.groupId));
  // A group head only ever sees the groups they run.
  const visibleGroups = (isPlatformAdmin || myHeadGroups.length === 0)
    ? groups
    : groups.filter(g => myHeadGroupIds.has(g.id));

    useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
    const ADMIN_EMAILS = ["hammed.olaoye2015@gmail.com"];
setAdminUser(user && !user.isAnonymous && ADMIN_EMAILS.includes(user.email || "") ? user : null);
      setAuthUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Claim the role document for this login. It is what gives the member
  // permission to write inside their group, and it has to happen for a
  // returning member too — their Firebase session is restored without the
  // login form ever running.
  const claimedRoles = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!authUser || authUser.isAnonymous) return;
    // One person can be a member of more than one group, so pick the member
    // record that belongs to the group being viewed.
    const gid = selectedGroupId || "default";
    const mine = allMembers.find(
      x => x.authUid === authUser.uid && (x.groupId || "default") === gid
    );
    if (!mine) return;
    const key = `${gid}|${mine.id}|${authUser.uid}`;
    if (claimedRoles.current.has(key)) return;
    claimedRoles.current.add(key);
    ensureGroupRole(gid, mine.id, authUser.uid, authUser.email || "").catch(() => {
      claimedRoles.current.delete(key); // let a later attempt try again
    });
  }, [authUser, allMembers, selectedGroupId]);

  // Which groups does this login run, and what is their role in the group
  // that is currently selected?
  useEffect(() => {
    if (!authUser || authUser.isAnonymous) {
      setMyRole(null);
      setMyHeadGroups([]);
      return;
    }
    let cancelled = false;
    getMyHeadGroups(authUser.uid)
      .then(rs => { if (!cancelled) setMyHeadGroups(rs); })
      .catch(console.error);
    getGroupRole(selectedGroupId, authUser.uid)
      .then(r => { if (!cancelled) setMyRole(r); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [authUser, selectedGroupId]);

  // A group head lands on one of their own groups, never on somebody else's.
  useEffect(() => {
    if (isPlatformAdmin || myHeadGroups.length === 0) return;
    if (myHeadGroups.some(r => r.groupId === selectedGroupId)) return;
    const gid = myHeadGroups[0].groupId;
    setSelectedGroupId(gid);
    localStorage.setItem("selected_ajo_group_id", gid);
    const params = new URLSearchParams(window.location.search);
    params.set("groupId", gid);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [myHeadGroups, selectedGroupId, isPlatformAdmin]);

  // Role documents for the selected group. Only the operator can read them all
  // — a group head may read their own role and nobody else's.
  useEffect(() => {
    if (!isPlatformAdmin || !selectedGroupId) {
      setGroupRoleDocs([]);
      return;
    }
    const q = query(collection(db, "groupRoles"), where("groupId", "==", selectedGroupId));
    const unsub = onSnapshot(
      q,
      (snap) => setGroupRoleDocs(snap.docs.map(d => d.data() as GroupRoleDoc)),
      (err) => console.error("Role listener error:", err)
    );
    return () => unsub();
  }, [isPlatformAdmin, selectedGroupId]);

  // Subscribe to Ajo groups in central Firestore.
  // Every listener below waits for `authUser`: the rules need a signed-in
  // session, and a query that runs before the anonymous/e-mail sign-in lands is
  // refused for good (onSnapshot does not retry), leaving the app empty until
  // the page is reloaded.
  useEffect(() => {
    if (!authUser) return;
    const unsubscribe = onSnapshot(collection(db, "groups"), async (snapshot) => {
      const list: AjoGroup[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          ...data,
          id: doc.id
        } as AjoGroup);
      });
      
      if (list.length === 0) {
        const defaultGroup: AjoGroup = {
          id: "default",
          name: "Primary Co-Op Pool",
          createdAt: new Date().toISOString(),
          status: "ACTIVE"
        };
        try {
          await setDoc(doc(db, "groups", "default"), defaultGroup);
        } catch (e) {
          console.error("Seeding default group error: ", e);
        }
        setGroups([defaultGroup]);
      } else {
        setGroups(list);
      }
    });
    return () => unsubscribe();
  }, [authUser]);

  // Subscribe to the members of the selected group. The rules only let a
  // member read the members of a group they belong to, so the query has to
  // ask for that group by name.
  useEffect(() => {
    if (!selectedGroupId || !authUser) return;
    const q = query(collection(db, "members"), where("groupId", "==", selectedGroupId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          ...data,
          id: doc.id
        });
      });
      setAllMembers(list);
    }, (err) => console.error("Members listener error:", err));
    return () => unsubscribe();
  }, [selectedGroupId, authUser]);

  // Subscribe to the rounds of the selected group (same group scoping as members)
  useEffect(() => {
    if (!selectedGroupId || !authUser) return;
    const q = query(collection(db, "months"), where("groupId", "==", selectedGroupId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        // Skip rogue documents that have no groupId prefix in their doc ID
        if (!doc.id.includes("_")) return;

        const data = doc.data();
        const docMonthId = doc.id.split("_").pop() || doc.id;
        list.push({
          ...data,
          id: data.id || docMonthId
        });
      });
      
      const cleanedList = list.map(mon => {
        const gId = mon.groupId || "default";
        return {
          ...mon,
          groupId: gId,
          targetAmountPerMember: mon.targetAmountPerMember === 10000 ? 100000 : mon.targetAmountPerMember,
          recipients: mon.recipients || [],
          payments: (mon.payments || []).map((p: any) => p.amount === 10000 ? { ...p, amount: 100000 } : p)
        };
      });

      setAllMonths(cleanedList);
      setFirestoreMonthsReady(true); // Mark Firestore as loaded — auto-seed can now safely check
    }, (err) => console.error("Rounds listener error:", err));
    return () => unsubscribe();
  }, [selectedGroupId, authUser]);

  // Auto-seed ONLY if the Firestore document does not already exist
  // Uses getDoc to check first — NEVER overwrites existing ballot/winner data
  useEffect(() => {
    if (!selectedGroupId || !authUser) return;
    const docId = `${selectedGroupId}_2026-06`;
    const docRef = doc(db, "months", docId);
    getDoc(docRef).then((snap) => {
      if (!snap.exists()) {
        const initialMonth: ContributionMonth & { groupId: string } = {
          id: "2026-06",
          name: "June 2026",
          targetAmountPerMember: 100000,
          recipientsCount: 1,
          recipients: [],
          status: "ACTIVE" as const,
          payments: [],
          groupId: selectedGroupId
        };
        setDoc(docRef, initialMonth).catch(console.error);
      }
      // Document exists — do nothing, never overwrite
    }).catch(console.error);
  }, [selectedGroupId, authUser]);

  // Synchronize selectedGroupId with logged-in member's groupId if accessing via member portal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMemberId = params.get("memberId") || localStorage.getItem("ajo_member_session");
    if (urlMemberId && allMembers.length > 0) {
      const loggedMember = allMembers.find(m => m.id === urlMemberId);
      if (loggedMember && loggedMember.groupId && loggedMember.groupId !== selectedGroupId) {
        setSelectedGroupId(loggedMember.groupId);
        localStorage.setItem("selected_ajo_group_id", loggedMember.groupId);
      }
    }
  }, [allMembers, selectedGroupId]);

  // Synchronize currentMonthId with the active month in the selected group
  useEffect(() => {
    if (selectedGroupId && allMonths.length > 0) {
      const groupMonths = allMonths.filter(m => (m.groupId || "default") === selectedGroupId);
      const activeMonth = groupMonths.find(m => m.status === "ACTIVE");
      if (activeMonth && activeMonth.id !== currentMonthId) {
        setCurrentMonthId(activeMonth.id);
      } else if (!activeMonth && groupMonths.length > 0) {
        const sorted = [...groupMonths].sort((a, b) => b.id.localeCompare(a.id));
        if (sorted[0] && sorted[0].id !== currentMonthId) {
          setCurrentMonthId(sorted[0].id);
        }
      }
    }
  }, [allMonths, selectedGroupId, currentMonthId]);

  useEffect(() => {
    localStorage.setItem(`ajo_members_${selectedGroupId}`, JSON.stringify(allMembers));
  }, [allMembers, selectedGroupId]);

  useEffect(() => {
    localStorage.setItem(`ajo_months_${selectedGroupId}`, JSON.stringify(allMonths));
  }, [allMonths, selectedGroupId]);

  const currentMonth = months.find(m => m.id === currentMonthId) || months[0] || INITIAL_MONTHS[0];
  const currencySymbol = currentMonth?.id ? "NGN" : "NGN";

  const eligibleMembers = members.filter(m => {
    const alreadyWon = months.some(mon => mon.recipients.includes(m.id)) || m.collectedMonths.length > 0;
    if (!alreadyWon && m.isActive && m.eligibleFromRoundId && m.eligibleFromRoundId > currentMonthId) return false;
    return !alreadyWon && m.isActive;
  });

  const handleAddMember = async (newMem: Omit<Member, "id" | "collectedMonths" | "isActive text-indigo-600">) => {
    const freshId = "mem-" + Date.now();
    const fresh: Member & { groupId: string } = {
      ...newMem,
      id: freshId,
      groupId: selectedGroupId,
      collectedMonths: [],
      isActive: true
    };
    try {
      await setDoc(doc(db, "members", freshId), fresh);
    } catch (e) {
      console.error(e);
      setAllMembers(prev => [...prev, fresh]);
    }
  };
  // Self-registration for a brand-new member: creates their member record AND a real login account together
  const handleRegisterNewMember = async (
    newMem: Omit<Member, "id" | "collectedMonths" | "isActive" | "email" | "authUid">,
    email: string,
    password: string,
    targetGroupId: string
  ): Promise<{ success: boolean; error?: string }> => {
    const freshId = "mem-" + Date.now();
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // Make sure Firestore signs the request with the NEW account, not the
      // anonymous session we were on a moment ago.
      await cred.user.getIdToken(true);
      const fresh: Member & { groupId: string } = {
        ...newMem,
        id: freshId,
        groupId: targetGroupId,
        collectedMonths: [],
        isActive: false,
        email: email.trim(),
        authUid: cred.user.uid,
      };
      await withFreshToken(cred.user, () => setDoc(doc(db, "members", freshId), fresh));
      // Role document = this login's permission slip inside this group.
      await ensureGroupRole(targetGroupId, freshId, cred.user.uid, email.trim());
      setAllMembers(prev => [...prev, fresh]);
      return { success: true };
    } catch (e: any) {
      console.error(e);
      if (e?.code === "auth/email-already-in-use") {
        return { success: false, error: "That email is already used — please use a different email for members. Your admin email belongs in the Admin portal." };
      }
      if (e?.code === "auth/weak-password") {
        return { success: false, error: "Password should be at least 6 characters." };
      }
      return { success: false, error: "Registration failed. Please try again." };
    }
  };
  const handleRemoveMember = async (id: string) => {
    try {
      await deleteDoc(doc(db, "members", id));
      const updatedMonths = months.map(m => ({
        ...m,
        recipients: m.recipients.filter(rId => rId !== id),
        payments: m.payments.filter(p => p.memberId !== id && p.recipientId !== id),
        groupId: selectedGroupId
      }));
      for (const m of updatedMonths) {
        await setDoc(doc(db, "months", `${selectedGroupId}_${m.id}`), m);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleMemberActive = async (id: string, opts?: { eligibleFromRoundId?: string | null }) => {
    const member = allMembers.find(m => m.id === id);
    if (!member) return;
    const nextActive = opts && "eligibleFromRoundId" in opts ? member.isActive : !member.isActive;
    const updated: Member & { eligibleFromRoundId?: string } = { ...member, isActive: nextActive };
    if (opts && "eligibleFromRoundId" in opts) {
      if (opts.eligibleFromRoundId) updated.eligibleFromRoundId = opts.eligibleFromRoundId;
      else delete (updated as any).eligibleFromRoundId;
    }
    setAllMembers(prev => prev.map(m => m.id === id ? updated as any : m));
    try {
      await setDoc(doc(db, "members", id), updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetToPristine = async () => {
    try {
      for (const m of members) {
        await deleteDoc(doc(db, "members", m.id));
      }
      for (const mon of months) {
        const docId = `${selectedGroupId}_${mon.id}`;
        await deleteDoc(doc(db, "months", docId));
      }
      const defaultMonth: ContributionMonth & { groupId: string } = {
        id: "2026-06",
        name: "June 2026",
        targetAmountPerMember: 100000,
        recipientsCount: 2,
        recipients: [],
        status: "ACTIVE" as const,
        payments: [],
        groupId: selectedGroupId
      };
      await setDoc(doc(db, "months", `${selectedGroupId}_2026-06`), defaultMonth);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetBallot = async () => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;

    const recipientIds = targetMonth.recipients || [];

    const updatedMonth: ContributionMonth & { groupId: string } = {
      ...targetMonth,
      recipients: [],
      payments: [],
      payoutConfirmedByRecipients: [],
      groupId: selectedGroupId
    };

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedMonth);
    } catch (e) {
      console.error(e);
    }

    for (const m of members) {
      if (recipientIds.includes(m.id) || m.collectedMonths.includes(currentMonthId)) {
        const updatedMem: Member = {
          ...m,
          collectedMonths: m.collectedMonths.filter(id => id !== currentMonthId)
        };
        try {
          await setDoc(doc(db, "members", m.id), updatedMem);
        } catch (e) {
          console.error(e);
        }
      }
    }

    setLastDrawNotice("");
  };

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
        await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), {
          ...currentM,
          groupId: selectedGroupId
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Action: Set or reset a member's PIN (admin only)
  const handleSetMemberPin = async (memberId: string, pin: string) => {
    const member = allMembers.find(m => m.id === memberId);
    if (!member) return;
    const updated = { ...member, pin };
    setAllMembers(prev => prev.map(m => m.id === memberId ? { ...m, pin } : m));
    try {
      await setDoc(doc(db, "members", memberId), updated);
    } catch (e) {
      console.error(e);
    }
  };
  // Member self-registration: creates a real Firebase account and links it to their existing member record
  const handleMemberRegister = async (memberId: string, email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const member = allMembers.find(m => m.id === memberId);
    if (!member) return { success: false, error: "Member not found." };
    if (member.authUid) return { success: false, error: "This profile is already linked to an account." };

    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await cred.user.getIdToken(true);
      // updateDoc (not setDoc) so only the two fields we mean actually change.
      await withFreshToken(cred.user, () =>
        updateDoc(doc(db, "members", memberId), { email: email.trim(), authUid: cred.user.uid })
      );
      const updated = { ...member, email: email.trim(), authUid: cred.user.uid };
      setAllMembers(prev => prev.map(m => m.id === memberId ? updated : m));
      await ensureGroupRole(member.groupId || "default", memberId, cred.user.uid, email.trim());
      return { success: true };
    } catch (e: any) {
      console.error(e);
      if (e?.code === "auth/email-already-in-use") {
        return { success: false, error: "That email is already used — please use a different email for members. Your admin email belongs in the Admin portal." };
      }
      if (e?.code === "auth/weak-password") {
        return { success: false, error: "Password should be at least 6 characters." };
      }
      return { success: false, error: "Registration failed. Please try again." };
    }
  };

  // Member login: signs in with Firebase Auth, then finds their linked member record
  const handleMemberLogin = async (email: string, password: string): Promise<{ success: boolean; member?: Member; error?: string }> => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      // The same login may exist in more than one group — prefer the group
      // this link points at, so people always land in the right group.
      const wantedGroup = new URLSearchParams(window.location.search).get("groupId");
      const member =
        allMembers.find(m => m.authUid === cred.user.uid && wantedGroup && (m.groupId || "default") === wantedGroup) ||
        allMembers.find(m => m.authUid === cred.user.uid);
      if (!member) {
        return { success: false, error: "No member profile linked to this account." };
      }
      return { success: true, member };
    } catch (e: any) {
      console.error(e);
      if (e?.code === "auth/invalid-credential" || e?.code === "auth/wrong-password" || e?.code === "auth/user-not-found") {
        return { success: false, error: "Incorrect email or password." };
      }
      return { success: false, error: "Login failed. Please try again." };
    }
  };
  // Action: Set contribution deadline for current month
  const handleSetDeadline = async (deadlineDate: string) => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;
    const updated = { ...targetMonth, contributionDeadline: deadlineDate, groupId: selectedGroupId };
    setAllMonths(prev => prev.map(m =>
      m.id === currentMonthId && (m.groupId || "default") === selectedGroupId
        ? { ...m, contributionDeadline: deadlineDate }
        : m
    ));
    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updated);
    } catch (e) {
      console.error(e);
    }
  };

  // Returns whether the payment actually reached Firestore. The member portal
  // shows the green "Sent!" panel only when ok is true: a PIN-only member is
  // signed in anonymously, the rules reject their write, and the old code
  // swallowed that error so the receipt looked saved when it was not.
  const handleRecordPayment = async (memberId: string, amount: number, ref: string, senderName?: string, recipientId?: string): Promise<{ ok: boolean; error?: string; alreadyRecorded?: boolean }> => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return { ok: false, error: "This round is not loaded yet. Refresh the page and try again." };
    const targetRecipient = recipientId || targetMonth.recipients[0] || "unassigned";
    const exists = targetMonth.payments.some(p => p.memberId === memberId && p.recipientId === targetRecipient);
    if (exists) return { ok: true, alreadyRecorded: true };

    const newPayment: PaymentLog = {
      memberId,
      amount,
      date: new Date().toISOString().split('T')[0],
      transactionRef: ref,
      senderAccountName: senderName || "Verified Member",
      verifiedByAI: true,
      recipientId: targetRecipient,
      status: "PENDING"
    };

    const updatedPayments = [...targetMonth.payments, newPayment];

    setAllMonths(prev => prev.map(m =>
      m.id === currentMonthId && (m.groupId || "default") === selectedGroupId
        ? { ...m, payments: updatedPayments }
        : m
    ));

    const updatedMonth: ContributionMonth & { groupId: string } = {
      ...targetMonth,
      payments: updatedPayments,
      groupId: selectedGroupId
    };

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedMonth);
      return { ok: true };
    } catch (e: any) {
      console.error("Recording payment failed:", e);
      // Undo the optimistic entry so the ledger never shows a payment that
      // Firestore did not accept.
      setAllMonths(prev => prev.map(m =>
        m.id === currentMonthId && (m.groupId || "default") === selectedGroupId
          ? { ...m, payments: targetMonth.payments }
          : m
      ));
      return {
        ok: false,
        error:
          e?.code === "permission-denied"
            ? "Firebase rejected the save because this browser is not signed in with your email login. Set up your email login, then upload again."
            : "Could not save the payment. Check your internet connection and try again."
      };
    }
  };

  const handleApproveBallotSelection = async (selectedWinners: Member[]) => {
    const winnerIds = selectedWinners.map(w => w.id);
    
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (targetMonth) {
      const oldRecipients = targetMonth.recipients || [];
      
      const updatedMonth: ContributionMonth & { groupId: string } = {
        ...targetMonth,
        recipients: winnerIds,
        groupId: selectedGroupId
      };

      setAllMonths(prev => prev.map(m =>
        m.id === currentMonthId && (m.groupId || "default") === selectedGroupId
          ? { ...m, recipients: winnerIds }
          : m
      ));

      try {
        await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedMonth);
      } catch (e) {
        console.error(e);
      }

      const removedRecipients = oldRecipients.filter(id => !winnerIds.includes(id));
      for (const mId of removedRecipients) {
        const memObj = members.find(m => m.id === mId);
        if (memObj) {
          const updatedMem: Member = {
            ...memObj,
            collectedMonths: memObj.collectedMonths.filter(id => id !== currentMonthId)
          };
          try {
            await setDoc(doc(db, "members", mId), updatedMem);
          } catch (e) {
            console.error(e);
          }
        }
      }

      for (const mId of winnerIds) {
        const memObj = members.find(m => m.id === mId);
        if (memObj) {
          const updatedMem: Member = {
            ...memObj,
            collectedMonths: memObj.collectedMonths.includes(currentMonthId)
              ? memObj.collectedMonths
              : [...memObj.collectedMonths, currentMonthId]
          };
          try {
            await setDoc(doc(db, "members", mId), updatedMem);
          } catch (e) {
            console.error(e);
          }
        }
      }
    }

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

  const handleManualPayment = async (memberId: string, approved: boolean, recipientId?: string) => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;

    let updatedMonth: ContributionMonth;

    if (approved) {
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
            recipientId: targetRecId,
            status: "PENDING",
            confirmedByRecipient: false
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

    setAllMonths(prev => prev.map(m =>
      m.id === currentMonthId && (m.groupId || "default") === selectedGroupId
        ? { ...updatedMonth, groupId: selectedGroupId } as any
        : m
    ));

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), {
        ...updatedMonth,
        groupId: selectedGroupId
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmContribution = async (memberId: string, recipientId?: string, transactionRef?: string) => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;
    const target = targetMonth.payments.find(p => {
      if (p.memberId !== memberId) return false;
      if (recipientId && p.recipientId !== recipientId) return false;
      if (transactionRef && p.transactionRef !== transactionRef) return false;
      if (!transactionRef && p.status !== "PENDING") return false;
      return true;
    });
    if (!target) return;
    if (!target.confirmedByRecipient) {
      console.warn("Admin confirm blocked: recipient has not confirmed receipt yet.");
      return;
    }
    const now = new Date().toISOString();
    const by = adminUser?.email || "admin";
    const updatedPayments = targetMonth.payments.map(p => {
      const matchMember = p.memberId === memberId;
      const matchRecipient = recipientId ? p.recipientId === recipientId : true;
      const matchRef = transactionRef ? p.transactionRef === transactionRef : p.status === "PENDING";
      if (matchMember && matchRecipient && matchRef && p.confirmedByRecipient) {
        return { ...p, status: "CONFIRMED" as const, adminConfirmedAt: now, adminConfirmedBy: by };
      }
      return p;
    });
    const updatedMonth: ContributionMonth & { groupId: string } = { ...targetMonth, payments: updatedPayments, groupId: selectedGroupId };
    setAllMonths(prev => prev.map(m =>
      m.id === currentMonthId && (m.groupId || "default") === selectedGroupId ? { ...updatedMonth } as any : m
    ));
    try { await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedMonth); } catch (e) { console.error(e); }
  };

  const handleRejectContribution = async (memberId: string, recipientId?: string, transactionRef?: string) => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;
    const updatedPayments = targetMonth.payments.filter(p => {
      if (p.memberId !== memberId) return true;
      if (recipientId && p.recipientId !== recipientId) return true;
      if (transactionRef && p.transactionRef !== transactionRef) return true;
      if (!transactionRef && p.status !== "PENDING") return true;
      return false;
    });
    const updatedMonth: ContributionMonth & { groupId: string } = { ...targetMonth, payments: updatedPayments, groupId: selectedGroupId };
    setAllMonths(prev => prev.map(m =>
      m.id === currentMonthId && (m.groupId || "default") === selectedGroupId ? { ...updatedMonth } as any : m
    ));
    try { await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedMonth); } catch (e) { console.error(e); }
  };

  const handleConfirmPayoutReceipt = async (memberId: string, monthId: string) => {
    const targetMonth = months.find(m => m.id === monthId);
    if (!targetMonth) return;

    const confirmed = targetMonth.payoutConfirmedByRecipients || [];
    if (confirmed.includes(memberId)) return;

    const updatedConfirmed = [...confirmed, memberId];

    setAllMonths(prev => prev.map(m =>
      m.id === monthId && (m.groupId || "default") === selectedGroupId
        ? { ...m, payoutConfirmedByRecipients: updatedConfirmed }
        : m
    ));

    const updatedMonth: ContributionMonth & { groupId: string } = {
      ...targetMonth,
      payoutConfirmedByRecipients: updatedConfirmed,
      groupId: selectedGroupId
    };

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${monthId}`), updatedMonth);
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmPaymentCredit = async (memberId: string, recipientId: string, transactionRef: string) => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;

    const updatedPayments = targetMonth.payments.map(p => {
      if (p.memberId === memberId && p.recipientId === recipientId && p.transactionRef === transactionRef) {
        return { ...p, confirmedByRecipient: true };
      }
      return p;
    });

    setAllMonths(prev => prev.map(m =>
      m.id === currentMonthId && (m.groupId || "default") === selectedGroupId
        ? { ...m, payments: updatedPayments }
        : m
    ));

    const updatedMonth: ContributionMonth & { groupId: string } = {
      ...targetMonth,
      payments: updatedPayments,
      groupId: selectedGroupId
    };

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedMonth);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCloseRound = async () => {
    const targetMonth = months.find(m => m.id === currentMonthId);
    if (!targetMonth) return;

    const updatedCurrentMonth: ContributionMonth & { groupId: string } = {
      ...targetMonth,
      status: "COMPLETED" as const,
      groupId: selectedGroupId
    };

    try {
      await setDoc(doc(db, "months", `${selectedGroupId}_${currentMonthId}`), updatedCurrentMonth);
    } catch (e) {
      console.error(e);
    }

    const [yearStr, monthStr] = currentMonthId.split("-");
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10); // 1-12

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }

    const nextMonthId = `${year}-${String(month).padStart(2, "0")}`;
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const nextMonthName = `${monthNames[month - 1]} ${year}`;
    
    const exists = months.some(m => m.id === nextMonthId);
    if (!exists) {
      const nextMonthObj: ContributionMonth & { groupId: string } = {
        id: nextMonthId,
        name: nextMonthName,
        targetAmountPerMember: targetMonth.targetAmountPerMember,
        recipientsCount: targetMonth.recipientsCount,
        recipients: [],
        status: "ACTIVE" as const,
        payments: [],
        groupId: selectedGroupId
      };
      try {
        await setDoc(doc(db, "months", `${selectedGroupId}_${nextMonthId}`), nextMonthObj);
      } catch (e) {
        console.error(e);
      }
    }
    
    setCurrentMonthId(nextMonthId);
    setActiveTab("dashboard");
  };

  // Operator action: promote a member to group head of this group, or step
  // them back down to a plain member.
  const handleSetMemberRole = async (member: Member, role: GroupRole) => {
    if (!member.authUid) {
      alert("This member has no email login yet, so they cannot be made group head. Ask them to register with email and password first.");
      return;
    }
    try {
      await setMemberHeadRole(selectedGroupId, member.id, member.authUid, member.email || "", role);
    } catch (e) {
      console.error(e);
      alert("Could not change that role. Are you signed in as the CoVest operator?");
    }
  };

  // A founder can withdraw a group that has not been approved yet.
  const handleWithdrawGroup = async () => {
    const g = groups.find(x => x.id === selectedGroupId);
    if (!g || !authUser) return;
    const meInGroup = members.find(m => m.authUid === authUser.uid);
    if (!window.confirm(`Withdraw "${g.name}"? The group and your place in it will be removed.`)) return;
    try {
      await withdrawGroup(selectedGroupId, authUser.uid, meInGroup?.id || "");
      const fallback = groups.find(x => x.id !== selectedGroupId)?.id || "default";
      setSelectedGroupId(fallback);
      localStorage.setItem("selected_ajo_group_id", fallback);
      const params = new URLSearchParams(window.location.search);
      params.set("groupId", fallback);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    } catch (e) {
      console.error(e);
      alert("Could not withdraw the group.");
    }
  };

  const [copiedLink, setCopiedLink] = useState(false);
  const handleCopyLink = () => {
    const link = window.location.origin + window.location.pathname + `?role=member&groupId=${selectedGroupId}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (!isMemberOnlyUrl && authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (!isMemberOnlyUrl && !canManageGroup) {
    // Signed in, but not the head of the group they asked for.
    if (isHeadUrl && authUser && !authUser.isAnonymous) {
      return (
        <NotGroupHead
          email={authUser.email || ""}
          groups={myHeadGroups.map(r => r.groupId)}
          groupNames={Object.fromEntries(groups.map(g => [g.id, g.name]))}
          onOpenGroup={(gid) => {
            setSelectedGroupId(gid);
            localStorage.setItem("selected_ajo_group_id", gid);
            const params = new URLSearchParams(window.location.search);
            params.set("groupId", gid);
            window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
          }}
        />
      );
    }
    return <AdminLogin mode={isHeadUrl ? "head" : "admin"} />;
  }
  
  
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      
      <header className="bg-white border-b border-slate-100 py-3 px-4 sm:px-6 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {!isMemberOnlyUrl ? (
              <button
                onClick={() => setSidebarOpen(o => !o)}
                className="inline-flex sm:hidden p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                aria-label="Toggle menu"
              >
                <span className="text-sm font-black">☰</span>
              </button>
            ) : null}
            <img src="/mark.svg" alt="CoVest" className="h-9 w-9 rounded-xl shadow-sm" />
            <div>
              <h1 className="text-base sm:text-xl font-black text-slate-800 tracking-tight leading-none">CoVest</h1>
              <p className="text-[10px] font-bold tracking-[0.18em] text-slate-400 uppercase">by CrystalPay</p>
            </div>
          </div>
          <div className="hidden sm:flex flex-wrap items-center gap-2">
            <div className="bg-indigo-50/50 rounded-xl px-3 py-1.5 border border-indigo-100 flex items-center gap-2 text-xs text-indigo-700 font-bold">
              <Calendar className="h-4 w-4" />
              <span>Round: <span className="text-slate-700">{currentMonth?.name || "N/A"}</span></span>
            </div>
            <div className="bg-emerald-50 text-emerald-800 rounded-xl px-3 py-1.5 border border-emerald-100 flex items-center gap-2 text-xs font-bold">
              <Coins className="h-4 w-4" />
              <span>Target: <span className="text-slate-800">₦ {currentMonth?.targetAmountPerMember.toLocaleString() || 0}</span></span>
            </div>
          </div>
          {!isMemberOnlyUrl ? (
            <button onClick={() => setSidebarOpen(o => !o)} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50">
              <span>☰</span> Menu
            </button>
          ) : null}
        </div>
        <div className="sm:hidden mt-3 flex gap-2">
          <div className="flex-1 bg-indigo-50/50 rounded-xl px-3 py-2 border border-indigo-100 flex items-center gap-2 text-xs text-indigo-700 font-bold">
            <Calendar className="h-4 w-4" /> <span>{currentMonth?.name || "N/A"}</span>
          </div>
          <div className="flex-1 bg-emerald-50 text-emerald-800 rounded-xl px-3 py-2 border border-emerald-100 flex items-center gap-2 text-xs font-bold">
            <Coins className="h-4 w-4" /> <span>₦ {currentMonth?.targetAmountPerMember.toLocaleString() || 0}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">

        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600 shrink-0" />
              Active Co-Op Group / Asset Pool
            </h2>
            <p className="text-xs text-slate-500">
              Select or create distinct cooperative savings or asset co-investment groups.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2/5 w-full sm:w-auto">
            <select
              value={selectedGroupId}
              onChange={(e) => {
                const gId = e.target.value;
                setSelectedGroupId(gId);
                localStorage.setItem("selected_ajo_group_id", gId);
                const params = new URLSearchParams(window.location.search);
                params.set("groupId", gId);
                window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
              }}
              className="w-full sm:w-48 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
            >
              {visibleGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}{g.status === "PENDING_REVIEW" ? " (awaiting approval)" : ""}
                </option>
              ))}
            </select>

            {isPlatformAdmin && !isMemberOnlyUrl && (
              <button
                onClick={async () => {
                  const groupName = prompt("Enter a name for the new Co-Op / Asset Group:");
                  if (groupName && groupName.trim()) {
                    const cleanName = groupName.trim();
                    const newGroupId = "group-" + Date.now();
                    const newGrp: AjoGroup = {
                      id: newGroupId,
                      name: cleanName,
                      createdAt: new Date().toISOString(),
                      status: "ACTIVE",
                      createdBy: adminUser?.uid || ""
                    };
                    try {
                      await setDoc(doc(db, "groups", newGroupId), newGrp);
                      // Whoever creates a group runs it.
                      if (adminUser) {
                        await setDoc(doc(db, "groupRoles", roleDocId(newGroupId, adminUser.uid)), {
                          groupId: newGroupId,
                          uid: adminUser.uid,
                          email: adminUser.email || "",
                          memberId: "",
                          role: "HEAD",
                          createdAt: new Date().toISOString()
                        });
                      }
                      setSelectedGroupId(newGroupId);
                      localStorage.setItem("selected_ajo_group_id", newGroupId);
                      
                      const params = new URLSearchParams(window.location.search);
                      params.set("groupId", newGroupId);
                      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
                    } catch (err) {
                      console.error("Create group error: ", err);
                    }
                  }
                }}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700/80 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 shadow-sm border border-indigo-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                <span>Create Group</span>
              </button>
            )}

            {isGroupHead &&
              groups.find(g => g.id === selectedGroupId)?.status === "PENDING_REVIEW" &&
              authUser && (
                <button
                  onClick={handleWithdrawGroup}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700/80 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 shadow-sm border border-rose-100 cursor-pointer"
                >
                  Withdraw group request
                </button>
              )}
          </div>
        </div>
        
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
                <><span>✓ Copied Link!</span></>
              ) : (
                <><Share2 className="w-3.5 h-3.5" /><span>Copy Member Link</span></>
              )}
            </button>
          </div>
        ) : null}

        {/* Desktop: keep group selector above content; tabs move to sidebar */}
        <div className="sm:hidden flex gap-2">
          <button
            onClick={() => setActiveTab("portal")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold border transition ${activeTab === "portal" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"}`}
          >👥 Member Portal</button>
          <button
            onClick={() => setActiveTab("realestate")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold border transition ${activeTab === "realestate" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"}`}
          >🏙️ Real Estate</button>
        </div>

        <div className="flex gap-4 sm:gap-6">
          {!isMemberOnlyUrl && (
            <aside className={`shrink-0 ${sidebarOpen ? "block" : "hidden"} sm:block sm:w-[220px] sm:sticky sm:top-[72px] sm:self-start sm:h-[calc(100vh-84px)] sm:overflow-y-auto`}>
              {sidebarOpen && <button onClick={() => setSidebarOpen(false)} className="sm:hidden fixed inset-0 bg-black/30 z-20" aria-label="Close menu backdrop" />}
              <div className="fixed sm:static inset-y-0 left-0 z-30 sm:z-auto w-[86vw] max-w-[300px] sm:w-[220px] bg-white sm:bg-white border-r sm:border sm:rounded-2xl border-slate-200 shadow-xl sm:shadow-sm p-3 sm:p-4 space-y-4 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black tracking-widest text-slate-500 uppercase">Menu</span>
                  <button onClick={() => setSidebarOpen(false)} className="sm:hidden px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600">✕</button>
                </div>
                <nav className="space-y-1">
                  {[
                    { id: "portal", label: "👥 Member Portal" },
                    { id: "realestate", label: "🏙️ Real Estate Pools" },
                    { id: "dashboard", label: "Admin Control Panel", icon: LayoutDashboard },
                    { id: "ballot", label: "Ballot Drawer", icon: Award },
                    { id: "auditor", label: "Receipt Auditing OCR", icon: ShieldCheck },
                    { id: "whatsapp", label: "WhatsApp Simulator", icon: MessageSquare },
                  ].filter(item => item.id === "portal" || item.id === "realestate" || !isMemberOnlyUrl).map(item => {
                    const ActiveIcon = (item as any).icon;
                    const isActive = activeTab === (item.id as any);
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id as any); setSidebarOpen(false); }}
                        className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition ${isActive ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-white"}`}
                      >
                        {ActiveIcon ? <ActiveIcon className="h-4 w-4 shrink-0" /> : null}
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invite</p>
                  <button onClick={handleCopyLink} className={`w-full px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition ${copiedLink ? "bg-emerald-600 text-white border-emerald-600" : "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"}`}>
                    <Share2 className="h-3.5 w-3.5" /> {copiedLink ? "✓ Copied Member Link" : "Copy Member Link"}
                  </button>
                </div>
              </div>
            </aside>
          )}
          <div className="flex-1 min-w-0 min-h-[450px]">
          {activeTab === "portal" && (
            <MemberPortal
              members={members}
              groups={groups}
              months={allMonths}
              currentMonthId={currentMonthId}
              currency="₦"
              onAddMember={handleAddMember}
              onPaymentApproved={(mId, amt, ref, sName, rId) => handleRecordPayment(mId, amt, ref, sName, rId)}
              onConfirmPayoutReceipt={handleConfirmPayoutReceipt}
              onConfirmPaymentCredit={handleConfirmPaymentCredit}
              onLoginChange={(groupId) => {
                setSelectedGroupId(groupId);
                localStorage.setItem("selected_ajo_group_id", groupId);
              }}
              onMemberRegister={handleMemberRegister}
              onMemberLogin={handleMemberLogin}
              onRegisterNewMember={handleRegisterNewMember}
            />
          )}

          {activeTab === "realestate" && (
            <RealEstatePools
              members={members}
              selectedGroupId={selectedGroupId}
              isMemberOnlyUrl={isMemberOnlyUrl}
              canManage={!!adminUser}
            />
          )}

          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {isGroupHead && (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                    Group head
                  </p>
                  <p className="text-xs text-indigo-900 mt-1">
                    You run{" "}
                    <strong>{groups.find(g => g.id === selectedGroupId)?.name || selectedGroupId}</strong>.
                    Everything on this page applies to your group only — the CoVest operator can
                    still see it.
                  </p>
                  {groups.find(g => g.id === selectedGroupId)?.status === "PENDING_REVIEW" && (
                    <p className="text-xs font-bold text-amber-700 mt-2">
                      This group is still waiting for the CoVest operator to approve it. You can
                      set it up in the meantime — it goes live once it is approved.
                    </p>
                  )}
                </div>
              )}
              {isPlatformAdmin && <GroupRequestsPanel />}
              {isPlatformAdmin && <MigrationPanel />}
              <MemberLoginsPanel members={members} />
              <ReliefAdminPanel
                groupId={selectedGroupId}
                adminEmail={adminUser?.email || authUser?.email || null}
              />
              <Dashboard
                members={members}
                months={months}
                currentMonthId={currentMonthId}
                currency="₦"
                onAddMember={handleAddMember}
                onRemoveMember={handleRemoveMember}
                onToggleMemberActive={handleToggleMemberActive}
                onConfigureMonth={handleConfigureMonth}
                onManualPayment={handleManualPayment}
                onConfirmContribution={handleConfirmContribution}
                onRejectContribution={handleRejectContribution}
                onCloseRound={handleCloseRound}
              onResetBallot={handleResetBallot}
              onSetDeadline={handleSetDeadline}
              currentMonthDeadline={currentMonth?.contributionDeadline}
              onSetMemberPin={handleSetMemberPin}
                groupHeads={groupRoleDocs}
                onSetMemberRole={isPlatformAdmin ? handleSetMemberRole : undefined}
                onResetToPristine={isPlatformAdmin ? handleResetToPristine : undefined}
            />
            </div>
          )}

          {activeTab === "ballot" && (
            <BallotWheel
              eligibleMembers={eligibleMembers}
              onSelected={handleApproveBallotSelection}
              onResetBallot={handleResetBallot}
              payoutCount={currentMonth?.recipientsCount || 1}
              monthName={currentMonth?.name || "N/A"}
              currentMonthRecipients={currentMonth?.recipients}
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

              <div className="lg:col-span-5">
                <WhatsAppSimulator
                  members={members}
                  expectedAmount={currentMonth?.targetAmountPerMember || 10000}
                  currency="₦"
                  onReceiptProcessed={(mId, amt, ref, sName) => handleRecordPayment(mId, amt, ref, sName)}
                  lastDrawNotice={lastDrawNotice}
                  activeRecipients={members.filter(m => currentMonth?.recipients.includes(m.id))}
                  currentMonth={currentMonth}
                />
              </div>
            </div>
          )}
        </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-100 py-4 px-6 text-center text-xs text-slate-400 font-medium">
        <p>© 2026 CoVest by CrystalPay • Group Contributions & Real Estate Pools</p>
      </footer>

    </div>
  );
}
