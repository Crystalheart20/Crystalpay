# CoVest (AjoApp) project notes

## How to work with the owner
- He is a novice developer. Work ONE step at a time and explain what each command does, piece by piece.
- He uses Windows with Git Bash. Edit files directly yourself instead of asking him to find and replace blocks.
- Ask before running `gcloud run deploy`, `git commit` or `git push`. Never deploy or push on your own.
- After editing, confirm the file is saved and tell him how to check it.
- Never open, print or commit `env.yaml` or any `.env` file (they hold the Gemini key).

## What this is
Rotating-savings (Ajo) platform for a real group of members, plus real estate pools and a Relief Fund.
Real members and real money are involved: be careful, and never delete data in the `members`, `months` or `groups` collections.

## Stack
- Front end: React + Vite + Tailwind, in `src/`. Main state and Firestore handlers are in `src/App.tsx`. Types are in `src/types.ts`.
- Components in `src/components/`: Dashboard (admin), BallotWheel, ReceiptVerifier, WhatsAppSimulator, MemberPortal, RealEstatePools, AdminLogin, ReliefFund.
- Server: `server.ts` (Express). It serves the built site and two Gemini endpoints: `/api/verify-receipt` and `/api/generate-summary`.
- Data: Firebase Firestore and Firebase Auth. Project `concentrated-drummer-7wh20`. The Firestore database is NOT the default one: its id is `ai-studio-8b55aa2d-6f9d-411c-92b7-1ca158726564` (see `src/firebase.ts`).
- Security rules: `firestore.rules` in repo is the source of truth (copy-paste to Firebase console → Firestore → Rules to publish). All collections require `request.auth != null` (any signed-in session — anonymous counts, so Member + Admin portals keep working) and the catch-all is `if false` (deny by default). See `src/firebase.ts` anonymous sign-in.
- The separate `ajo-app` repo (Next.js/Supabase) is an unfinished scaffold. Ignore it.

## Run, deploy, back up
- Local: `npm run dev` then open http://localhost:3000. It uses the real Firestore data.
- Build check: `npm run build`.
- Live site: Google Cloud Run service `ajo-app`, region `europe-west1`, https://ajo-app-987900108534.europe-west1.run.app
- Custom domain: https://covest.crystalpayng.com → same Cloud Run service (beta domain mapping, CNAME covest → ghs.googlehosted.com., Vercel DNS, free HTTPS). Apex crystalpayng.com reserved for future landing page.
- Deploy (run from this folder): `gcloud run deploy ajo-app --source . --region europe-west1 --allow-unauthenticated --port 3000 --min-instances 0 --max-instances 2 --env-vars-file env.yaml`
- `git push` only backs up to GitHub (Crystalheart20/Crystalpay, branch main). It does NOT update the live site.
- `Dockerfile` builds the app. `env.yaml` holds GEMINI_API_KEY; it is in `.gitignore` and `.gcloudignore`.
- Branding: public/logo.svg (header + OG image, "CoVest by CrystalPay" shield+crystal), public/mark.svg (icon-only for App header + AdminLogin), public/favicon.svg (tab/address bar), public/apple-touch-icon.svg (iOS home screen). Wired in index.html and App.tsx header + AdminLogin.
- Layout: App.tsx has app-level sidebar drawer (hamburger on mobile, 220px sticky on desktop) for Member Portal / Real Estate Pools / Admin panels. MemberPortal.tsx has inner member tabs (Overview / Recipient Details / Upload Proof for senders, Confirm Receipts for receivers / My Ledger / Relief Fund) to avoid long scroll; boxes hidden when not active.
- The old Railway project is paused and can be deleted once everything is confirmed.

## How things work
- Admin: Firebase email/password login, allowed only for the emails in `ADMIN_EMAILS` (App.tsx and AdminLogin.tsx). Everyone also signs in anonymously so Firestore rules can require a session.
- Members use the link `?role=member&groupId=default`. They log in with email and password (linked through `member.authUid`) or the older PIN fallback.
- New self-registered members start Pending (`isActive: false`) and cannot be drawn in the ballot until the admin switches them to Active in the Dashboard.
- Rounds are months with ids like `2026-06`. The rotation runs June to December 2026. Mid-cycle joiners should not win this cycle.
- Receipts: if the Gemini check fails or the key is missing, the server returns FLAGGED / `MANUAL-REVIEW` (never a fake approval). Status 402 means the prepaid credits on the CoVest AI Studio project ran out.
- Contributions (winner-then-admin flow, done 2026-10-17): member uploads receipt → saved as `PENDING` (`status` on PaymentLog, see types.ts). Winner sees it in MemberPortal "Incoming Credits" and clicks Confirm Credit (`confirmedByRecipient`). Only then does the admin's Dashboard "Final Confirm" enable; it stamps `CONFIRMED` + `adminConfirmedAt/By`. Dashboard Collected Pool and Transfers Cleared count only `CONFIRMED` (old payments without `status` count as CONFIRMED for backwards compat). MemberPortal shows Awaiting winner + admin until confirmed.
- Member inner tabs (done 2026-10-19): `MemberPortal.tsx` uses `memberTab` state (overview / recipient / upload / confirm / ledger / relief). Pre-draw (`isDrawDone=false` when `recipients.length===0`) shows only Overview/Ledger/Relief and "Awaiting ballot" message; post-draw, sender gets Recipient+Upload, receiver gets Confirm; boxes hidden via `hidden` class to preserve form state.
- House rule: always update this CLAUDE.md file whenever you change how the app works, so the next session starts with the truth.

