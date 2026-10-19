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
- Security rules are edited and published in the Firebase console. The `firestore.rules` file in the repo may be out of date.
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
- House rule: always update this CLAUDE.md file whenever you change how the app works, so the next session starts with the truth.

## Relief Fund (opt-in, separate from Ajo)
- Shown in MemberPortal via `SHOW_RELIEF_FUND = true`. Collections: reliefMembers, reliefContributions, reliefWithdrawals, reliefRequests, reliefVoteReceipts, reliefBallots.
- It only tracks numbers: no real money moves. `ALLOW_SELF_SERVICE_MONEY = false` hides the Add and Withdraw boxes so nobody can credit themselves.
- `MIN_MEMBERSHIP_MONTHS` in ReliefFund.tsx must be 3. Never commit or deploy it as 0.
- Rules: relief request up to 2.5x the member's balance, only after 3 months in the fund. Other fund members vote anonymously for 24 hours; a majority of the votes cast approves; no votes means rejected.
- Approved payouts are meant to be repayable, interest-free advances repaid monthly, with the balance locked as security. Repayment tracking is NOT built, so an approved request blocks that member's withdrawals and new requests.

## Known gaps / next
1. Admin-confirmed contributions: DONE 2026-10-17 — see "Contributions (winner-then-admin flow)" above.
2. Repayment tracking for approved advances.
3. Firestore rules tied to individual members. Members share anonymous sessions, so rules cannot tell members apart and the relief collections are loosely protected.
4. A separate account for pooled money (not the MOHARB business Flutterwave account), plus a legal check before taking real funds.
5. The receipt screen shows the expected amount as "audited amount" even on a flagged receipt. Look at why.
6. A "joins next cycle" flag, so a member can be approved without entering the current draw.
