# Resend Inbound + Outbound Broken on Prod — Fix Plan

Created: 2026-05-19
Author: aspiskov@student.42abudhabi.ae
Status: PENDING
Approved: Yes
Iterations: 0
Worktree: No
Type: Bugfix

## Summary

**Symptom 1 (inbound):** `/admin/settings/inbound-log` shows `"✗ Не дотянулись до Resend API (502) — Resend GET /emails/{id}/receiving → 405"`. User reports "то же самое" — same error pattern persists.

**Symptom 2 (outbound):** Manager clicks "Отправить клиенту" on a DRAFT estimate. Estimate flips to SENT in UI, but **no outbound appears in Resend dashboard** and no `EMAIL_OUTBOUND` row is added to `CommunicationLog`. No error shown to manager.

**Trigger:** Symptom 1 — any inbound to `info@geleoteka.ru`. Symptom 2 — clicking "Отправить клиенту" on an estimate for a customer who lacks both `deal.claimToken` AND `customer.isTempPassword === false`.

**Root Cause:**
- **Symptom 1 — ALREADY FIXED in `8885e8e`.** Path was `/emails/{id}/receiving` (segments swapped). Resend API docs (`/websites/resend` → `/emails/receiving/{id}`) and SDK source (`resend/resend-node` → `src/emails/receiving/receiving.ts:24`) confirm correct path is `/emails/receiving/{id}`. The error the user sees in the log is from `22:10`, **before** my deploy at `~22:25`. No new inbound webhook has arrived to verify the fix.
- **Symptom 2 — `app/actions/crm/estimates.ts:159`** — `if (viewUrl && pdfUrl) { ... entire email send block ... }` silently skips when `viewUrl/pdfUrl` are undefined. They are undefined when `!token && !hasRealAccount` (no claim token AND `customer.isTempPassword === true`). The estimate still transitions to SENT, the action returns `{ error: null }`, the UI shows success. The outbound is never recorded and never sent — that's why "no outbound in Resend dashboard".

## Investigation

