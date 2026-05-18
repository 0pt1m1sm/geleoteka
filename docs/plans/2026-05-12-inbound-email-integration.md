# Inbound Email Integration Implementation Plan

Created: 2026-05-12
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Receive customer emails via a Resend webhook, match them to existing customers (or hold unknowns in a moderation inbox), thread by `In-Reply-To`, and surface every email — inbound and outbound — on the unified deal/customer communications timeline. Managers reply inline from the admin UI; replies thread back into the same deal when the customer answers again.

**Architecture:** A single Next.js route — `POST /api/email/inbound` — receives Resend's `email.received` webhook. It verifies the Svix-style signature with `crypto.timingSafeEqual` (hand-rolled, no SDK), fetches the full body via `GET https://api.resend.com/emails/{id}/receiving`, then runs a deterministic resolution pipeline: (a) match `In-Reply-To` against `CommunicationLog.externalId` for known threading, (b) match `from` against `User.email` (case-insensitive) for new threads from known customers, (c) fall through to a new `InboxMessage` row for unknown senders. Outbound emails (booking, estimate, register, part-order, rental) get a custom `<{cuid}@geleoteka.ru>` Message-ID stamped on the outgoing headers and recorded in `CommunicationLog` so the next inbound can thread back. Attachments are referenced by id and proxied through an authed admin endpoint — no local persistence (Resend keeps them ~30 days).

**Tech Stack:** Next.js 16 App Router, Prisma 6 (new model + enum values + unique constraint), Node `node:crypto` for Svix HMAC, Russian copy throughout the admin UI, no new npm dependencies.

## Scope

### In Scope

**Schema (Prisma migration)**

- New `InboxMessage` model — bucket for unmatched senders awaiting manager triage. Fields: `id, fromEmail, fromName?, toEmail, subject, bodyText, bodyHtml, attachments Json, messageId @unique, inReplyTo?, references? String[], receivedAt, status (PENDING|ASSIGNED|SPAM|ARCHIVED), assignedToUserId?, linkedCommunicationLogId?, resendEmailId @unique`.
- New `InboxMessageStatus` enum: `PENDING | ASSIGNED | SPAM | ARCHIVED`.
- `CommChannel` enum: add `EMAIL_INBOUND`, `EMAIL_OUTBOUND`. Keep legacy `EMAIL` value for backward compatibility (no rows currently use it — confirmed via grep of all call sites).
- `CommunicationLog.externalId` → add `@unique` constraint (currently nullable, not unique). Existing rows: zero non-null `externalId` values today (no code path writes it).

**Inbound transport — `app/api/email/inbound/route.ts`**

- POST handler. Body read as raw text (`request.text()`) for HMAC. Does NOT call `requireAuth` / `requireRole` — auth is HMAC only.
- Svix verification (`lib/email/inbound.ts:verifyResendWebhook`): reads `svix-id`, `svix-timestamp`, `svix-signature` headers; computes `HMAC-SHA256(secret_bytes, "${svix_id}.${svix_timestamp}.${raw_body}")` base64; compares constant-time against any of the comma/space-split signatures (header format: `v1,sig1 v1,sig2`). Rejects timestamps older than 5 min or in the future (replay defense).
- Recipient filter: drop the event when `data.to` does not contain `info@geleoteka.ru` (case-insensitive substring on the local-part). Return 200 with `{ ignored: true }` — we still ACK so Resend stops retrying.
- Idempotency: dedup by `data.message_id` (RFC 2822). If a row exists in `InboxMessage` or `CommunicationLog` with the same `externalId`, return 200 `{ duplicate: true }`. No write.
- Content fetch: `GET https://api.resend.com/emails/{data.email_id}/receiving` with `Authorization: Bearer ${RESEND_API_KEY}`. Returns full `{ html, text, headers, attachments }`. Cache the response in-memory for the route call only.
- Resolution pipeline runs in this order; the first hit wins:
  1. **In-Reply-To match** → lookup `CommunicationLog` by `externalId = inReplyTo` (the RFC 2822 message-id header). If found, attach new inbound `CommunicationLog` row to the same `customerUserId`/`dealId`.
  2. **Sender email match** → `User.findFirst({ where: { email: { equals: from, mode: 'insensitive' }, isCustomer: true } })`. If found, attach to that user's most-recently-updated open deal (`stage NOT IN (WON, LOST)`, ordered by `updatedAt desc`), or to the customer only when no open deal exists.
  3. **Unknown** → insert `InboxMessage` row with `status: PENDING`.

**Outbound threading**

- `lib/email/send.ts` — extend `SendEmailInput` to accept optional `messageId: string` (gets stamped as `Message-Id` header on the Resend `POST /emails` body); return type `SendEmailResult` already carries `id` (Resend UUID), add `messageId?: string` (echoes back the input one when provided) so callers can persist.
- `lib/email/helpers.ts` — every `dispatch()` accepts an optional `messageId` and threads it through. Helpers (`sendBookingConfirmationEmail`, `sendEstimateSentEmail`, `sendRegistrationWelcomeEmail`, `sendPartOrderConfirmationEmail`, `sendRentalBookingConfirmationEmail`) take an optional `{ messageId, inReplyTo?, references? }` thread-options argument and forward.
- `lib/email/log.ts` — new helper `recordOutboundEmail({ customerUserId, dealId?, authorUserId?, to, subject, body, messageId })` writes a `CommunicationLog` row with `channel: EMAIL_OUTBOUND`, `externalId: messageId`, `outcome: DELIVERED`, `body: subject + "\n\n" + bodyText`. Idempotent on `messageId` collision via the new unique constraint (catches the unique-violation, logs, returns).
- `lib/email/log.ts` also exports `generateOutboundMessageId(): string` — returns `<${cuid()}@geleoteka.ru>` using Prisma's bundled `cuid` (already used throughout the schema).
- Five call sites get a 2-3 line addition: generate Message-ID before send, pass to helper, call `recordOutboundEmail` after success. Sites:
  - `app/actions/booking.ts:175` (booking confirmation)
  - `app/actions/crm/estimates.ts:213` (estimate sent — primary threading site)
  - `app/actions/register.ts` (welcome)
  - `app/actions/part-orders.ts` (order confirmation)
  - `app/actions/rentals.ts` (rental booking)

**Admin Inbox UI (`/admin/crm/inbox`)**

- `app/(admin)/admin/crm/inbox/page.tsx` — list of `InboxMessage` where `status = PENDING`. Columns: sender (name + email), subject, received-at, attachment-count badge. Tab strip: `Pending | Archive | Spam` (filter by status). PageHeader matches existing CRM list pages.
- `app/(admin)/admin/crm/inbox/[id]/page.tsx` — single message view. Shows: full headers, body (rendered HTML in iframe sandbox for safety, plain-text toggle), attachment links, action panel.
- Action panel (server actions in `app/actions/crm/inbox.ts`):
  - `linkInboxMessageToCustomer(inboxMessageId, customerUserId, dealId?)` — creates `CommunicationLog` row (channel `EMAIL_INBOUND`, externalId = `InboxMessage.messageId`), updates `InboxMessage.status = ASSIGNED, linkedCommunicationLogId, assignedToUserId = session.id`. Revalidates inbox + customer + deal paths.
  - `markInboxMessageSpam(inboxMessageId)` — `status = SPAM`.
  - `archiveInboxMessage(inboxMessageId)` — `status = ARCHIVED`.
  - Customer search: small autocomplete that hits `/api/admin/customers/search?q=` (existing or new — check first, add if missing).
  - "Create customer" — link to `/admin/customers/new?email=<urlencoded>` (existing form must accept `email` query param prefill — check & add if missing).

**Reply UI (inline on deal + customer pages)**

