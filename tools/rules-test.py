"""Checks the CoVest Firestore rules against Google's Rules API — no publishing.

    python tools/rules-test.py            # both suites
    python tools/rules-test.py a          # the real rules only
    python tools/rules-test.py b          # the field guards only

The API compiles the rules and runs the test cases without touching the live
project, so a broken ruleset is caught here instead of in the Firebase console.

Needs `gcloud auth print-access-token` to work (the owner is already logged in).

Suite A runs the real rules. Suite B runs a copy with the role lookups stubbed
(the test API has no document store, so `exists()` on another document always
fails) — that is what lets the field-level guards be checked on their own.
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path

import json, os, subprocess
from pathlib import Path

PROJECT = "concentrated-drummer-7wh20"
ROOT = Path(__file__).resolve().parent
PAYLOAD = Path(tempfile.gettempdir()) / "covest-rules-testsuite.json"


def token():
    tok = os.environ.get("GCLOUD_TOKEN", "").strip()
    if tok:
        return tok
    p = subprocess.run(["cmd", "/c", "gcloud", "auth", "print-access-token"],
                       capture_output=True, text=True)
    return p.stdout.strip()


def run(cases, rules_path="firestore.rules"):
    rules = Path(rules_path).read_text(encoding="utf-8")
    body = {
        "source": {"files": [{"name": "firestore.rules", "content": rules}]},
        "testSuite": {"testCases": [c["case"] for c in cases]},
    }
    PAYLOAD.write_text(json.dumps(body), encoding="utf-8")
    out = subprocess.run(
        ["curl", "-s", "-X", "POST",
         f"https://firebaserules.googleapis.com/v1/projects/{PROJECT}:test",
         "-H", f"Authorization: Bearer {token()}",
         "-H", "Content-Type: application/json",
         "-H", f"x-goog-user-project: {PROJECT}",
         "--data-binary", f"@{PAYLOAD}"],
        capture_output=True, text=True)
    try:
        return json.loads(out.stdout)
    except Exception:
        return {"raw": out.stdout, "err": out.stderr}


def report(resp, cases):
    if "issues" in resp:
        errs = [i for i in resp["issues"] if i.get("severity") == "ERROR"]
        warns = [i for i in resp["issues"] if i.get("severity") != "ERROR"]
        for i in errs:
            sp = i.get("sourcePosition", {})
            print(f'  RULE ERROR line {sp.get("line")}: {i.get("description")}')
        for i in warns:
            sp = i.get("sourcePosition", {})
            print(f'  (warning line {sp.get("line")}: {i.get("description")})')
        if errs:
            return False
    if "raw" in resp:
        print("RAW:", resp)
        return False
    results = resp.get("testResults", [])
    ok = True
    for idx, r in enumerate(results):
        name = cases[idx]["name"] if idx < len(cases) else "?"
        expect = cases[idx]["case"]["expectation"]
        passed = r.get("state") == "SUCCESS"
        if not passed:
            ok = False
        extra = ""
        if r.get("debugMessages"):
            extra = " | " + "; ".join(r["debugMessages"])[:220]
        print(f'  [{"PASS" if passed else "FAIL"}] {name}: expected {expect}{extra}')
    if len(results) != len(cases):
        print(f'  (only {len(results)} of {len(cases)} results returned)')
        ok = False
    return ok

import json, os, subprocess, sys, tempfile
from pathlib import Path

PROJECT = "concentrated-drummer-7wh20"
ROOT = Path(__file__).resolve().parent.parent
PAYLOAD = Path(tempfile.gettempdir()) / "covest-rules-testsuite.json"

ADMIN_EMAIL = "hammed.olaoye2015@gmail.com"
ADMIN = {"email": ADMIN_EMAIL}
MEMBER = {"email": "member@example.com"}
OTHER = {"email": "other@example.com"}
DB = "/databases/(default)/documents"

MEMBER_DOC = {"data": {"id": "mem-mine", "name": "Me", "groupId": "default", "authUid": "member-uid",
                       "email": "member@example.com", "isActive": True, "collectedMonths": [],
                       "bankName": "Bank", "accountNo": "1", "accountName": "Me", "phone": "0"}}
MONTH_DOC = {"data": {"id": "2026-10", "name": "October 2026", "groupId": "default",
                      "targetAmountPerMember": 100000, "recipientsCount": 1, "recipients": [],
                      "status": "ACTIVE", "payments": []}}


def c(name, path, method, expect, uid=None, claims=None, new=None, old=None):
    req = {"path": DB + path, "method": method}
    if uid:
        req["auth"] = {"uid": uid, "token": claims or {}}
    if new is not None:
        req["resource"] = new
    tc = {"expectation": expect, "request": req}
    if old is not None:
        tc["resource"] = old
    return {"name": name, "case": tc}


def suite_a():
    return [
        # --- the operator keeps full access ---
        c("admin creates member", "/members/m1", "CREATE", "ALLOW", "admin-uid", ADMIN,
          new={"data": {"groupId": "default", "authUid": "x", "isActive": True}}),
        c("admin updates member", "/members/m1", "UPDATE", "ALLOW", "admin-uid", ADMIN,
          new=MEMBER_DOC, old={"data": {"groupId": "default", "name": "Old"}}),
        c("admin deletes member", "/members/m1", "DELETE", "ALLOW", "admin-uid", ADMIN,
          old={"data": {"groupId": "default", "authUid": "x"}}),
        c("admin updates round", "/months/default_2026-10", "UPDATE", "ALLOW", "admin-uid", ADMIN,
          new=MONTH_DOC, old=MONTH_DOC),
        c("admin creates round", "/months/default_2026-11", "CREATE", "ALLOW", "admin-uid", ADMIN,
          new=MONTH_DOC),
        c("admin confirms relief deposit", "/reliefContributions/c1", "UPDATE", "ALLOW", "admin-uid", ADMIN,
          new={"data": {"groupId": "default", "memberId": "mem-mine", "status": "CONFIRMED", "amount": 1000}},
          old={"data": {"groupId": "default", "memberId": "mem-mine", "status": "PENDING", "amount": 1000}}),
        c("admin credits relief balance", "/reliefMembers/default_mem-mine", "UPDATE", "ALLOW", "admin-uid", ADMIN,
          new={"data": {"groupId": "default", "memberId": "mem-mine", "balance": 1000, "totalContributed": 1000}},
          old={"data": {"groupId": "default", "memberId": "mem-mine", "balance": 0, "totalContributed": 0}}),
        c("admin approves a new group", "/groups/g9", "UPDATE", "ALLOW", "admin-uid", ADMIN,
          new={"data": {"id": "g9", "name": "X", "status": "ACTIVE", "createdBy": "founder-uid"}},
          old={"data": {"id": "g9", "name": "X", "status": "PENDING_REVIEW", "createdBy": "founder-uid"}}),
        c("admin writes a role", "/groupRoles/default_someone", "CREATE", "ALLOW", "admin-uid", ADMIN,
          new={"data": {"groupId": "default", "uid": "someone", "email": "s@e.com", "memberId": "mem-x", "role": "HEAD"}}),

        # --- reads are still open ---
        c("anyone signed in reads members", "/members/m1", "LIST", "ALLOW", "member-uid", MEMBER),
        c("anyone signed in reads rounds", "/months/default_2026-10", "GET", "ALLOW", "member-uid", MEMBER),
        c("anonymous cannot write a round", "/months/default_2026-10", "UPDATE", "DENY", None, None,
          new=MONTH_DOC, old=MONTH_DOC),

        # --- starting your own group ---
        c("founder starts a group", "/groups/g1", "CREATE", "ALLOW", "member-uid", MEMBER,
          new={"data": {"id": "g1", "name": "Family Ajo", "createdAt": "x", "status": "PENDING_REVIEW", "createdBy": "member-uid"}}),
        c("founder cannot start an ACTIVE group", "/groups/g2", "CREATE", "DENY", "member-uid", MEMBER,
          new={"data": {"id": "g2", "name": "Family Ajo", "createdAt": "x", "status": "ACTIVE", "createdBy": "member-uid"}}),
        c("cannot start a group for someone else", "/groups/g3", "CREATE", "DENY", "member-uid", MEMBER,
          new={"data": {"id": "g3", "name": "X", "createdAt": "x", "status": "PENDING_REVIEW", "createdBy": "other-uid"}}),
        c("founder renames own group", "/groups/g1", "UPDATE", "ALLOW", "member-uid", MEMBER,
          new={"data": {"id": "g1", "name": "Renamed", "createdAt": "x", "status": "PENDING_REVIEW", "createdBy": "member-uid"}},
          old={"data": {"id": "g1", "name": "Family Ajo", "createdAt": "x", "status": "PENDING_REVIEW", "createdBy": "member-uid"}}),
        c("founder cannot approve own group", "/groups/g1", "UPDATE", "DENY", "member-uid", MEMBER,
          new={"data": {"id": "g1", "name": "Family Ajo", "createdAt": "x", "status": "ACTIVE", "createdBy": "member-uid"}},
          old={"data": {"id": "g1", "name": "Family Ajo", "createdAt": "x", "status": "PENDING_REVIEW", "createdBy": "member-uid"}}),
        c("stranger cannot rename a group", "/groups/g1", "UPDATE", "DENY", "other-uid", OTHER,
          new={"data": {"id": "g1", "name": "Hijacked", "createdAt": "x", "status": "PENDING_REVIEW", "createdBy": "member-uid"}},
          old={"data": {"id": "g1", "name": "Family Ajo", "createdAt": "x", "status": "PENDING_REVIEW", "createdBy": "member-uid"}}),
        c("founder withdraws own pending group", "/groups/g1", "DELETE", "ALLOW", "member-uid", MEMBER,
          old={"data": {"id": "g1", "name": "X", "status": "PENDING_REVIEW", "createdBy": "member-uid"}}),

        # --- claiming a profile ---
        c("member claims their own profile", "/members/mem-p", "UPDATE", "ALLOW", "member-uid", MEMBER,
          new={"data": {"id": "mem-p", "name": "Me", "groupId": "default", "email": "member@example.com", "authUid": "member-uid", "isActive": True}},
          old={"data": {"id": "mem-p", "name": "Me", "groupId": "default", "isActive": True}}),
        c("cannot claim a profile that is already owned", "/members/mem-p", "UPDATE", "DENY", "member-uid", MEMBER,
          new={"data": {"id": "mem-p", "name": "Me", "groupId": "default", "email": "member@example.com", "authUid": "member-uid"}},
          old={"data": {"id": "mem-p", "name": "Me", "groupId": "default", "authUid": "someone-else"}}),
        c("KNOWN GAP: anyone can claim an unclaimed profile", "/members/mem-q", "UPDATE", "ALLOW", "other-uid", OTHER,
          new={"data": {"id": "mem-q", "name": "Q", "groupId": "default", "email": "other@example.com", "authUid": "other-uid"}},
          old={"data": {"id": "mem-q", "name": "Q", "groupId": "default"}}),
        c("cannot change your own active flag", "/members/mem-p", "UPDATE", "DENY", "member-uid", MEMBER,
          new={"data": {"id": "mem-p", "name": "Me", "groupId": "default", "email": "member@example.com", "authUid": "member-uid", "isActive": False}},
          old={"data": {"id": "mem-p", "name": "Me", "groupId": "default", "email": "member@example.com", "authUid": "member-uid", "isActive": True}}),
        c("member deletes own profile", "/members/mem-mine", "DELETE", "ALLOW", "member-uid", MEMBER,
          old=MEMBER_DOC),
        c("member cannot delete another profile", "/members/mem-other", "DELETE", "DENY", "member-uid", MEMBER,
          old={"data": {"id": "mem-other", "groupId": "default", "authUid": "other-uid"}}),

        # --- role documents ---
        c("member reads own role", "/groupRoles/default_member-uid", "GET", "ALLOW", "member-uid", MEMBER,
          old={"data": {"groupId": "default", "uid": "member-uid", "role": "MEMBER", "memberId": "mem-mine"}}),
        c("member reads own role slot before it exists", "/groupRoles/default_member-uid", "GET", "ALLOW", "member-uid", MEMBER),
        c("member cannot read another role", "/groupRoles/default_other-uid", "GET", "DENY", "member-uid", MEMBER,
          old={"data": {"groupId": "default", "uid": "other-uid", "role": "HEAD", "memberId": "mem-other"}}),
        c("member cannot promote themselves", "/groupRoles/default_member-uid", "UPDATE", "DENY", "member-uid", MEMBER,
          new={"data": {"groupId": "default", "uid": "member-uid", "role": "HEAD", "memberId": "mem-mine"}},
          old={"data": {"groupId": "default", "uid": "member-uid", "role": "MEMBER", "memberId": "mem-mine"}}),
        c("member drops own role", "/groupRoles/default_member-uid", "DELETE", "ALLOW", "member-uid", MEMBER,
          old={"data": {"groupId": "default", "uid": "member-uid", "role": "MEMBER", "memberId": "mem-mine"}}),
        c("member cannot drop another role", "/groupRoles/default_other-uid", "DELETE", "DENY", "member-uid", MEMBER,
          old={"data": {"groupId": "default", "uid": "other-uid", "role": "HEAD", "memberId": "mem-other"}}),
    ]


def suite_b():
    """Field-level guards, with the role lookups stubbed out."""
    return [
        c("member confirms a credit on a round", "/months/default_2026-10", "UPDATE", "ALLOW", "member-uid", MEMBER,
          new={"data": {**MONTH_DOC["data"], "payments": [{"memberId": "mem-mine", "recipientId": "mem-x", "confirmedByRecipient": True}]}},
          old=MONTH_DOC),
        c("member cannot change the round amount", "/months/default_2026-10", "UPDATE", "DENY", "member-uid", MEMBER,
          new={"data": {**MONTH_DOC["data"], "targetAmountPerMember": 1}},
          old=MONTH_DOC),
        c("member cannot change the recipients", "/months/default_2026-10", "UPDATE", "DENY", "member-uid", MEMBER,
          new={"data": {**MONTH_DOC["data"], "recipients": ["mem-x"]}},
          old=MONTH_DOC),
        c("member cannot move a round to another group", "/months/default_2026-10", "UPDATE", "DENY", "member-uid", MEMBER,
          new={"data": {**MONTH_DOC["data"], "groupId": "groupB"}},
          old=MONTH_DOC),
        c("member confirms a payout receipt", "/months/default_2026-10", "UPDATE", "ALLOW", "member-uid", MEMBER,
          new={"data": {**MONTH_DOC["data"], "payoutConfirmedByRecipients": ["mem-mine"]}},
          old=MONTH_DOC),

        c("member deposits into the relief fund", "/reliefContributions/c1", "CREATE", "ALLOW", "member-uid", MEMBER,
          new={"data": {"id": "c1", "groupId": "default", "memberId": "mem-mine", "amount": 5000, "status": "PENDING"}}),
        c("member cannot deposit as CONFIRMED", "/reliefContributions/c2", "CREATE", "DENY", "member-uid", MEMBER,
          new={"data": {"id": "c2", "groupId": "default", "memberId": "mem-mine", "amount": 5000, "status": "CONFIRMED"}}),
        c("member cannot deposit for someone else", "/reliefContributions/c3", "CREATE", "DENY", "member-uid", MEMBER,
          new={"data": {"id": "c3", "groupId": "default", "memberId": "mem-other", "amount": 5000, "status": "PENDING"}}),
        c("member joins the relief fund at zero", "/reliefMembers/default_mem-mine", "CREATE", "ALLOW", "member-uid", MEMBER,
          new={"data": {"groupId": "default", "memberId": "mem-mine", "balance": 0, "totalContributed": 0, "isActive": True}}),
        c("member cannot join with a balance", "/reliefMembers/default_mem-mine", "CREATE", "DENY", "member-uid", MEMBER,
          new={"data": {"groupId": "default", "memberId": "mem-mine", "balance": 5000, "totalContributed": 0, "isActive": True}}),
        c("member cannot change their own balance", "/reliefMembers/default_mem-mine", "UPDATE", "DENY", "member-uid", MEMBER,
          new={"data": {"groupId": "default", "memberId": "mem-mine", "balance": 999, "totalContributed": 999}},
          old={"data": {"groupId": "default", "memberId": "mem-mine", "balance": 0, "totalContributed": 0}}),
        c("member requests relief", "/reliefRequests/r1", "CREATE", "ALLOW", "member-uid", MEMBER,
          new={"data": {"id": "r1", "groupId": "default", "memberId": "mem-mine", "amount": 1000, "status": "VOTING"}}),
        c("member cancels their own request", "/reliefRequests/r1", "UPDATE", "ALLOW", "member-uid", MEMBER,
          new={"data": {"id": "r1", "groupId": "default", "memberId": "mem-mine", "amount": 1000, "status": "CANCELLED"}},
          old={"data": {"id": "r1", "groupId": "default", "memberId": "mem-mine", "amount": 1000, "status": "VOTING"}}),
        c("member cannot cancel someone else's request", "/reliefRequests/r2", "UPDATE", "DENY", "member-uid", MEMBER,
          new={"data": {"id": "r2", "groupId": "default", "memberId": "mem-other", "amount": 1000, "status": "CANCELLED"}},
          old={"data": {"id": "r2", "groupId": "default", "memberId": "mem-other", "amount": 1000, "status": "VOTING"}}),
        c("member casts a vote", "/reliefVoteReceipts/r1_mem-mine", "CREATE", "ALLOW", "member-uid", MEMBER,
          new={"data": {"requestId": "r1", "voterId": "mem-mine", "groupId": "default"}}),
        c("member cannot change a vote receipt", "/reliefVoteReceipts/r1_mem-mine", "UPDATE", "DENY", "member-uid", MEMBER,
          new={"data": {"requestId": "r1", "voterId": "mem-mine", "groupId": "default"}},
          old={"data": {"requestId": "r1", "voterId": "mem-mine", "groupId": "default"}}),
        c("member records a repayment", "/reliefRepayments/p1", "CREATE", "ALLOW", "member-uid", MEMBER,
          new={"data": {"id": "p1", "requestId": "r1", "groupId": "default", "memberId": "mem-mine", "amount": 500, "status": "PENDING"}}),
        c("member cannot record a confirmed repayment", "/reliefRepayments/p2", "CREATE", "DENY", "member-uid", MEMBER,
          new={"data": {"id": "p2", "requestId": "r1", "groupId": "default", "memberId": "mem-mine", "amount": 500, "status": "CONFIRMED"}}),

        c("head adds a member to their group", "/members/m2", "CREATE", "ALLOW", "head-uid", MEMBER,
          new={"data": {"id": "m2", "name": "New", "groupId": "default", "isActive": True}}),
        c("head adds a member to another group", "/members/m3", "CREATE", "DENY", "head-uid", MEMBER,
          new={"data": {"id": "m3", "name": "New", "groupId": "groupB", "isActive": True}}),
        c("head activates a member", "/members/mem-mine", "UPDATE", "ALLOW", "head-uid", MEMBER,
          new={"data": {**MEMBER_DOC["data"], "isActive": False}},
          old=MEMBER_DOC),
        c("head cannot rewrite a member's login", "/members/mem-mine", "UPDATE", "DENY", "head-uid", MEMBER,
          new={"data": {**MEMBER_DOC["data"], "authUid": "head-uid", "email": "head@example.com"}},
          old=MEMBER_DOC),
        c("head deletes a member of their group", "/members/mem-mine", "DELETE", "ALLOW", "head-uid", MEMBER,
          old=MEMBER_DOC),
        c("head creates a round for their group", "/months/default_2026-11", "CREATE", "ALLOW", "head-uid", MEMBER,
          new=MONTH_DOC),
    ]


STUB = {
    "function hasRole(groupId) {\n      return isSignedIn();\n    }":
        "function hasRole(groupId) {\n      return isSignedIn();\n    }",
}


def make_stub_rules():
    t = Path("firestore.rules").read_text(encoding="utf-8")
    t = t.replace(
        """    function hasRole(groupId) {
      return isSignedIn()
        && exists(/databases/$(database)/documents/groupRoles/$(roleDocId(groupId)));
    }""",
        """    function hasRole(groupId) {
      return isSignedIn() && groupId == "default";
    }""")
    t = t.replace(
        """    function roleIn(groupId) {
      return get(/databases/$(database)/documents/groupRoles/$(roleDocId(groupId))).data.role;
    }""",
        """    function roleIn(groupId) {
      return request.auth.uid == "head-uid" ? "HEAD" : "MEMBER";
    }""")
    # the cloud tester has no document store, so exists() errors; neutralise the
    # two group-existence checks that are not what these cases are testing
    t = t.replace(
        """        && exists(/databases/$(database)/documents/groups/$(groupOf(request.resource.data)))""",
        """        && true""")
    t = t.replace(
        """    function myMemberIdIn(groupId) {
      return get(/databases/$(database)/documents/groupRoles/$(roleDocId(groupId))).data.memberId;
    }""",
        """    function myMemberIdIn(groupId) {
      return "mem-mine";
    }""")
    t = t.replace(
        """    function memberBelongsToGroup(memberId, groupId) {
      return exists(/databases/$(database)/documents/members/$(memberId))
        && groupOf(get(/databases/$(database)/documents/members/$(memberId)).data) == groupId;
    }""",
        """    function memberBelongsToGroup(memberId, groupId) {
      return true;
    }""")
    t = t.replace(
        """        && exists(/databases/$(database)/documents/reliefVoteReceipts/$(voteReceiptId(request.resource.data.requestId, groupOf(request.resource.data))));""",
        """        && true;""")
    stub = ROOT / "tools" / ".rules-stub.rules"
    stub.write_text(t, encoding="utf-8")
    return str(stub)


if __name__ == "__main__":
    which = sys.argv[1].lower() if len(sys.argv) > 1 else "all"
    runs = []
    if which in ("all", "a"):
        runs.append(("A - the real rules", suite_a(), "firestore.rules"))
    if which in ("all", "b"):
        runs.append(("B - the field guards", suite_b(), make_stub_rules()))

    all_ok = True
    for label, cases, path in runs:
        print("")
        print("=== Suite %s (%s) ===" % (label, path))
        all_ok = report(run(cases, rules_path=path), cases) and all_ok

    print("")
    print("RESULT:", "ALL PASS" if all_ok else "SOME FAILED")
    sys.exit(0 if all_ok else 1)