**What I checked on prod (https://geleoteka.ru, logged in as admin):**

1. **Test-send button** (`/admin/settings/integrations`) — `id=afa9a9c4-380b-4a56-a3fa-0a75ca62359b`, "Письмо отправлено через Resend". So `RESEND_API_KEY` is valid, `RESEND_FROM` (`info@geleoteka.ru`) is verified, transport is fine. **Outbound transport works.**
2. **Inbound-log** (`/admin/settings/inbound-log`) — single entry at `18 мая 2026 г., 22:10` with `svix-id/sig/timestamp ✓`. So Resend IS hitting our endpoint with valid HMAC. The 502 comes from our handler's downstream `fetchResendEmailContent` call. **Inbound webhook delivery works**; only the metadata-fetch path was wrong.
3. **Alex Alex deal** (`cmpbq3bco0003ml0pn4bx4d0q`) has 3 estimates in a revise-chain. The customer 360 page shows **exactly ONE** `EMAIL_OUTBOUND` log entry (`00:59`, "Ответил"). If every send had recorded an outbound, there'd be three. The missing two match the silent-skip path.
4. **Resend API docs** (re-verified per user request) — `GET /emails/receiving/{id}` is the canonical path (https://resend.com/docs/api-reference/emails/retrieve-received-email).
5. **Outbound transport** — `lib/email/send.ts:95` POSTs to `https://api.resend.com/emails` (correct), with valid `Authorization: Bearer`, `from`, `to`, `subject`, `html`, `text`, `reply_to`. No issue there.

**Silent skips audit in `sendEstimate` action:**
- Line 146: `if (emailPayload?.deal.customer.email)` — guards on email present (OK if present, but no log if missing).
- Line 159: `if (viewUrl && pdfUrl)` — **THIS is the silent skip causing Symptom 2**.

**Working example for comparison:** `app/actions/booking.ts:171` also calls `recordOutboundEmail` + `sendBookingConfirmationEmail`, but unconditionally (no viewUrl/pdfUrl gate). That's the pattern to follow.

## Behavior Contract

**Given:** an estimate in `DRAFT` state on a deal whose customer has a plausible email address (`isPlausibleEmail(...) === true`).

**When:** an admin/manager clicks "Отправить клиенту" (calls `sendEstimate(estimateId)`).

**Currently (bug):**
- (S2) If `!deal.claimToken && customer.isTempPassword === true`: estimate transitions to `SENT`, `deal.quotedAt` is stamped, **NO row** is written to `CommunicationLog`, **NO call** is made to Resend, action returns `{ error: null }`, UI shows success. The outbound never appears in the Resend dashboard.
- (S1) When Resend POSTs a valid `email.received` webhook, our handler calls `fetchResendEmailContent` → returns 502 (was 405 from Resend; fixed in 8885e8e but unverified on prod under fresh load).

**Expected (fix):**
- (S2) For any `DRAFT` estimate sent on a deal whose customer has a plausible email: a `CommunicationLog` row with `channel="EMAIL_OUTBOUND"` and `externalId=<messageId>` MUST be created BEFORE Resend is called, and `sendEmail` MUST be invoked. If `sendEmail` returns success, the log row's outcome becomes `DELIVERED`; on failure, `FAILED`. If the customer email is implausible OR missing, the action returns a user-visible error string explaining the skip — UI shows it, manager knows.
- (S1) `POST /api/email/inbound` from Resend with valid svix headers → `fetchResendEmailContent` returns 200 → `InboundAttempt.outcome` starts with `accepted_` → `/admin/settings/inbound-log` shows "✓ Сохранено".

**Anti-regression:**
- Existing `EstimateActions.tsx` button behavior (DRAFT→SENT transition, revision, decline, delete) MUST remain unchanged.
- `recordOutboundEmail` idempotency on P2002 unique-violation MUST continue to no-op.
- `sendEmail`'s `isPlausibleEmail` early-return for placeholder addresses MUST stay.
- `approveEstimate`'s server-side rollback path (unapprove) MUST NOT regress.
- Test-send button at `/admin/settings/integrations` MUST continue to return a real Resend id.

## Fix Approach

**Chosen:** Make `sendEstimate` always attempt the outbound when `isPlausibleEmail(customer.email)`. Build `viewUrl`/`pdfUrl` from the best available source:
1. If `deal.claimToken` exists → token URLs (current preferred behavior, unchanged).
2. Else → cabinet URLs (`/cabinet/estimates/{id}` and `/api/estimates/{id}/pdf`). Drop the `hasRealAccount` gate — temp-password customers can still reset password and log in; we shouldn't refuse to email them their own estimate. The cabinet route already handles the auth redirect.

When `customer.email` is missing or implausible → return `{ error: "У клиента не указан корректный email — отправьте смету ссылкой вручную" }` so the manager sees a real error instead of fake success.

**Why:** The silent skip was defensive (don't email broken links) but the cost (no outbound, no log, no user feedback) is far worse than emitting a cabinet URL the customer might need to reset password to view. The cabinet URL is the canonical path; the token URL is just a guest convenience. Matching the booking-confirmation pattern in `app/actions/booking.ts:171` (unconditional send) keeps the codebase consistent.

**Alternatives considered:**
- *Option B: add `console.error` on skip, keep behavior.* — Rejected. Manager still sees fake success. The actual problem (outbound never reaches Resend) is not solved.
- *Option C: refuse the SENT transition when URLs can't be built.* — Rejected. That blocks the manager's workflow when all they need is the SENT state for tracking. The email is a side effect of the state change, not a precondition.

**Files:**
- `app/actions/crm/estimates.ts` (`sendEstimate` function, lines 146–204) — remove silent skip, always build cabinet URL fallback, return user-visible error when email missing/implausible.

**Strategy:**
1. Collapse the URL-building into a single branch that always produces a non-null `viewUrl`/`pdfUrl`.
2. Move the `isPlausibleEmail` check BEFORE the transition (in line with returning a user-facing error so manager doesn't get the "SENT but no email" surprise).
3. Keep `recordOutboundEmail` → `sendEstimateSentEmail` → `markOutboundEmail{Sent,Failed}` chain identical.

**Tests:**
- `lib/email/__tests__/send-estimate.test.ts` (NEW) — unit-test the action's URL-building and outbound-recording paths via mocked `db`, `sendEmail`, and `recordOutboundEmail`. RED encodes: "no token + tempPassword + plausible email → outbound row IS created" (currently isn't).

**Defense-in-depth:** N/A — single-layer bug at the action. No deeper validation layers to add.

**Inbound (Symptom 1):** No code change needed beyond `8885e8e`. Verification is part of Task 3 — trigger fresh inbound, confirm `accepted_*` outcome on `/admin/settings/inbound-log`.

## Verification Scenario

### TS-001: Send Estimate Without Token — Outbound Appears in Resend

**Preconditions:** Logged in as admin. Open a DRAFT estimate on a deal whose customer has a plausible email but no `deal.claimToken` (Alex Alex deal is suitable — has a.m.spiskov@gmail.com).

| Step | Action | Expected Result (after fix) |
|------|--------|-----------------------------|
| 1 | Revise the active estimate to create a fresh DRAFT child. | New DRAFT estimate page opens. |
| 2 | Click "Отправить клиенту". | UI shows success; estimate stage = SENT. |
| 3 | Open `/admin/customers/<customer-id>`. | A new `EMAIL_OUTBOUND` row appears in the communication log, dated today. |
| 4 | Manager checks Resend dashboard → Emails. | A new outbound entry with the estimate subject is visible. |
| 5 | (Negative) Repeat with a customer having `customer.email = ""` or implausible. | Action returns visible error "У клиента не указан корректный email…", estimate stays DRAFT. |

### TS-002: Fresh Inbound Webhook Saves Successfully

**Preconditions:** Latest commit (`8885e8e` or descendant) is live on prod. User sends a real email from external account (e.g., gmail) to `info@geleoteka.ru`.

| Step | Action | Expected Result (after fix) |
|------|--------|-----------------------------|
| 1 | Send email from external account to `info@geleoteka.ru`. | Email leaves user's outbox. |
| 2 | Wait ≤ 30 seconds; reload `/admin/settings/inbound-log`. | New entry appears at the top with "✓ Сохранено" (or "Сохранено как inbox / communication") — NOT a 502 error. |
| 3 | Click into `/admin/crm/inbox`. | The new message appears with subject/body/from/to. |

## Progress

- [x] Task 1: Write Reproducing Tests (RED)
- [x] Task 2: Implement Fix at Root Cause
- [ ] Task 3: Quality Gate + E2E Verification on Prod
      **Tasks:** 3 | **Done:** 2

## Tasks

### Task 1: Write Reproducing Tests (RED)

**Objective:** Encode Symptom 2 as a failing test that calls `sendEstimate` for a customer with `claimToken=null` and `isTempPassword=true` and asserts that a `CommunicationLog` row WAS created. (Symptom 1's reproducing test is the live prod check in TS-002 — it cannot be unit-tested without simulating a full Resend HMAC+inbound payload chain, which already exists in `lib/email/__tests__/inbound.test.ts` if present.)

**Files:**
- `lib/email/__tests__/send-estimate.test.ts` (NEW) — minimal: one test method `it('records outbound even when customer has no claim token and temp password', ...)`.

**Entry point:** `sendEstimate(estimateId)` server action.

**Mocks required:**
- `@/lib/db` — `estimate.findUnique`, `estimate.updateMany`, `deal.update`, `communicationLog.create`.
- `@/lib/auth` — `requireRole` returns a fake session.
- `@/lib/email` dynamic import — assert `recordOutboundEmail` was called.

**DoD:** Test exists, runs via `npm test`, fails with assertion "expected `recordOutboundEmail` to be called once, but it was called 0 times". Production code untouched at this point.

**Verify:** `npm test -- --testPathPattern=send-estimate --bail` — must FAIL.

### Task 2: Implement Fix at Root Cause

**Objective:** Modify `sendEstimate` in `app/actions/crm/estimates.ts` (lines 146–204) to remove the silent skip. Always build `viewUrl`/`pdfUrl` from token (preferred) OR cabinet URL (fallback). Always attempt the outbound when `isPlausibleEmail(customer.email)`. Return a user-visible error when email missing/implausible.

**Files:**
- `app/actions/crm/estimates.ts` (`sendEstimate` only — do NOT touch `approveEstimate`, `unapproveEstimate`, etc.).

**Strategy:**
1. After `transitioned` guard, re-fetch `emailPayload` (unchanged).
2. Replace the `if (token) {...} else if (hasRealAccount) {...}` branching with a single fallback chain that always assigns `viewUrl` and `pdfUrl`.
3. Drop the `if (viewUrl && pdfUrl)` skip — replace with `if (isPlausibleEmail(customer.email))` guard, and on the `else` path return the user-facing error.
4. Outbound record + send + mark chain stays byte-identical.

**DoD:** Reproducing test from Task 1 PASSES. `app/actions/crm/estimates.ts` is the only modified file. Diff is < 30 lines net change.

**Verify:** `npm test -- --testPathPattern=send-estimate --bail` — must PASS.

### Task 3: Quality Gate + E2E Verification on Prod

**Objective:** Lint, typecheck, build, full test suite all green. Then deploy to prod, wait for Railway, and execute TS-001 + TS-002 via playwright-cli on https://geleoteka.ru. Do NOT report DONE until both scenarios pass with browser-level evidence.

**Verify (local):**
```
npx tsc --noEmit && npm run lint && npm run build && npm test
```

**Verify (prod, after `git push origin main` and ~3 min Railway deploy):**
1. **TS-001:** playwright-cli login as admin → open Alex Alex deal → revise active estimate → click "Отправить клиенту" → assert new `EMAIL_OUTBOUND` row visible on customer page. Manager confirms outbound visible in Resend dashboard out-of-band (we can't browse Resend dashboard from the test environment; rely on customer-page evidence as primary signal).
2. **TS-002:** Ask user to send a fresh email from gmail to `info@geleoteka.ru`. Wait ≤ 30 s. playwright-cli opens `/admin/settings/inbound-log`. Assert a new entry exists with outcome starting with "Сохранено" or "accepted_" (not "✗ Не дотянулись").

**DoD:** local commands green, both prod scenarios green with browser snapshot evidence pasted into the verify-phase report.