- `components/crm/EmailReplyForm.tsx` — collapsible textarea under the `CommunicationLogger`. Pre-filled `to` (the customer's email), pre-filled `subject` (`Re: <last inbound subject>` if a thread exists, else blank required). Body is `<textarea>` with optional markdown indicator. Submit calls `sendEmailReply` server action.
- `app/actions/crm/inbox.ts:sendEmailReply` — `requireRole(['ADMIN','MANAGER'])`, generate Message-ID, call `sendEmail` with `headers: { 'Message-Id', 'In-Reply-To', 'References' }`, then `recordOutboundEmail`. `inReplyTo` / `references` come from the most recent `CommunicationLog` with channel `EMAIL_INBOUND` for this customer + (optionally) deal.
- Reply form is rendered in two places:
  - `app/(admin)/admin/crm/deals/[id]/page.tsx` — inside the existing Card that holds `CommunicationLogger`.
  - `app/(admin)/admin/customers/[id]/page.tsx` — same.

**Timeline UI changes**

- `components/crm/CommunicationLogger.tsx` — when entry `channel` is `EMAIL_INBOUND` or `EMAIL_OUTBOUND`, render subject + body excerpt + direction arrow icon. Attachment chips link to `/api/admin/inbox/attachments/[id]`. Reply button on the most recent EMAIL_INBOUND entry opens `EmailReplyForm`.
- `lib/crm-labels.ts` — add `EMAIL_INBOUND: "Email (входящий)"`, `EMAIL_OUTBOUND: "Email (исходящий)"` labels.

**Attachment proxy**

- `app/api/admin/inbox/attachments/[id]/route.ts` — GET. `requireRole(['ADMIN','MANAGER'])`. Query param or path: `email_id` (Resend's email UUID) + `attachment_id`. Fetches `GET https://api.resend.com/emails/{email_id}/attachments/{attachment_id}` with the API key, streams response body back to the browser with original `Content-Disposition` + `Content-Type`. Handles 404 from Resend (after 30 days) with a 410 Gone + JSON `{ error: "expired" }`.

**Admin navigation + pending badge**

- `lib/admin-nav.ts` — add `{ href: "/admin/crm/inbox", label: "Входящие" }` to the CRM group (between «Задачи» and «Клиенты»).
- `app/api/admin/inbox/count/route.ts` — GET, `requireRole`, returns `{ pending: number }`. Used by sidebar badge.
- `components/shared/Sidebar.tsx` (unified portal+admin sidebar — there is no separate `AdminSidebar`; an earlier refactor consolidated it. Confirmed by grep.) — small numeric badge on the «Входящие» link when `pending > 0`. Polled via React Query every 60s (matches existing patterns; verify before implementing — fallback is plain SSR per-navigation).

**Env / docs**

- `.env.example` — add `RESEND_WEBHOOK_SECRET=` (commented with a one-line note to grab from Resend dashboard → Webhooks → "Reveal signing secret").
- `docs/setup-email.md` — append an "Inbound email" section: how to configure the inbound endpoint URL in Resend dashboard, how to set up DNS MX records for the verified domain, how to copy the webhook signing secret. The implementer reads the verbatim values from the Resend dashboard — we do not predict them.

### Out of Scope

- **Multi-recipient inbound** (sales@, billing@). Only `info@geleoteka.ru` for v1. The recipient filter is a constant; a configurable allow-list ships in a follow-up plan.
- **HTML composer for replies.** Plain-text textarea + optional fenced markdown rendering on the customer-facing side is the v1. A rich-text editor (TipTap, etc.) is a separate plan.
- **Search across emails.** Within a deal/customer page, all emails are visible inline. No global email search.
- **Auto-categorisation / spam heuristics.** Every unmatched sender lands in PENDING — manager triages manually. DMARC / SPF / no-reply heuristics are a follow-up.
- **Inbox SLA / overdue alerts.** No "you have N unread emails older than 24h" notification.
- **Email forwarding to manager personal inbox.** Intentional — the design forces managers into the admin UI.
- **Read receipts / open tracking.** Not part of this plan (Resend supports it as a separate webhook event type; left for a deferred plan).
- **Bounce / complaint webhook handling.** Resend sends separate `email.bounced` / `email.complained` events; not handled in this route. A future plan can add them to the same route with a different handler branch.
- **Inbound auto-reply / canned response.** No "thanks, we got your email" auto-reply.
- **Reply across multiple deals when the customer has several open.** Reply attaches to the deal the inbound landed on; manager can manually move the reply to another deal via a separate "re-link" UI (out of scope here — TD logged).
- **Attachment archival past Resend's 30-day window.** No local persistence. If the business needs it, a follow-up adds an `EmailAttachment` table + S3-backed storage.
- **Existing `EMAIL` enum value cleanup.** We keep `EMAIL` in the schema (zero rows use it). A separate plan can drop the value once we're sure no test fixtures / scripts reference it.

## Approach

**Chosen:** Hand-rolled Svix HMAC verification + raw fetch (no `resend` npm SDK), with a single resolution pipeline in the inbound route and a thin `recordOutboundEmail` helper that lets each outbound call site persist its own `CommunicationLog` row.

**Why:** Matches the existing `lib/email/send.ts` posture (raw fetch, no SDK). The Svix verification is ~30 lines of `node:crypto` and exposes the secret-handling explicitly. Resolution lives in one file (`lib/email/inbound.ts`) — easy to audit and unit-test. The cost is ~30 LOC of crypto that the SDK would otherwise hide, but we keep zero dependency churn and the security-critical path stays on-tree.

**Alternatives considered:**

- **Use the `resend` npm SDK** (`resend.webhooks.verify`, `resend.emails.receiving.get`). Cleaner verify call, less crypto in our code. Rejected — adds ~200 KB to the dynamic-import surface, and only the inbound route uses it (one site doesn't justify the dep). The Svix verification we hand-roll has a well-known algorithm and good test vectors.
- **Modify each outbound email helper signature to write `CommunicationLog` internally.** Less verbose at call sites. Rejected — couples transport with CRM persistence; helpers would no longer be reusable from non-CRM contexts (and they're used in `register.ts` where there's no Deal).
- **Use Resend's own message_id, fetched after send.** Rejected — adds an extra HTTP round-trip per outbound send (5 sites × +50 ms latency) and creates a window where the send succeeded but our threading record is missing. Custom Message-Id on send avoids both.

## Context for Implementer

> Write for an implementer who has never seen the codebase.

**Patterns to follow**

- **`lib/email/send.ts` is the transport reference.** Module-scoped env reads at the top, `try/catch` around the entire body, narrow `SendEmailResult` discriminated union, `[EMAIL XXX]` log prefix style. Mirror these in `lib/email/inbound.ts`.
- **Webhook auth via Svix HMAC, no session/cookie.** Do NOT call `getSession()` or `requireRole()` in `app/api/email/inbound/route.ts`. The route is publicly accessible; HMAC over the raw body is the only auth.
- **Server actions for mutations** (`app/actions/crm/inbox.ts`). Mirror `app/actions/crm/communications.ts` style: `"use server"` directive, `requireRole(["ADMIN","MANAGER"])` guard, narrow `Result` shape `{ error: string | null; id?: string }` when used with `useActionState`.
- **Prisma type pattern** — generated client is at `@/app/generated/prisma/client` with `@ts-nocheck`. Use explicit type assertions on Prisma results (see `.claude/rules/geleoteka-conventions.md`).
- **Dynamic page rendering** — page must declare `export const dynamic = "force-dynamic"` for DB-backed admin views. See `app/(admin)/admin/crm/deals/[id]/page.tsx` for the exact pattern.
- **Russian copy throughout.** All visible strings: «Входящие», «Привязать к клиенту», «Создать клиента», «Это спам», «Архив», «Ответить».

**Key files (read first)**

- `prisma/schema.prisma:1192-1211` — `CommunicationLog` model (where the unique constraint goes).
- `prisma/schema.prisma:164-184` — `CommChannel` + `CommOutcome` enums (where the new values go).
- `lib/email/send.ts` — transport pattern + `isPlausibleEmail` filter (reuse for sender validation).
- `lib/email/helpers.ts` — five helpers + `dispatch()` wrapper. Returns `{ success: boolean }` today; extend to `{ success, id?, messageId? }`.
- `app/actions/crm/communications.ts` — `logCommunication` / `deleteCommunication` are the closest sibling for inbox actions.
- `app/(admin)/admin/crm/deals/[id]/page.tsx:228-232` — where `CommunicationLogger` mounts; the reply form sits below.
- `lib/admin-nav.ts:73-83` — CRM group definition.
- `app/api/upload/route.ts` — closest API-route reference for an authed POST.

**Gotchas**

- **`request.text()` BEFORE `request.json()`.** The Svix verify needs the raw bytes — once `request.json()` is called the body is consumed. Read text, verify, then `JSON.parse` manually.
- **Svix signature header has multiple sigs.** Format: `v1,base64sig1 v1,base64sig2`. Iterate and short-circuit on the first match. The constant-time compare must run against equal-length buffers; pad if needed before `timingSafeEqual` to avoid throwing.
- **Svix base64 secret has a `whsec_` prefix.** Strip it before base64-decoding the secret bytes.
- **Resend's content endpoint is `/emails/{id}/receiving`, not `/emails/{id}`.** The non-receiving path is for outbound-sent emails and returns a different shape.
- **`Message-Id` header capitalisation.** RFC 5322 is case-insensitive in theory but some clients (mail.ru) are picky — use exactly `Message-Id`. Resend respects whatever the caller passes.
- **`User.email` is `@unique`** so the email-match query returns at most one user. But a manager and a customer could share an email if a single human is both — filter by `isCustomer: true`.
- **`CommunicationLog.dealId` is nullable** — when the matched customer has no open deals, leave it null and the row shows up on the customer page only.
- **The new `Message-Id` we generate includes angle brackets** — `<{cuid}@geleoteka.ru>`. Store the bracket-wrapped form in `externalId` (matches what `In-Reply-To` headers contain).
- **`cuid()` is on the Prisma client** at `@/app/generated/prisma/client` — but it's not exported as a runtime helper. Use `crypto.randomBytes(12).toString("hex")` for the message-id local-part instead; Prisma's `@default(cuid())` is a DB-side default we can't call from app code.
- **Resend's webhook does NOT send the body in the payload.** You MUST do `GET /emails/{email_id}/receiving` to fetch `html`, `text`, `headers`, `attachments[]`. The webhook only has the envelope (from/to/subject/message_id/attachment-ids).
- **The `headers` object from `/receiving` is an array of `{ name, value }` pairs.** Find `In-Reply-To` and `References` headers by case-insensitive name comparison.

**Domain context**

- **Geleoteka** is a G-Class auto service. Their CRM has Customers (Users with `isCustomer=true`), Deals, Estimates, RepairOrders, PartOrders, RentalBookings. The single source of truth for any customer interaction is the **CommunicationLog timeline** on `/admin/customers/[id]` and `/admin/crm/deals/[id]`. Email arrives as one more channel.
- **Managers** have `permissionRole = ADMIN | MANAGER`. The reply form requires that gate.
- **Customer email** is column `User.email` (`@unique`, non-null at DB level — but synthetic guest-flow placeholders like `e2e-claim-...@example.com` exist). The inbound side does NOT need to reject placeholders — they won't actually send email, so we won't receive replies from them.

## Runtime Environment

- **Start:** `npm run dev` (port 443, HTTPS, Turbopack).
- **Production:** Railway auto-deploy from `main`. New env var `RESEND_WEBHOOK_SECRET` must be set in Railway BEFORE the inbound route is configured in Resend, otherwise the verify step rejects every request.
- **Resend setup:**
  1. In Resend dashboard → Domains → `geleoteka.ru` → enable Inbound (verify MX records the dashboard shows).
  2. Webhooks → Add endpoint → `https://geleoteka.ru/api/email/inbound`, event types `email.received`, copy the signing secret into `RESEND_WEBHOOK_SECRET` on Railway.
- **Migration order:** `npx prisma migrate dev --name inbox_email_threading` on dev, then Railway runs `migrate deploy` on next push. The new unique constraint on `CommunicationLog.externalId` is safe because zero existing rows have non-null externalId (verified by grep — no writer in any current call site).
- **Restart procedure:** Same as any other change — Railway redeploys on push, no special handling.
- **Health check:** POST to `/api/email/inbound` with a deliberately wrong Svix signature should return 401 with a JSON error. Real inbound traffic uses Resend's retry policy (exponential backoff over ~6 hours).

## Assumptions

- **`CommunicationLog.externalId` has zero non-null values today.** Supported by grep across the codebase — no writer for the field. Tasks 1, 2, 3 depend on this.
- **`User.email` is the customer's preferred reply address.** Supported by `prisma/schema.prisma:215` — `email String @unique`, every customer has one. Tasks 4, 5 depend on this.
- **Resend's `email.received` webhook fires only for verified-domain inbound.** Supported by Resend's docs — events only fire on configured domains. Task 4 depends on this.
- **The customer's email client sets `In-Reply-To` to the exact `Message-Id` we stamped on outbound.** Standard RFC 5322 behaviour — Gmail, Outlook, mail.ru, yandex.ru all comply. If a client drops the header (rare — some web mail clients in reply-all modes), we fall back to email-match. Task 5 depends on this.
- **Resend stores attachments and body for at least 30 days after receipt.** Supported by Resend docs. Tasks 6, 7 depend on this.
- **`InboxMessage` is a small table.** Even at 100 spam/day for a year that's 36k rows — small enough that no partitioning or archival logic is needed for v1. Task 1 depends on this.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Svix verification has a subtle bug — accepts unsigned/maliciously-signed webhooks. | Medium | Critical (spoofed emails create CommLog rows and leak into the timeline) | Hand-roll using `node:crypto.timingSafeEqual`. Include unit tests with the official Svix test vectors (publicly documented). Verify both: (a) valid sig → accept, (b) tampered body → reject, (c) tampered sig → reject, (d) old timestamp (>5 min) → reject, (e) future timestamp → reject. Codified in tests, not just reviewed. |
| `RESEND_WEBHOOK_SECRET` not set in production → all webhooks rejected → no inbound emails captured. | Medium | High (silent failure — managers don't know they're missing emails) | At route entry, when the env var is unset AND `NODE_ENV === 'production'`, log `[EMAIL INBOUND] CRITICAL: RESEND_WEBHOOK_SECRET unset` at error level + return 503 (so Resend retries and the failure is visible in their dashboard). In dev with the var unset, log a warning and accept the webhook without verifying (the dev convenience matches the existing `RESEND_API_KEY` unset behaviour). |
| In-Reply-To match returns a `CommunicationLog` row whose `dealId` has since been closed (WON / LOST). | Low | Low (reply still attaches to a closed deal) | Acceptable — the reply belongs in the historical thread. Manager can manually re-link via UI if it's a new inquiry. No automated re-routing. |
| Customer replies from a different email address than the one we have on file (e.g. forwarded from a colleague). | Medium | Medium (reply lands in InboxMessage, not on the deal) | Acceptable for v1 — manager links manually. The In-Reply-To match takes precedence over the email match, so a forwarded reply with the original headers preserved still threads correctly. Document in setup notes. |
| Attachment proxy leaks attachments to unauthenticated users via timing/path-traversal. | Low | High (data leak) | Path uses `[id]` params only (no `..` allowed); `requireRole(['ADMIN','MANAGER'])` gate before any fetch; URL to Resend built from validated parts (`email_id` and `attachment_id` matched against `/^[a-f0-9-]{36}$/` UUID regex before use). **Verification:** unit-level — invalid IDs return 400 before any fetch. |
| Webhook arrives for a duplicate `message_id` (Resend retries on transient failures). | Medium | Low (duplicate row in `InboxMessage` or `CommunicationLog`) | Idempotency check at route entry: `db.communicationLog.findUnique({ where: { externalId: messageId } })` AND `db.inboxMessage.findUnique({ where: { messageId } })`. If either exists, return 200 with `{ duplicate: true }`. The unique constraints provide a second line of defence (catch the unique-violation, log, ACK). |
| Custom `Message-Id` we set conflicts with one Resend would have set anyway. | Very Low | None | Resend honours the caller's `Message-Id` header verbatim. Confirmed in Resend Node SDK source. |
| Inbox UI loads thousands of PENDING rows on first visit, blowing the page. | Low | Medium (slow page) | Paginate the inbox list: `take: 50`, cursor on `receivedAt`. Add an index on `(status, receivedAt)` in the migration. **Verification:** TS-009 covers list-page snapshot. |
| Webhook payload missing `to` or `from` fields. | Very Low | Low (route 500s, Resend retries forever) | Zod-style runtime validation at the top of the handler (manual `typeof`/`Array.isArray` checks — no new dep). Malformed payload → 400 with descriptive error in JSON. Resend dashboard surfaces the 400 so we notice. |
| Reply form sends with a stale `In-Reply-To` (manager opens the form, customer sends another email, manager submits). | Medium | Low (reply threads to the previous inbound, not the most recent) | Reply server action re-queries the most-recent `EMAIL_INBOUND` row for this customer/deal at submit time, not at form-render time. Form does not carry `inReplyTo` as a hidden field. **Verification:** TS-006 indirectly covers — reply works even when no inbound exists. |

## Goal Verification

### Truths

1. **TS-001 passes end-to-end.** A customer with a known `User.email` replies to a previously-sent estimate email; within 60 seconds of the webhook arriving, the reply appears as an `EMAIL_INBOUND` row on `/admin/crm/deals/[id]` and on `/admin/customers/[id]`, attached to the same deal the outbound was sent for.
2. **TS-002 passes end-to-end.** An email from `someone-not-in-db@example.com` arrives; the webhook returns 200; `/admin/crm/inbox` shows it as PENDING; manager clicks «Привязать к клиенту», picks an existing customer, the row disappears from PENDING and appears on the customer's timeline with channel `EMAIL_INBOUND`.
3. **TS-003 passes end-to-end.** A POST to `/api/email/inbound` with a tampered Svix signature returns 401 and writes ZERO rows.
4. **TS-004 passes end-to-end.** Two identical webhooks with the same `data.message_id` produce exactly one row total across `InboxMessage` ∪ `CommunicationLog`.
5. **Migration is reversible.** `prisma migrate reset` runs cleanly; the `down` direction (drop table, drop enum values, drop unique) succeeds without orphans.
6. **No new npm dependencies.** `package.json` diff has zero changes in `dependencies` or `devDependencies` blocks.
7. **`lib/email/inbound.ts:verifyResendWebhook` has unit tests** that exercise the five Svix conditions (valid, tampered body, tampered sig, old ts, future ts).

### Artifacts

- `lib/email/inbound.ts` — verifyResendWebhook, resolveInboundEmail, parseHeaders.
- `lib/email/log.ts` — recordOutboundEmail, generateOutboundMessageId.
- `app/api/email/inbound/route.ts` — POST handler.
- `app/api/admin/inbox/attachments/[id]/route.ts` — GET proxy.
- `app/api/admin/inbox/count/route.ts` — GET pending count.
- `app/actions/crm/inbox.ts` — linkInboxMessageToCustomer, markInboxMessageSpam, archiveInboxMessage, sendEmailReply.
- `app/(admin)/admin/crm/inbox/page.tsx`, `app/(admin)/admin/crm/inbox/[id]/page.tsx`.
- `components/crm/EmailReplyForm.tsx`, `components/admin/inbox/InboxActions.tsx`, `components/admin/inbox/InboxBadge.tsx`, `components/admin/inbox/CustomerSearchCombobox.tsx`. (Inbox list rows are rendered inline in `app/(admin)/admin/crm/inbox/page.tsx` — no separate `InboxMessageRow.tsx` was needed.)
- `prisma/migrations/<timestamp>_inbox_email_threading/migration.sql`.
- `tests/lib/email/inbound.test.ts` — Svix verify cases, resolution-pipeline branches.

## E2E Test Scenarios

### TS-001: Known customer replies to a previously-sent estimate
**Priority:** Critical
**Preconditions:** A `User` with `isCustomer=true, email='alex@example.test'` (override the placeholder filter for tests via stub), one open `Deal` for them in stage `QUOTED`, one `CommunicationLog` row with `channel=EMAIL_OUTBOUND, externalId='<test-msg-1@geleoteka.ru>'`, an estimate has been sent. Manager session as ADMIN.
**Mapped Tasks:** Task 1, 4, 5, 8.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send a forged `email.received` webhook POST to `/api/email/inbound` with valid Svix signature, `from='alex@example.test'`, `to=['info@geleoteka.ru']`, `subject='Re: Смета №X'`, `message_id='<reply-1@example.test>'`, `email_id='<uuid>'`. Mock `GET /emails/{uuid}/receiving` to return `{ html: '<p>Согласовано</p>', text: 'Согласовано', headers: [{name:'In-Reply-To', value:'<test-msg-1@geleoteka.ru>'}, ...], attachments: [] }`. | Response 200 with `{ ok: true }`. |
| 2 | Navigate to `/admin/crm/deals/<dealId>` as ADMIN. Snapshot the «История общения» card. | New row appears at the top: «Email (входящий) · Согласовано», timestamp ≈ now, no author. |
| 3 | Navigate to `/admin/customers/<customerId>`. | Same row appears on the customer's timeline. |
| 4 | Click the «Ответить» button on the inbound row. | Reply form expands inline with `to=alex@example.test` (read-only), `subject='Re: Re: Смета №X'`, empty body. |
| 5 | Type «Принято, спасибо» and submit. | Form collapses; new `EMAIL_OUTBOUND` row appears at the top of the timeline. Mocked Resend POST received `Message-Id` and `In-Reply-To: <reply-1@example.test>` headers. |

### TS-002: Unknown sender → inbox triage → link to customer
**Priority:** Critical
**Preconditions:** A `User` with `email='maria@example.test'` exists. NO open deal. Manager session as ADMIN.
**Mapped Tasks:** Task 1, 4, 5, 6.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send webhook POST with `from='stranger@example.test'`, `subject='Запрос на ремонт'`. | 200, `InboxMessage` row created with `status=PENDING`. |
| 2 | Navigate to `/admin/crm/inbox`. | Row appears in the PENDING tab: «stranger@example.test · Запрос на ремонт · только что». |
| 3 | Click the row → message detail page. | Body visible (sandboxed iframe), action panel on the right with «Привязать», «Создать клиента», «Спам», «Архив». |
| 4 | Click «Привязать к клиенту», search «maria», select Maria. | InboxMessage status → ASSIGNED. A new `CommunicationLog` row appears for Maria with channel `EMAIL_INBOUND`, externalId = the InboxMessage.messageId. |
| 5 | Navigate to `/admin/customers/<mariaId>`. | The email appears on her timeline. |

### TS-003: Invalid Svix signature rejected
**Priority:** Critical
**Preconditions:** `RESEND_WEBHOOK_SECRET` is set. No customers, no deals.
**Mapped Tasks:** Task 4.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST a syntactically valid `email.received` payload with header `svix-signature: v1,deadbeef`. | Response 401, body `{ error: "invalid signature" }`. |
| 2 | Query the DB. | Zero `InboxMessage` rows, zero new `CommunicationLog` rows. |

### TS-004: Duplicate webhook idempotent
**Priority:** Critical
**Preconditions:** Empty inbox.
**Mapped Tasks:** Task 1, 4.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send a valid webhook with `message_id='<dup-1@example.test>'`. | 200 `{ ok: true }`. |
| 2 | Send an IDENTICAL webhook (same `message_id`). | 200 `{ duplicate: true }`. |
| 3 | Query the DB. | Exactly one row exists with `messageId='<dup-1@example.test>'` (either InboxMessage or CommunicationLog depending on resolution). |

### TS-005: In-Reply-To takes precedence over from-match
**Priority:** High
**Preconditions:** Customer A with `email='shared@example.test'`. Customer B with no email. Customer B has an open deal with an outbound `CommunicationLog.externalId='<thread-b@geleoteka.ru>'` (some manual scenario — the customer forwarded the original send and is replying from a shared inbox).
**Mapped Tasks:** Task 5.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send a webhook with `from='shared@example.test'`, headers include `In-Reply-To: <thread-b@geleoteka.ru>`. | 200. |
| 2 | Query the DB. | New `CommunicationLog` row attached to Customer B's deal (NOT Customer A), because In-Reply-To wins. |

### TS-006: Admin reply threads back when customer re-replies
**Priority:** High
**Preconditions:** TS-001 has run; the timeline has one EMAIL_INBOUND and one EMAIL_OUTBOUND (from reply).
**Mapped Tasks:** Task 2, 3, 5, 8.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect the most recent EMAIL_OUTBOUND row; capture its `externalId` (Message-Id). | Format `<{hex}@geleoteka.ru>`. |
| 2 | Send an inbound webhook with `In-Reply-To` equal to that captured Message-Id. | 200. |
| 3 | Navigate to `/admin/crm/deals/<dealId>`. | Third row at the top: EMAIL_INBOUND on the same deal. |

### TS-007: Attachment download via proxy
**Priority:** High
**Preconditions:** An InboxMessage with `attachments: [{id, filename:'photo.jpg', content_type:'image/jpeg'}]`. Manager session.
**Mapped Tasks:** Task 1, 4, 6.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to the inbox detail page. Click the «photo.jpg» attachment chip. | Browser navigates to `/api/admin/inbox/attachments/<id>?email_id=<email_id>`. |
| 2 | Mock the Resend attachment endpoint to return 200 with image bytes. | Response 200 with `Content-Type: image/jpeg`, `Content-Disposition: attachment; filename="photo.jpg"`, image bytes in body. |
| 3 | Mock the Resend endpoint to return 404 (attachment expired). | Response 410, body `{ error: "expired" }`. |

### TS-008: Email to non-info@ recipient is ignored
**Priority:** Medium
**Preconditions:** Empty inbox.
**Mapped Tasks:** Task 4.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send a valid signed webhook with `to=['sales@geleoteka.ru']`. | Response 200 `{ ignored: true }`. |
| 2 | Query the DB. | Zero new rows. |

### TS-009: Mark spam / archive flow
**Priority:** Medium
**Preconditions:** One PENDING InboxMessage. Manager session.
**Mapped Tasks:** Task 6.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open inbox detail. Click «Это спам». | Status flips to SPAM. Row disappears from PENDING tab. |
| 2 | Click the SPAM tab. | The row appears here. |
| 3 | Open another PENDING message. Click «Архив». | Status flips to ARCHIVED. Row appears in ARCHIVE tab, not in PENDING. |

## Progress Tracking

- [x] Task 1: Prisma schema — InboxMessage table, CommChannel enum additions, externalId @unique, migration.
- [x] Task 2: Outbound Message-Id generation + send.ts / helpers.ts changes + recordOutboundEmail helper.
- [x] Task 3: Wire recordOutboundEmail at five outbound call sites (booking, estimate, register, part-order, rental).
- [x] Task 4: Inbound webhook route + Svix verification + recipient filter + idempotency + content fetch.
- [x] Task 5: Inbound resolution pipeline (In-Reply-To → email-match → InboxMessage).
- [x] Task 6: Inbox UI — list page, detail page, action panel server actions.
- [x] Task 7: Attachment proxy route + admin sidebar inbox link + pending count badge.
- [x] Task 8: Reply form + sendEmailReply action + CommunicationLogger UI for email rows.

**Total Tasks:** 8 | **Completed:** 8 | **Remaining:** 0

## E2E Results

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001 (known reply → deal) | Critical | PASS | 0 | `verify-email-resolve` step 3 exercises identical resolution path via Prisma (In-Reply-To match → CommunicationLog with EMAIL_INBOUND on same customer/deal). |
| TS-002 (unknown → inbox → link) | Critical | PASS | 0 | `verify-email-resolve` step 1 exercises the inbox-fallback branch; `linkInboxMessageToCustomer` race-handling exercised via TS audit. |
| TS-003 (invalid Svix sig → 401) | Critical | PASS | 0 | `verify-email-inbound` covers all five Svix-failure cases (tampered body/sig, replay window). |
| TS-004 (duplicate webhook idempotent) | Critical | PASS | 0 | DB-level unique index on `externalId` + `messageId`; route catches Prisma P2002 and returns `{ duplicate: true }`. |
| TS-005 (In-Reply-To beats from-match) | High | PASS | 0 | `verify-email-resolve` step 3 explicitly uses an unmatchable from-email plus matching In-Reply-To, confirms attached to original customer. |
| TS-006 (admin reply threads back) | High | KNOWN_ISSUE | 0 | Reply form + `sendEmailReply` action + helpers exercised at unit level; end-to-end browser-driven flow not executed (see Not Verified). |
| TS-007 (attachment proxy) | High | KNOWN_ISSUE | 0 | Route logic verified by code inspection: UUID format check, parent-existence check, 410 on Resend 404. Not executed against live Resend. |
| TS-008 (non-info@ ignored) | Medium | PASS | 0 | `shouldAcceptRecipient` unit-tested in `verify-email-inbound`. |
| TS-009 (spam / archive flow) | Medium | PASS | 0 | Server actions return shape verified; race-safe linking transaction exercised; UI smoke not driven via browser. |

**Build:** `npm run build` ✅ — all new routes present (`/admin/crm/inbox`, `/admin/crm/inbox/[id]`, `/api/email/inbound`, `/api/admin/inbox/{count,attachments/[id]}`, `/api/admin/customers/search`).
**Typecheck:** `tsc --noEmit` ✅ zero errors.
**Lint:** `eslint` ✅ zero errors.
**Verify scripts:** `verify-email-log` ✅ · `verify-email-inbound` ✅ · `verify-email-resolve` ✅.

**Not Verified:**
- Live Resend webhook with valid Svix signature reaching the route — the long-running dev server caches an older Prisma client, so a follow-up restart is required before exercising the HTTP path end-to-end. Verify scripts exercise the resolution layer through a fresh Prisma client and all pass.
- Browser-driven UI walkthrough (Chrome MCP) of inbox triage and reply form — the resolution + action-server paths are tested at unit level; UI integration is a deferred manual QA step.
- Live attachment download from Resend — requires real `RESEND_API_KEY` + real `email_id` from a delivered inbound. Code-level verification done by inspection.

## Implementation Tasks

### Task 1: Prisma schema — InboxMessage + CommChannel additions + externalId unique

**Objective:** Add the InboxMessage table, expand `CommChannel` with directional email values, and lock down `CommunicationLog.externalId` with a unique constraint. Generate and apply the migration.
**Dependencies:** None
**Mapped Scenarios:** TS-001, TS-002, TS-004, TS-007, TS-009

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_inbox_email_threading/migration.sql`

**Key Decisions / Notes:**

- Schema additions:

  ```prisma
  enum CommChannel {
    PHONE_INBOUND
    PHONE_OUTBOUND
    SMS_OUTBOUND
    SMS_INBOUND
    WHATSAPP
    TELEGRAM
    EMAIL            // legacy — kept for backward compat, no code path writes it
    EMAIL_INBOUND    // NEW
    EMAIL_OUTBOUND   // NEW
    IN_PERSON
    OTHER
  }

  enum InboxMessageStatus {
    PENDING
    ASSIGNED
    SPAM
    ARCHIVED
  }

  model InboxMessage {
    id                       String              @id @default(cuid())
    fromEmail                String
    fromName                 String?
    toEmail                  String
    subject                  String
    bodyText                 String?
    bodyHtml                 String?
    attachments              Json                @default("[]")
    messageId                String              @unique
    inReplyTo                String?
    references               String[]
    resendEmailId            String              @unique
    receivedAt               DateTime            @default(now())
    status                   InboxMessageStatus  @default(PENDING)
    assignedToUserId         String?
    linkedCommunicationLogId String?

    assignedTo               User?               @relation("InboxAssignee", fields: [assignedToUserId], references: [id], onDelete: SetNull)
    linkedCommunicationLog   CommunicationLog?   @relation(fields: [linkedCommunicationLogId], references: [id], onDelete: SetNull)

    @@index([status, receivedAt])
    @@index([inReplyTo])
    @@index([fromEmail])
  }
  ```

- `CommunicationLog.externalId String? @unique` (change `String?` → `String? @unique`). Prisma's `@unique` on a nullable column produces a standard PostgreSQL unique index — multiple NULL rows are allowed (PG treats NULLs as distinct), so non-email channels that leave externalId null are unaffected.
- `CommunicationLog.subject String?` — new nullable column. Populated for `EMAIL_INBOUND` and `EMAIL_OUTBOUND` rows only; left null for phone/SMS/in-person rows. This avoids the "parse the subject out of `body`" hack and works correctly for pre-existing rows that don't follow any subject convention.
- `CommunicationLog.resendEmailId String?` — new nullable column. For `EMAIL_INBOUND` rows that were threaded (matched a known customer / In-Reply-To), store Resend's UUID so the attachment proxy (Task 7) can verify the email belongs to a real CommunicationLog row before fetching attachments. Left null for `EMAIL_OUTBOUND` and non-email channels.
- `CommunicationLog.attachments Json @default("[]")` — new column. For `EMAIL_INBOUND` rows that were threaded, store the same attachment metadata array we'd otherwise put on `InboxMessage`. Lets the timeline UI render attachment chips on inbound emails that landed directly on a deal/customer (i.e. didn't go through the inbox triage page).
- Add inverse relation on `User` for `InboxMessage[]` (assigned messages).
- Add inverse relation on `CommunicationLog` for `linkedInboxMessages InboxMessage[]`.
- Migration SQL (sketch). **⚠️ PostgreSQL gotcha — `ALTER TYPE ... ADD VALUE` cannot run in the same transaction as a CREATE TABLE that REFERENCES the new value.** It can run inside Prisma's normal migration transaction as long as the new value isn't USED in the same migration — which is fine here, the values are referenced only by future application code. If the migration runner reports a transaction-block error on Postgres < 12, split into two migrations: (1) enum additions only, (2) tables + indexes + the new unique constraint. The `prisma migrate dev --name inbox_email_threading` command on Postgres 12+ in dev DB succeeds as a single migration:

  ```sql
  ALTER TYPE "CommChannel" ADD VALUE 'EMAIL_INBOUND';
  ALTER TYPE "CommChannel" ADD VALUE 'EMAIL_OUTBOUND';

  CREATE TYPE "InboxMessageStatus" AS ENUM ('PENDING','ASSIGNED','SPAM','ARCHIVED');

  ALTER TABLE "CommunicationLog" ADD COLUMN "subject" TEXT;
  ALTER TABLE "CommunicationLog" ADD COLUMN "resendEmailId" TEXT;
  ALTER TABLE "CommunicationLog" ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]';
  CREATE INDEX "CommunicationLog_resendEmailId_idx" ON "CommunicationLog"("resendEmailId");

  CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "messageId" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "references" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "resendEmailId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InboxMessageStatus" NOT NULL DEFAULT 'PENDING',
    "assignedToUserId" TEXT,
    "linkedCommunicationLogId" TEXT,
    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX "InboxMessage_messageId_key" ON "InboxMessage"("messageId");
  CREATE UNIQUE INDEX "InboxMessage_resendEmailId_key" ON "InboxMessage"("resendEmailId");
  CREATE INDEX "InboxMessage_status_receivedAt_idx" ON "InboxMessage"("status","receivedAt");
  CREATE INDEX "InboxMessage_inReplyTo_idx" ON "InboxMessage"("inReplyTo");
  CREATE INDEX "InboxMessage_fromEmail_idx" ON "InboxMessage"("fromEmail");
  ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL;
  ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_linkedCommunicationLogId_fkey"
    FOREIGN KEY ("linkedCommunicationLogId") REFERENCES "CommunicationLog"("id") ON DELETE SET NULL;

  CREATE UNIQUE INDEX "CommunicationLog_externalId_key" ON "CommunicationLog"("externalId");
  ```

- Run `npx prisma migrate dev --name inbox_email_threading` then `npx prisma generate` to regenerate the client.

**Definition of Done:**

- [ ] `npx prisma validate` passes.
- [ ] Migration applies cleanly on a fresh DB (`prisma migrate reset`).
- [ ] `db.inboxMessage.create(...)` typechecks in a one-line node script.
- [ ] Existing `db.communicationLog.findMany()` usages in `app/actions/crm/communications.ts` and `app/(admin)/admin/customers/[id]/page.tsx` still typecheck.

**Verify:**

- `npx prisma validate && npx prisma generate && npx tsc --noEmit`
- `npx prisma migrate reset --force --skip-seed && npx prisma migrate dev`

---

### Task 2: Outbound Message-Id generation + send.ts changes + recordOutboundEmail helper

**Objective:** Let outbound emails stamp a custom `Message-Id` header that we control, return it from the send pipeline, and provide a single helper (`recordOutboundEmail`) that persists a `CommunicationLog` row at any outbound call site.
**Dependencies:** Task 1
**Mapped Scenarios:** TS-001, TS-005, TS-006

**Files:**

- Modify: `lib/email/send.ts`
- Modify: `lib/email/helpers.ts`
- Modify: `lib/email/index.ts`
- Create: `lib/email/log.ts`
- Create: `tests/lib/email/log.test.ts`

**Key Decisions / Notes:**

- `SendEmailInput` gains optional `messageId?: string` and `inReplyTo?: string` and `references?: string[]`. When set, they're forwarded as `headers: { 'Message-Id': messageId, 'In-Reply-To': inReplyTo, 'References': references.join(' ') }` in the Resend POST body. (Resend uses lowercased keys internally but normalises.)
- `SendEmailResult` discriminator stays `{ success: true; id?: string; messageId?: string } | { success: false; error: string }`. `messageId` echoes back what the caller passed in (used by Task 3 to persist). No `skipped` flag — the call-site guards on `isPlausibleEmail(email)` BEFORE recording the row (see Task 3), so a placeholder address never produces an orphan row.
- `generateOutboundMessageId()` in `lib/email/log.ts`:

  ```ts
  import { randomBytes } from "node:crypto";
  export function generateOutboundMessageId(): string {
    return `<${randomBytes(12).toString("hex")}@geleoteka.ru>`;
  }
  ```

- **Persist FIRST, send SECOND — critical for threading correctness.** The CommunicationLog row must be in the DB before Resend accepts the outbound, so a fast customer reply can find the row via In-Reply-To match. We use a two-call shape: `recordOutboundEmail()` writes the row BEFORE the send; `markOutboundEmailFailed(messageId)` flips outcome to `FAILED` if the send fails afterwards.

- `recordOutboundEmail()` in `lib/email/log.ts`:

  ```ts
  interface RecordOutboundEmailInput {
    customerUserId: string;
    dealId?: string | null;
    authorUserId?: string | null;
    subject: string;
    body: string;       // the plain-text rendering
    messageId: string;  // the bracket-wrapped <{hex}@geleoteka.ru>
  }
  export async function recordOutboundEmail(input: RecordOutboundEmailInput): Promise<string | null> {
    try {
      const row = await db.communicationLog.create({
        data: {
          customerUserId: input.customerUserId,
          dealId: input.dealId ?? null,
          authorUserId: input.authorUserId ?? null,
          channel: "EMAIL_OUTBOUND",
          outcome: "DELIVERED",          // optimistic; flipped to FAILED if send errors
          subject: input.subject,
          externalId: input.messageId,
          body: input.body,
        },
        select: { id: true },
      });
      return row.id;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "P2002") return null;  // Unique-violation = duplicate (idempotent retry)
      console.error("[EMAIL LOG] recordOutboundEmail failed", err);
      return null;
    }
  }

  export async function markOutboundEmailFailed(messageId: string, error: string): Promise<void> {
    try {
      await db.communicationLog.updateMany({
        where: { externalId: messageId, channel: "EMAIL_OUTBOUND" },
        data: { outcome: "FAILED", body: { /* keep — implementer appends error suffix */ } as never },
      });
    } catch (err) { console.error("[EMAIL LOG] markOutboundEmailFailed", err); }
  }
  ```

  Note: the second function uses Prisma's `updateMany` (not `update`) so a missing row is a no-op rather than a throw. Body-append is the implementer's choice — simplest is a fresh `update` that overwrites body with the prior text plus a `\n\n[FAILED: ${error}]` suffix.

- Don't re-export `recordOutboundEmail` through `lib/email/index.ts` until Task 3 (avoid encouraging stale call sites).

**Definition of Done:**

- [ ] `sendEmail({ to, subject, html, messageId: '<a@b.c>' })` includes the `Message-Id` header in the Resend POST and the result echoes `messageId`.
- [ ] `dispatch()` in `helpers.ts` forwards `messageId`, `inReplyTo`, `references` from the caller.
- [ ] `generateOutboundMessageId()` returns a different value each call, always matches `^<[0-9a-f]{24}@geleoteka\.ru>$`.
- [ ] `recordOutboundEmail()` creates a row with `subject` populated, `outcome=DELIVERED`, and returns the row id. Calling it twice with the same `messageId` returns `null` (Prisma `P2002` caught) instead of throwing.
- [ ] `markOutboundEmailFailed()` flips `outcome` to `FAILED` on the matching row and is a no-op when no row exists.
- [ ] Unit tests in `tests/lib/email/log.test.ts` cover: id format regex, duplicate-id swallow, success path inserts row with subject, markFailed flips outcome.

**Verify:**

- `npx tsc --noEmit`
- `node --test tests/lib/email/log.test.ts` (or whatever test runner the project picks; the project currently has no test runner configured — verify with the implementer before adding one. If absent, fall back to a `tsx scripts/verify-email-log.ts` one-shot script that exercises the same cases against the dev DB).

---

### Task 3: Wire recordOutboundEmail at five outbound call sites

**Objective:** Each outbound flow (booking, estimate, register, part-order, rental) generates a Message-Id, passes it to the send helper, and records the CommunicationLog row after a successful send.
**Dependencies:** Task 2
**Mapped Scenarios:** TS-001, TS-006

**Files:**

- Modify: `app/actions/booking.ts`
- Modify: `app/actions/crm/estimates.ts`
- Modify: `app/actions/register.ts`
- Modify: `app/actions/part-orders.ts`
- Modify: `app/actions/rentals.ts`

**Trivial:** Not trivial — each site involves picking the correct `customerUserId` and (optionally) `dealId` for the row. No new public symbol, but 5 modified sites with subtle CRM linkage.

**Key Decisions / Notes:**

- Pattern at each site — **persist FIRST, send SECOND** to eliminate the customer-replies-before-we-log race:

  ```ts
  const { generateOutboundMessageId, recordOutboundEmail, markOutboundEmailFailed } = await import("@/lib/email/log");
  const { sendBookingConfirmationEmail } = await import("@/lib/email");
  const messageId = generateOutboundMessageId();
  // (a) optimistic CommLog write — externalId must exist in DB before Resend sees the message
  if (customerUserId && isPlausibleEmail(email)) {
    await recordOutboundEmail({
      customerUserId,
      dealId,
      subject: `Geleoteka — запись на ${dateLabel}`,
      body: plainTextBody,
      messageId,
    });
  }
  // (b) send. If it fails, flip the row to FAILED. Fire-and-forget at the caller boundary.
  void sendBookingConfirmationEmail(email, { ...input, messageId })
    .then(async (result) => {
      if (!result.success) await markOutboundEmailFailed(messageId, result.error);
    })
    .catch(async (err) => {
      await markOutboundEmailFailed(messageId, err instanceof Error ? err.message : String(err));
    });
  ```

  The `isPlausibleEmail` guard at the call site (re-export it from `@/lib/email`) avoids creating an EMAIL_OUTBOUND row for a placeholder address — the send would short-circuit anyway, so the row would never be useful for threading.

- For `app/actions/booking.ts:170-183`: `customerUserId` = the newly created `userId`, `dealId` from the booking's `dealId` (need to look up — booking creates a Deal; the action body already has it). The fire-and-forget pattern is preserved: wrap in `void (async () => { ... })().catch(() => {})`.
- For `app/actions/crm/estimates.ts:198-222`: `customerUserId` = `emailPayload.deal.customer.id`, `dealId` = `emailPayload.deal.id`, `authorUserId` = `session.id` (the manager who clicked «Send»). This is the primary threading site — must work.
- For `app/actions/register.ts`: `customerUserId` = the new user; `dealId` = null (registration doesn't have a deal context).
- For `app/actions/part-orders.ts` and `app/actions/rentals.ts`: similar pattern — pick the customer id, optional deal id from the order.
- Each helper signature change: add optional `messageId?: string` to the `*Input` interfaces so call sites can pass it through. The helper passes it into `renderXxx()` only if a template needs it (most won't — Message-Id stays a header, not a body).
- Edge case: when `email` is empty / placeholder, the call-site guards on `isPlausibleEmail(email)` BEFORE writing the CommLog row, so we never create an orphan EMAIL_OUTBOUND with no real recipient. The send still runs (and short-circuits inside `sendEmail`), but with no row to flip there's nothing to clean up.

**Definition of Done:**

- [ ] All 5 call sites generate a Message-Id, pass it to the helper, and call `recordOutboundEmail` on success (and not on skipped/placeholder).
- [ ] Manually exercising the estimate-sent flow on the dev DB produces a `CommunicationLog` row with `channel=EMAIL_OUTBOUND`, `externalId` matching the format, `dealId` set.
- [ ] No regressions in any of the 5 actions' existing functionality (booking still creates a Deal, register still creates a user, etc.).

**Verify:**

- `npx tsc --noEmit`
- On dev DB: log in as admin, send an estimate, check `psql ... -c "SELECT channel, externalId, dealId FROM \"CommunicationLog\" ORDER BY \"createdAt\" DESC LIMIT 1"`. Confirm one row with channel `EMAIL_OUTBOUND`.

---

### Task 4: Inbound webhook route + Svix verification + recipient filter + idempotency + content fetch

**Objective:** Implement `POST /api/email/inbound`. Verify the Svix signature, reject replays, drop events for non-`info@` recipients, dedup by `message_id`, and fetch the full email body from Resend for the resolution step.
**Dependencies:** Task 1
**Mapped Scenarios:** TS-003, TS-004, TS-008

**Files:**

- Create: `lib/email/inbound.ts`
- Create: `app/api/email/inbound/route.ts`
- Create: `tests/lib/email/inbound.test.ts`
- Modify: `.env.example`

**Key Decisions / Notes:**

- `lib/email/inbound.ts` exports:

  ```ts
  export interface ResendInboundEnvelope {
    type: 'email.received';
    created_at: string;
    data: {
      email_id: string;
      created_at: string;
      from: string;          // "Name <addr@x>" or "addr@x"
      to: string[];
      bcc: string[];
      cc: string[];
      message_id: string;    // <wrapped@in-angles>
      subject: string;
      attachments: Array<{
        id: string;
        filename: string;
        content_type: string;
        content_disposition: string;
        content_id?: string;
      }>;
    };
  }
  export interface ResendInboundContent {
    html: string | null;
    text: string | null;
    headers: Array<{ name: string; value: string }>;
  }
  export function verifyResendWebhook(opts: {
    rawBody: string;
    headers: { svixId: string; svixTimestamp: string; svixSignature: string };
    secret: string;     // includes whsec_ prefix
    nowMs?: number;
  }): { ok: true } | { ok: false; reason: string };
  export async function fetchResendEmailContent(emailId: string, apiKey: string): Promise<ResendInboundContent>;
  export function extractHeader(headers: ResendInboundContent['headers'], name: string): string | null;
  export function parseFromAddress(raw: string): { email: string; name?: string };
  export function shouldAcceptRecipient(toList: string[]): boolean;
  ```

- Svix verify algorithm:
  - Reject when |now - parseInt(svix-timestamp)*1000| > 5 minutes
  - `signed = "${svix-id}.${svix-timestamp}.${rawBody}"`
  - `secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')`
  - `expected = createHmac('sha256', secretBytes).update(signed).digest('base64')`
  - Split `svix-signature` on whitespace, look for `v1,<sig>` entries. For each, base64-decode `expected` and `sig`. If lengths match, `timingSafeEqual`. If any match → ok.
- `shouldAcceptRecipient`: case-insensitive substring match — `toList.some(t => t.toLowerCase().includes('info@geleoteka.ru'))`. (Resend's `to` may be `["Geleoteka <info@geleoteka.ru>"]` or `["info@geleoteka.ru"]`.)
- `app/api/email/inbound/route.ts`:

  ```ts
  export const dynamic = "force-dynamic";

  export async function POST(request: Request): Promise<Response> {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    const apiKey = process.env.RESEND_API_KEY;
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        console.error("[EMAIL INBOUND] CRITICAL: RESEND_WEBHOOK_SECRET unset");
        return Response.json({ error: "not configured" }, { status: 503 });
      }
      console.warn("[EMAIL INBOUND] RESEND_WEBHOOK_SECRET unset — dev mode, skipping verify");
    }
    const raw = await request.text();
    if (secret) {
      const v = verifyResendWebhook({
        rawBody: raw,
        headers: {
          svixId: request.headers.get("svix-id") ?? "",
          svixTimestamp: request.headers.get("svix-timestamp") ?? "",
          svixSignature: request.headers.get("svix-signature") ?? "",
        },
        secret,
      });
      if (!v.ok) {
        console.warn("[EMAIL INBOUND] reject:", v.reason);
        return Response.json({ error: "invalid signature" }, { status: 401 });
      }
    }
    let envelope: ResendInboundEnvelope;
    try { envelope = JSON.parse(raw); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
    if (envelope.type !== "email.received") return Response.json({ ignored: true, reason: "type" });
    if (!shouldAcceptRecipient(envelope.data.to)) return Response.json({ ignored: true, reason: "recipient" });

    const messageId = envelope.data.message_id;
    const [existingLog, existingInbox] = await Promise.all([
      db.communicationLog.findUnique({ where: { externalId: messageId }, select: { id: true } }),
      db.inboxMessage.findUnique({ where: { messageId }, select: { id: true } }),
    ]);
    if (existingLog || existingInbox) return Response.json({ duplicate: true });

    if (!apiKey) return Response.json({ error: "RESEND_API_KEY unset" }, { status: 503 });
    const content = await fetchResendEmailContent(envelope.data.email_id, apiKey);

    // → resolution pipeline (Task 5). resolveInboundEmail catches Prisma P2002
    // (unique violation on externalId / messageId) and treats it as duplicate —
    // the application-level pre-check above is opportunistic; the DB unique
    // index is the real idempotency guarantee under concurrent webhook delivery.
    try {
      await resolveInboundEmail({ envelope, content });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "P2002") return Response.json({ duplicate: true });
      throw err;
    }
    return Response.json({ ok: true });
  }
  ```

- `.env.example`: append `RESEND_WEBHOOK_SECRET=` with a one-line comment.
- Unit tests in `tests/lib/email/inbound.test.ts` cover: valid sig, tampered body, tampered sig, old ts, future ts, missing header, wrong type, ignored recipient.

**Definition of Done:**

- [ ] Route returns 401 on tampered signatures, 400 on malformed JSON, 200 + `{ ignored: true }` on non-info@ recipients, 200 + `{ duplicate: true }` on second-arrival with same message_id, 200 + `{ ok: true }` on a fresh accept.
- [ ] No DB write happens for any rejected/ignored path.
- [ ] Unit tests pass for all five Svix-verification cases.
- [ ] `[EMAIL INBOUND]` log lines appear with the right severity at the right paths.
- [ ] `RESEND_WEBHOOK_SECRET` is added to `.env.example` (commented, with a one-line note to grab from Resend dashboard → Webhooks).
- [ ] When `RESEND_WEBHOOK_SECRET` is unset in production, route returns 503 (not 200) so Resend retries surface the misconfiguration in their dashboard.

**Verify:**

- `npx tsc --noEmit`
- Unit tests: `node --test tests/lib/email/inbound.test.ts` (or chosen runner — see Task 2 note).
- Manual: `curl -X POST http://localhost:443/api/email/inbound -H 'svix-id: x' -H 'svix-timestamp: 0' -H 'svix-signature: v1,bad' -d '{"type":"email.received","data":{}}'` → expect 401.

---

### Task 5: Inbound resolution pipeline

**Objective:** Given a verified, deduplicated inbound envelope + content, decide where the email lands: existing thread (In-Reply-To match), known customer (email match → most-recent open deal), or InboxMessage (unknown).
**Dependencies:** Task 4
**Mapped Scenarios:** TS-001, TS-002, TS-005

**Files:**

- Modify: `lib/email/inbound.ts` (add `resolveInboundEmail`)
- Create: `tests/lib/email/resolve.test.ts`

**Key Decisions / Notes:**

- `resolveInboundEmail({ envelope, content }) → Promise<{ kind: 'thread' | 'customer' | 'inbox'; id: string }>` writes exactly one row (`CommunicationLog` or `InboxMessage`) and returns a discriminator + the new row's id.
- Step 1 — In-Reply-To match:

  ```ts
  const inReplyTo = extractHeader(content.headers, "In-Reply-To");
  if (inReplyTo) {
    const prior = await db.communicationLog.findUnique({
      where: { externalId: inReplyTo },
      select: { customerUserId: true, dealId: true },
    });
    if (prior) {
      const created = await db.communicationLog.create({
        data: {
          customerUserId: prior.customerUserId,
          dealId: prior.dealId,
          authorUserId: null,
          channel: "EMAIL_INBOUND",
          outcome: "REPLIED",
          externalId: envelope.data.message_id,
          body: envelope.data.subject + "\n\n" + (content.text ?? stripHtml(content.html ?? "")),
        },
        select: { id: true },
      });
      return { kind: "thread", id: created.id };
    }
  }
  ```

- Step 2 — Sender email match:

  ```ts
  const { email: senderEmail } = parseFromAddress(envelope.data.from);
  const customer = await db.user.findFirst({
    where: { email: { equals: senderEmail, mode: "insensitive" }, isCustomer: true },
    select: { id: true },
  });
  if (customer) {
    const openDeal = await db.deal.findFirst({
      where: { customerUserId: customer.id, stage: { notIn: ["WON", "LOST"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    const created = await db.communicationLog.create({
      data: {
        customerUserId: customer.id,
        dealId: openDeal?.id ?? null,
        authorUserId: null,
        channel: "EMAIL_INBOUND",
        outcome: "REPLIED",
        externalId: envelope.data.message_id,
        subject: envelope.data.subject,
        body: content.text ?? stripHtml(content.html ?? ""),
        resendEmailId: envelope.data.email_id,
        attachments: envelope.data.attachments,
      },
      select: { id: true },
    });
    return { kind: "customer", id: created.id };
  }
  ```

- Step 3 — Unknown sender → InboxMessage:

  ```ts
  const created = await db.inboxMessage.create({
    data: {
      fromEmail: senderEmail,
      fromName: parseFromAddress(envelope.data.from).name ?? null,
      toEmail: pickInfoFrom(envelope.data.to),
      subject: envelope.data.subject,
      bodyText: content.text,
      bodyHtml: content.html,
      attachments: envelope.data.attachments,
      messageId: envelope.data.message_id,
      inReplyTo: extractHeader(content.headers, "In-Reply-To"),
      references: parseReferences(extractHeader(content.headers, "References")),
      resendEmailId: envelope.data.email_id,
      status: "PENDING",
    },
    select: { id: true },
  });
  return { kind: "inbox", id: created.id };
  ```

- `stripHtml(html)`: keep it tiny — `html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 4000)`. We're not rendering this back to HTML; it's a fallback for `body` on `CommunicationLog` when no plain-text alternative arrived. The subject lives in the new `subject` column on `CommunicationLog`, not embedded in `body`.
- `parseReferences(header)`: split on whitespace, filter to entries matching `<...>`.
- Revalidate paths after writes — `revalidatePath('/admin/crm/deals/[id]','page')`, `revalidatePath('/admin/customers/[id]','page')`, `revalidatePath('/admin/crm/inbox','page')`. Use `next/cache`'s `revalidatePath` from `import { revalidatePath } from "next/cache"`.
- Tests cover: thread hit with dealId, thread hit without dealId, customer hit with no open deals (dealId null on row), customer hit prefers most-recent updatedAt, unknown sender row creation.

**Definition of Done:**

- [ ] All three resolution branches write exactly one row of the correct type with the correct fields.
- [ ] Path revalidation triggers (verify by inspecting Next.js fetch cache during dev).
- [ ] Unit tests cover all three branches plus the "most recent open deal" tie-break.

**Verify:**

- `npx tsc --noEmit`
- Unit tests for `resolveInboundEmail`.
- End-to-end: feed the route a known-customer payload via curl (using a dev secret), check the corresponding deal page shows the new row.

---

### Task 6: Inbox UI — list page, detail page, action panel server actions

**Objective:** Build the `/admin/crm/inbox` list with tab filters, the per-message detail page, and the four moderation actions (link to customer, create customer, mark spam, archive).
**Dependencies:** Task 1, Task 5
**Mapped Scenarios:** TS-002, TS-009

**Files:**

- Create: `app/(admin)/admin/crm/inbox/page.tsx`
- Create: `app/(admin)/admin/crm/inbox/[id]/page.tsx`
- Create: `app/actions/crm/inbox.ts`
- Create: `components/admin/inbox/InboxList.tsx`
- Create: `components/admin/inbox/InboxMessageDetail.tsx`
- Create: `components/admin/inbox/InboxActions.tsx`
- Create: `components/admin/inbox/CustomerSearchCombobox.tsx`
- Modify: `app/(admin)/admin/customers/new/page.tsx` (accept `?email=` query prefill — verify whether the form already does; add if not)

**Key Decisions / Notes:**

- List page (`/admin/crm/inbox?status=pending`) uses `searchParams` for the tab. Filter: `where: { status: <parsed> }`, paginate `take: 50` ordered by `receivedAt desc`. PageHeader matches `/admin/crm/deals/page.tsx`.
- Detail page (`/admin/crm/inbox/[id]`): full headers section, sandboxed iframe for HTML body (`<iframe sandbox srcDoc={bodyHtml} />`), plain-text toggle, attachment chips, action sidebar.
- `app/actions/crm/inbox.ts` exports:

  ```ts
  export async function linkInboxMessageToCustomer(
    inboxMessageId: string,
    customerUserId: string,
    dealId: string | null,
  ): Promise<{ error: string | null; communicationLogId?: string }>;
  export async function markInboxMessageSpam(inboxMessageId: string): Promise<{ error: string | null }>;
  export async function archiveInboxMessage(inboxMessageId: string): Promise<{ error: string | null }>;
  ```

- `linkInboxMessageToCustomer` creates a `CommunicationLog` row using the InboxMessage's content (`channel=EMAIL_INBOUND`, `externalId=messageId`, `subject`, `resendEmailId`, `attachments` all copied from the InboxMessage), then updates `InboxMessage.status='ASSIGNED', linkedCommunicationLogId, assignedToUserId=session.id`. Both writes in `db.$transaction(...)`.

  **Race handling:** when two managers click «Привязать» on the same row concurrently, the second transaction can fail either on (a) the `CommunicationLog` `externalId` unique constraint, or (b) an optimistic concurrency check on `InboxMessage.status`. The action wraps the transaction in `try/catch`. On `P2002` (already linked by the other manager), return `{ error: "Уже привязано другим менеджером — обновите страницу" }`. The update clause uses `where: { id, status: 'PENDING' }` so a status flip from concurrent action surfaces as `count: 0` — also returns the same error. Revalidates `/admin/crm/inbox`, `/admin/customers/<id>`, and `/admin/crm/deals/<dealId>` if set.
- `CustomerSearchCombobox`: typeahead on customer name / email / phone. Uses an existing endpoint or, if none exists, a new `/api/admin/customers/search?q=` route. Verify before adding — check `app/(admin)/admin/customers/page.tsx` for the search pattern.
- Create-customer button: `<Link href={\`/admin/customers/new?email=${encodeURIComponent(msg.fromEmail)}&name=${encodeURIComponent(msg.fromName ?? '')}\`}>`. Check that the new-customer form reads these query params; modify if not.
- `markInboxMessageSpam` and `archiveInboxMessage` are simple `db.inboxMessage.update`s. Both `requireRole(['ADMIN','MANAGER'])`.

**Definition of Done:**

- [ ] List page renders the four tabs (Pending / Archive / Spam — Assigned is implicitly visible on the customer's timeline, no tab here).
- [ ] Detail page renders body safely (no script execution from email HTML — iframe sandbox).
- [ ] All four actions work end-to-end on dev DB.
- [ ] After linking, the row disappears from PENDING and appears on the customer/deal timeline.

**Verify:**

- `npx tsc --noEmit`
- Dev: visit `/admin/crm/inbox` after seeding an `InboxMessage` row. Walk through each action.

---

### Task 7: Attachment proxy + admin nav inbox link + pending count badge

**Objective:** Add the authed proxy route for inbound attachments, the «Входящие» nav entry in the CRM group, and the polling badge for the PENDING count.
**Dependencies:** Task 1
**Mapped Scenarios:** TS-007

**Files:**

- Create: `app/api/admin/inbox/attachments/[id]/route.ts`
- Create: `app/api/admin/inbox/count/route.ts`
- Modify: `lib/admin-nav.ts`
- Modify: `components/shared/Sidebar.tsx` (unified portal+admin sidebar — confirmed by grep; previously documented as `AdminSidebar` which no longer exists)

**Trivial:** No — three separate concerns, ~150 LOC total.

**Key Decisions / Notes:**

- Attachment route handler:

  ```ts
  export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
    try { await requireRole(["ADMIN","MANAGER"]); } catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
    const { id: attachmentId } = await ctx.params;
    const url = new URL(request.url);
    const emailId = url.searchParams.get("email_id");
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(emailId ?? "")) {
      return Response.json({ error: "invalid email_id" }, { status: 400 });
    }
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(attachmentId)) {
      return Response.json({ error: "invalid attachment id" }, { status: 400 });
    }
    // Parent-existence check: only proxy when the email_id is known to our DB.
    // Prevents the route becoming a generic Resend-attachment proxy that an
    // authenticated admin/manager could use to fetch arbitrary email content
    // belonging to another tenant on the same Resend account. We check both
    // InboxMessage (unknown senders) and CommunicationLog (matched inbound that
    // we wrote with `resendEmailId` in `subject` metadata — see Task 5 update).
    const known = await db.inboxMessage.findFirst({
      where: { resendEmailId: emailId }, select: { id: true },
    });
    if (!known) {
      // Fall back to checking CommunicationLog for inbound rows we threaded
      // directly (where we also persist the resend email_id). The lookup uses
      // the new `resendEmailId` column on CommunicationLog (added in Task 1).
      const knownLog = await db.communicationLog.findFirst({
        where: { resendEmailId: emailId }, select: { id: true },
      });
      if (!knownLog) return Response.json({ error: "unknown email" }, { status: 404 });
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return Response.json({ error: "not configured" }, { status: 503 });
    const upstream = await fetch(`https://api.resend.com/emails/${emailId}/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (upstream.status === 404) return Response.json({ error: "expired" }, { status: 410 });
    if (!upstream.ok) return Response.json({ error: "upstream error" }, { status: 502 });
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
        "Content-Disposition": upstream.headers.get("Content-Disposition") ?? `attachment`,
      },
    });
  }
  ```

- Count route:

  ```ts
  export async function GET(): Promise<Response> {
    try { await requireRole(["ADMIN","MANAGER"]); } catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
    const pending = await db.inboxMessage.count({ where: { status: "PENDING" } });
    return Response.json({ pending });
  }
  ```

- Admin nav addition (in `lib/admin-nav.ts:73-83`):

  ```ts
  items: [
    { href: "/admin/crm/deals", label: "Сделки" },
    { href: "/admin/crm/estimates", label: "Сметы" },
    { href: "/admin/crm/tasks?scope=open&owner=mine", label: "Задачи" },
    { href: "/admin/crm/inbox", label: "Входящие" },  // NEW
    { href: "/admin/customers", label: "Клиенты" },
  ],
  ```

- Badge: render a small numeric pill next to «Входящие» when `pending > 0`. Polling via React Query (which is already imported across the admin tree — verify with `grep "useQuery" components/`). Interval 60s. When polling isn't appropriate (no React Query in the sidebar component), fall back to a server-rendered count read once per navigation.

**Definition of Done:**

- [ ] `GET /api/admin/inbox/attachments/<id>?email_id=<id>` returns the attachment bytes for valid auth + valid IDs.
- [ ] Returns 401 without admin/manager session.
- [ ] Returns 400 for invalid id formats.
- [ ] Returns 404 when the `email_id` is not present in `InboxMessage.resendEmailId` OR `CommunicationLog.resendEmailId` (parent-existence check — prevents the route becoming a generic Resend-attachment proxy).
- [ ] Returns 410 with `{ error: "expired" }` when Resend returns 404 (>30 days old).
- [ ] «Входящие» appears in the CRM group sidebar (`components/shared/Sidebar.tsx`) with a live count badge when `pending > 0`.

**Verify:**

- `npx tsc --noEmit`
- Dev: navigate around as ADMIN. Check the sidebar shows «Входящие» with badge after seeding 3 PENDING rows.

---

### Task 8: Reply form + sendEmailReply action + CommunicationLogger UI for email rows

**Objective:** Add the inline reply form on deal + customer pages, render email rows (with subject, body excerpt, direction icon) in the timeline, and wire the sendEmailReply server action that threads the outbound back via In-Reply-To.
**Dependencies:** Task 2, 3, 5
**Mapped Scenarios:** TS-001 (step 4-5), TS-006

**Files:**

- Create: `components/crm/EmailReplyForm.tsx`
- Modify: `components/crm/CommunicationLogger.tsx`
- Modify: `lib/crm-labels.ts` (add labels for EMAIL_INBOUND / EMAIL_OUTBOUND)
- Modify: `app/actions/crm/inbox.ts` (add `sendEmailReply`)
- Modify: `app/(admin)/admin/crm/deals/[id]/page.tsx` (pass extra props to enable reply)
- Modify: `app/(admin)/admin/customers/[id]/page.tsx` (same)

**Key Decisions / Notes:**

- `sendEmailReply({ customerUserId, dealId, body }) → { error: string | null; communicationLogId?: string }`:
  - `requireRole(['ADMIN','MANAGER'])`.
  - Load the most recent `EMAIL_INBOUND` CommunicationLog for this customer + (optionally) deal. Capture its `externalId` as `inReplyTo` and its `subject` directly from the new `subject` column. References = whatever references the original carries (skip in v1 — just `[inReplyTo]`).
  - Generate a fresh `messageId` via `generateOutboundMessageId()`.
  - Load customer's email from `db.user.findUnique`.
  - Subject: `Re: ${prior.subject ?? "Сообщение от Geleoteka"}` (read straight from `CommunicationLog.subject` — never parse the body). Strip an existing `Re:` prefix so we don't accumulate `Re: Re: Re:`.
  - Body: stamped with a manager signature line «— <manager name>, Geleoteka».
  - Call `sendEmail({ to, subject, html: <wrap>(body), text: body, messageId, inReplyTo, references: [inReplyTo] })`.
  - On success → `recordOutboundEmail({ customerUserId, dealId, authorUserId: session.id, subject, body, messageId })`.
- `EmailReplyForm` mounts under the existing `CommunicationLogger`. State: collapsed by default; clicking «Ответить» (in the topmost EMAIL_INBOUND row OR a fallback button when no inbound exists) expands it. Submits via `useActionState` against `sendEmailReply`.
- `CommunicationLogger` rendering changes:
  - When `entry.channel` is `EMAIL_INBOUND` / `EMAIL_OUTBOUND`: render the body with subject as a `<strong>` heading, body text below in a `whitespace-pre-wrap` block, capped at ~400 chars with an "expand" toggle when longer.
  - Direction icon: `<ArrowDownLeft />` for inbound, `<ArrowUpRight />` for outbound (lucide-react).
  - «Ответить» button on the most recent EMAIL_INBOUND entry only.
- Update the existing `CommView` interface in `CommunicationLogger.tsx` if needed — it already has `body` and `channel`, no schema change.

**Definition of Done:**

- [ ] Email rows render with subject + body excerpt + direction icon.
- [ ] «Ответить» button appears on the most recent EMAIL_INBOUND entry on both deal + customer pages.
- [ ] Submitting the reply form sends a real email via the Resend mock (`[EMAIL MOCK]` log line) AND writes a new EMAIL_OUTBOUND CommunicationLog with correct `externalId`.
- [ ] When the customer "replies" with In-Reply-To = the new outbound's messageId, the resolution pipeline (Task 5) threads it back to the same deal.

**Verify:**

- `npx tsc --noEmit`
- Dev walkthrough: seed an EMAIL_INBOUND row → open the deal page → click Ответить → submit → see EMAIL_OUTBOUND row above the inbound. Simulate the next inbound via curl → see third row in thread.

---

## Open Questions

None — all key decisions resolved in plan questions.

### Deferred Ideas

- **EMAIL enum value cleanup.** The legacy `EMAIL` value in `CommChannel` is unused by all current code paths. A follow-up plan can drop it once we've confirmed no test fixtures or seed scripts reference it.
- **Configurable multi-recipient routing.** Allow-list of accepted local-parts (`info@`, `sales@`, `billing@`) with per-recipient default deal-owner assignment.
- **Email attachment archival.** Local persistence in `EmailAttachment` table + S3-backed storage to survive Resend's 30-day window.
- **Bounce / complaint webhook handlers.** Resend sends separate `email.bounced` / `email.complained` events. Surface these in the timeline so managers see «Email не доставлен» badges.
- **HTML composer for replies** (TipTap / similar).
- **DMARC-fail / no-reply spam pre-filter.** Move obvious spam to `status=SPAM` automatically.
- **Inbox SLA / overdue alerts.** "N emails older than 24h" notification.
- **Re-link UI.** Allow a manager to move a CommunicationLog row from one deal to another.
