import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "./firebase";
import { GroupRole, GroupRoleDoc } from "./types";

// A role document lives at groupRoles/{groupId}_{uid} so Firestore rules can
// look it up with a single read — no queries needed inside a rule.
export const roleDocId = (groupId: string, uid: string) => `${groupId}_${uid}`;

/**
 * Claims a role for the signed-in person. Create-only: Firestore rules forbid
 * changing an existing role document, so a member can never promote themselves.
 * The rules also check that the member record is already linked to this login.
 */
export async function ensureGroupRole(
  groupId: string,
  memberId: string,
  uid: string,
  email: string,
  role: GroupRole = "MEMBER"
) {
  const ref = doc(db, "groupRoles", roleDocId(groupId, uid));
  const existing = await getDoc(ref);
  if (existing.exists()) return;
  try {
    await withFreshToken(await waitForUser(uid), () =>
      setDoc(ref, {
        groupId,
        uid,
        email,
        memberId,
        role,
        createdAt: new Date().toISOString(),
      })
    );
  } catch (e: any) {
    // Lost a race with a parallel claim — the role is there, so this is fine.
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    // The rules that allow this document may not be published yet. The role is
    // re-claimed on the next sign-in, so never block the member over it.
    console.warn("Could not write the role document for", groupId, e?.code || e);
  }
}

export async function getGroupRole(groupId: string, uid: string): Promise<GroupRoleDoc | null> {
  const snap = await getDoc(doc(db, "groupRoles", roleDocId(groupId, uid)));
  return snap.exists() ? (snap.data() as GroupRoleDoc) : null;
}

/** Every role this login holds, across every group. */
export async function getMyRoles(uid: string): Promise<GroupRoleDoc[]> {
  const q = query(collection(db, "groupRoles"), where("uid", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as GroupRoleDoc);
}

/** The groups this login runs as group head. */
export async function getMyHeadGroups(uid: string): Promise<GroupRoleDoc[]> {
  const roles = await getMyRoles(uid);
  return roles.filter((r) => r.role === "HEAD");
}

/** Operator action: make a member the head of their group, or step them down. */
export async function setMemberHeadRole(
  groupId: string,
  memberId: string,
  uid: string,
  email: string,
  role: GroupRole
) {
  await setDoc(doc(db, "groupRoles", roleDocId(groupId, uid)), {
    groupId,
    uid,
    email,
    memberId,
    role,
    createdAt: new Date().toISOString(),
  });
}

export async function removeGroupRole(groupId: string, uid: string) {
  await deleteDoc(doc(db, "groupRoles", roleDocId(groupId, uid)));
}

export interface NewGroupFounder {
  uid: string;
  email: string;
  name: string;
  phone: string;
  bankName: string;
  accountNo: string;
  accountName: string;
}

/**
 * Starts a brand new group. The founder becomes its group head and its first
 * member. The group lands as PENDING_REVIEW — the CoVest operator switches it
 * to ACTIVE before it can run rounds.
 */
export async function createGroupAsHead(
  name: string,
  founder: NewGroupFounder
): Promise<{ groupId: string; memberId: string }> {
  const now = new Date().toISOString();
  const groupId = "group-" + Date.now();
  const memberId = "mem-" + Date.now();

  await setDoc(doc(db, "groups", groupId), {
    id: groupId,
    name,
    createdAt: now,
    status: "PENDING_REVIEW",
    createdBy: founder.uid,
  });

  try {
    await setDoc(doc(db, "members", memberId), {
      id: memberId,
      name: founder.name,
      phone: founder.phone,
      bankName: founder.bankName,
      accountNo: founder.accountNo,
      accountName: founder.accountName,
      collectedMonths: [],
      isActive: false,
      groupId,
      email: founder.email,
      authUid: founder.uid,
    });

    await setDoc(doc(db, "groupRoles", roleDocId(groupId, founder.uid)), {
      groupId,
      uid: founder.uid,
      email: founder.email,
      memberId,
      role: "HEAD",
      createdAt: now,
    });
  } catch (e) {
    // Leave nothing half-made behind: the founder may delete a group that was
    // never approved.
    await deleteDoc(doc(db, "groups", groupId)).catch(() => {});
    throw e;
  }

  return { groupId, memberId };
}

/**
 * Withdraws a group that has not been approved yet: the group, the founder's
 * member record inside it and their role document all go away together.
 */
export async function withdrawGroup(groupId: string, founderUid: string, memberId: string) {
  await deleteDoc(doc(db, "members", memberId)).catch(() => {});
  await deleteDoc(doc(db, "groupRoles", roleDocId(groupId, founderUid))).catch(() => {});
  await deleteDoc(doc(db, "groups", groupId));
}

/**
 * Leaves a group: removes the member's profile and their role document.
 */
export async function leaveGroup(memberId: string, groupId: string) {
  const uid = auth.currentUser?.uid;
  if (uid) {
    await deleteDoc(doc(db, "groupRoles", roleDocId(groupId, uid))).catch(() => {});
  }
  await deleteDoc(doc(db, "members", memberId));
}

/**
 * Waits until the browser session really is this person. Right after a sign-in
 * the SDK can still be on the previous session, and a write made in that window
 * is judged by the rules against the OLD uid.
 */
async function waitForUser(uid: string, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (auth.currentUser && auth.currentUser.uid === uid) return auth.currentUser;
    await new Promise((r) => setTimeout(r, 100));
  }
  return auth.currentUser;
}

/**
 * Runs a write with a freshly minted token, retrying a few times if the rules
 * reject it. The first attempt after a sign-in can go out with the previous
 * session's token; the rules then see a different uid and refuse the write.
 */
export async function withFreshToken<T>(user: any, write: () => Promise<T>): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await write();
    } catch (e: any) {
      if (e?.code !== "permission-denied") throw e;
      lastError = e;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      try {
        await user?.getIdToken(true);
      } catch {
        // the session may not be ready yet; the next attempt will try again
      }
    }
  }
  throw lastError;
}