## Relief Fund (opt-in, separate from Ajo)
- Shown in MemberPortal via `SHOW_RELIEF_FUND = true` (inner Relief tab). Collections: reliefMembers, reliefContributions (now with `status: PENDING/CONFIRMED/REJECTED`), reliefWithdrawals, reliefRequests, reliefVoteReceipts, reliefBallots. Admin view: `ReliefAdminPanel.tsx` at top of Admin Control Panel.
- Deposits are now real: member types amount → Deposit → sheet shows Moniepoint MFB · Moharb Business World · 5361765947 with Copy → Payment made — notify admin creates `PENDING` `reliefContributions`; admin Confirm (bank check) in `ReliefAdminPanel` atomically credits `balance` + `totalContributed` and marks `CONFIRMED`; Reject leaves balance unchanged. Recent activity shows pending yellow until confirmed.
- Withdrawals are now real: member taps Request Withdrawal → creates `PENDING` `reliefWithdrawals` (balance untouched); admin transfers from Moniepoint 5361765947 to member's bank then taps Confirm sent → transactionally debits `balance` and marks `CONFIRMED`; Reject leaves balance. History shows `⏳ Pending withdrawal (pending admin)` in amber until confirmed.
- `ALLOW_SELF_SERVICE_MONEY = false` stays false; money moves via deposit/withdrawal pending→confirm flows above, not via that flag.
- Separate account for Relief: currently Moniepoint 5361765947 (Moharb Business World); replace in ReliefFund.tsx defaults when a dedicated Relief account is opened for the 7-member private group.
- `MIN_MEMBERSHIP_MONTHS` in ReliefFund.tsx must be 3. Never commit or deploy it as 0.
- Rules: relief request up to 2.5x the member's balance, only after 3 months in the fund. Other fund members vote anonymously for 24 hours; a majority of the votes cast approves; no votes means rejected.
- Approved payouts are repayable, interest-free advances. Blended repayment (done 2026-10-19): borrower keeps contributing ~½ their usual amount + a slice of the loan spread over a chosen 1–6 months (ceiling hard 6). Preview before submit: `Monthly = half usual + loan ÷ months` (e.g. usual ₦20k → half ₦10k + ₦60k÷4 → ₦25k/mo). New collections: `reliefRepayments` (PENDING→CONFIRMED per month, member taps I repaid → admin Confirms bank at Moniepoint 5361765947). Request stores `chosenRepayMonths / monthlyRepayPreview / remainingRepayAmount / paidInstalments`; Approved shows Paid N/6 and remaining; Confirm advances count and flips to REPAID when done. Until REPAID, balance stays locked so no new withdrawals/requests. Receipt flagged label fixed same day: MemberPortal + ReceiptVerifier now show Detected (not approved) + Expected separately with amber and a Flagged banner.

## Known gaps / next
1. Admin-confirmed contributions: DONE 2026-10-17 — see "Contributions (winner-then-admin flow)" above.
2. Repayment tracking for approved advances: DONE 2026-10-19 — blended repayment + 1–6 choice + pending confirm above.
3. Firestore rules: DONE 2026-10-19 — `firestore.rules` now requires `request.auth != null` for every collection (anonymous sign-in counts) and denies the catch-all (`if false`). This blocks unauthenticated scrapers; per-member ownership checks are a later step when members get distinct Firebase Auth UIDs.
4. A separate account for pooled money: private 7-member group uses dedicated Moniepoint Relief account (see Relief Fund above); legal check only before going public.
5. The receipt screen shows the expected amount as "audited amount" even on a flagged receipt: DONE 2026-10-19 — flagged now shows Detected (not approved) + Expected with amber and a Flagged banner; only APPROVED shows Audited Amount.
6. A "joins next cycle" flag, so a member can be approved without entering the current draw: DONE 2026-10-19 — Member.eligibleFromRoundId (e.g. 2026-07) excludes from eligibleMembers until that round; Dashboard Pending shows dialog to join next cycle, Active pill shows joins tag and remove.
