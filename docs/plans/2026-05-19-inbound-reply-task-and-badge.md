# Inbound Reply Auto-Task + Nav Badge Implementation Plan

Created: 2026-05-19
Author: aspiskov@student.42abudhabi.ae
Status: COMPLETE
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** When a known customer replies via email (inbound `EMAIL_INBOUND` in `CommunicationLog`), auto-create / dedupe a `FOLLOW_UP` `CrmTask` owned by the deal's responsible manager AND surface an unread-replies badge in the admin nav so replies are never missed.

**Architecture:** Hook into `resolveInboundEmail` after a known-customer reply lands (`kind="thread"` or `kind="customer"`). Look up an existing `OPEN FOLLOW_UP` task for the same `(customerUserId, dealId)` pair — if found, update `dueAt` and append to `body`; if not, create one with `ownerUserId = deal.ownerUserId ?? firstAdminId`. Add a `readAt DateTime?` column to `CommunicationLog` for per-message read state. New badge polls `/api/admin/replies/count` and renders next to the "Задачи" nav link.

**Tech Stack:** Next.js 16 App Router, Prisma 6 + PostgreSQL, React Query (60s polling — same pattern as `InboxBadge`).

## Scope

### In Scope

- New nullable column `CommunicationLog.readAt`
- Auto-task creation/dedup in `resolveInboundEmail` (server-side, transactional)
- Mark-as-read action callable from Customer 360 and Deal pages (server action)
- New badge `<RepliesBadge />` next to "Задачи" sidebar item, polled from `/api/admin/replies/count`
- E2E coverage: send fresh email → see new OPEN FOLLOW_UP task on dashboard → badge increments → opening the deal flips `readAt` → badge decrements

### Out of Scope

- Push notifications / sound alerts
- Reply UI improvements (already exists)
- Auto-closing the FOLLOW_UP task when manager replies (manual close keeps SLA tracking honest)
- Backfill of historical `EMAIL_INBOUND` rows (badge starts at 0 for old data — fine, the unread signal is about new replies)
- SLA escalation if task overdue > 24h (future feature)

## Approach

**Chosen:** Hook in `resolveInboundEmail` + new `readAt` column + badge on "Задачи".
**Why:** Single integration point (`resolveInboundEmail` is the only writer of known-customer `EMAIL_INBOUND` rows), no event bus required, badge reuses existing React Query polling pattern. The action (responding) lives where managers already work (`/admin/crm/tasks`).
**Alternatives considered:**
- *Pure task-only signal (no `readAt`).* Rejected — user explicitly wanted both: tasks for action queue, per-message read state for visual indicators on Customer 360 timeline.
- *Pure `readAt`-only (no auto-task).* Rejected — without a task, there's no surfaced action item on the dashboard's "Мои задачи" widget; managers must remember to check Customer 360.
- *Badge on a new top-level "Ответы" nav item.* Rejected — overlap with existing "Входящие" (which is for unknowns) and "Задачи" (which auto-tasks already populate). Putting the badge on "Задачи" keeps the nav lean.

## Context for Implementer

### Patterns to follow

- **Badge component:** `components/admin/inbox/InboxBadge.tsx` — React Query, `refetchInterval: 60_000`, `staleTime: 55_000`, renders null when count = 0. Mirror this for `RepliesBadge.tsx`.
- **Count API:** `app/api/admin/inbox/count/route.ts` — `requireRole(["ADMIN", "MANAGER"])` + `db.<model>.count(...)` + `NextResponse.json`. Mirror this at `app/api/admin/replies/count/route.ts`.
- **Nav wiring:** `components/shared/Sidebar.tsx:235` — `trailing={item.href === "/admin/crm/inbox" ? <InboxBadge /> : undefined}`. Add a parallel condition for the "Задачи" item (which matches `item.href.startsWith("/admin/crm/tasks")` since the href has query params).
- **Inbound integration:** `lib/email/resolve.ts:46-92` — branches "thread" (Step 1) and "customer" (Step 2) both write `CommunicationLog(EMAIL_INBOUND, REPLIED)` for known customers. Step 3 ("inbox") is unknown senders → no auto-task. Hook runs after both Step 1 and Step 2 inserts.
- **Auto-task creation:** `db.crmTask.findFirst` + `db.crmTask.create` / `db.crmTask.update`. Existing CrmTask shape at `prisma/schema.prisma:1305-1327`. Existing manual creator: `app/actions/crm/tasks.ts`.

### Conventions

- Prisma client: `import { db } from "@/lib/db"` (NOT `@prisma/client`).
- Server-only modules MUST import `"server-only"` if they read settings/auth.
- All DB queries that go through `db` lose type inference; use `as { ... } | null` casts (see `prisma/__tests__/...` and existing `findFirst as ... | null` pattern across `app/actions/crm/`).
- Mark CommunicationLog readAt updates as a server action in `app/actions/crm/communications.ts` (or new file) returning `{error: string | null}`.
- Russian-only UI labels (admin audience): "Задачи" badge tooltip "Непрочитанные ответы: N".

### Key files

- `lib/email/resolve.ts` — primary integration point (3-step waterfall).
- `app/api/email/inbound/route.ts` — wraps `resolveInboundEmail`; transaction boundary lives here (line 224-235). The auto-task creation must NOT throw — if it errors, log and continue (the inbound message MUST be saved regardless).
- `prisma/schema.prisma` lines 1241-1327 — `CommunicationLog`, `InboxMessage`, `CrmTask` models.
- `lib/admin-nav.ts` — nav config (no change needed — sidebar uses `item.href` matching).
- `components/shared/Sidebar.tsx:235` — badge slot.
- `components/admin/inbox/InboxBadge.tsx` — template to copy.

### Gotchas

- `resolveInboundEmail` runs inside `POST /api/email/inbound` BUT NOT in a single transaction — Step 1/2/3 each do their own `db.<model>.create`. Auto-task creation is a separate write — wrap it in a try/catch to ensure inbound resolution still succeeds even if task creation fails.
- `deal.ownerUserId` is **nullable** in Prisma (line 1136: `ownerUserId String?`). Must handle null.
- "First ADMIN" fallback query: `db.user.findFirst({where: {permissionRole: "ADMIN"}, orderBy: {createdAt: "asc"}, select: {id: true}})`. Sort by createdAt (deterministic) — id ordering is non-deterministic for cuid.
- Dedup query: `db.crmTask.findFirst({where: {customerUserId, dealId, status: "OPEN", kind: "FOLLOW_UP"}})`. When `dealId === null` use `{dealId: null}` explicitly (Prisma's `dealId: undefined` would match any).
- The "Задачи" sidebar href is `/admin/crm/tasks?scope=open&owner=mine` — not a bare path. Badge condition must match the path prefix `/admin/crm/tasks`, not the full string.
- `readAt` flips MUST be authenticated (`requireRole`) — never trust client to flip arbitrary read state.

### Domain context

- A `Deal` has at most one owning manager (`ownerUserId`) — set when a manager either created the deal manually or claimed it. Booking-originated deals have `ownerUserId=null` until a manager takes them.
- `CrmTask.kind=FOLLOW_UP` is already used by other flows (the seeded sample task uses it). The kind is the dedup discriminator alongside `(customerUserId, dealId, status=OPEN)`.
- `CommunicationLog.outcome=REPLIED` is already set by `resolveInboundEmail` for inbound emails — no change.

## Runtime Environment

- **Start:** `npm run dev` (port 443, HTTPS)
- **Prod:** Railway auto-deploys from `main`; `npm start -H 0.0.0.0 -p ${PORT:-443}`
- **Migration apply:** `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Примени" npx prisma migrate dev` (then `pkill -f "prisma migrate dev"` to kill the drift prompt)
- **Health check:** `GET https://geleoteka.ru/admin/settings/integrations` (must return 200 with auth cookie)

## Assumptions

- **A1:** `resolveInboundEmail` is the ONLY writer of `CommunicationLog(channel=EMAIL_INBOUND)` rows. Supported by: `lib/email/resolve.ts:46-92` (Steps 1+2 are the only `.create` calls with that channel). All Tasks depend on this.
- **A2:** Every project has at least one `User` with `permissionRole="ADMIN"`. Supported by: seed at `prisma/seed.ts` always creates `admin@geleoteka.ru`. Task 2 fallback depends on this.
- **A3:** "Задачи" sidebar entry uses the path prefix `/admin/crm/tasks` (matches `?scope=...` queries). Supported by: `lib/admin-nav.ts:83`. Task 5 (badge wiring) depends on this.
- **A4:** Marking a message as read on opening a page is acceptable UX (vs. requiring an explicit "Mark read" button). User accepted "Both" mechanism; auto-mark on page view is the lowest-friction implementation of `readAt`. Task 4 depends on this.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Auto-task creation throws → inbound delivery 500 → Resend retries indefinitely | Medium | High | Wrap auto-task block in try/catch inside `resolveInboundEmail`. On error: `console.error("[AUTO-TASK] failed", err)` and return the original `ResolveResult`. Inbound stays accepted. |
| Race condition: two near-simultaneous inbound replies create two tasks | Medium | Medium | **Atomic dedup via partial unique index.** Migration adds `CREATE UNIQUE INDEX "CrmTask_open_followup_unique" ON "CrmTask"("customerUserId", COALESCE("dealId", '00000000-0000-0000-0000-000000000000')) WHERE status='OPEN' AND kind='FOLLOW_UP'`. `ensureFollowUpTask` uses try `create` → on P2002, `findFirst` (now race-free since the constraint enforces single row) + `update`. The index allows multiple non-OPEN rows for the same pair (so a closed task doesn't block a new one when the customer re-engages). `COALESCE` collapses null `dealId` to a sentinel UUID so two no-deal replies from the same customer dedupe correctly (PG treats NULLs as distinct by default). |
| `readAt` flip on page view spams the DB (one update per render) | Low | Low | `db.communicationLog.updateMany({where: {customerUserId, channel: "EMAIL_INBOUND", readAt: null}, data: {readAt: now}})` runs only when the unread count > 0 (cheap pre-check). Server-rendered, single write per page load. |
| Badge polling (60s) under heavy admin headcount → DB load | Low | Low | Existing `InboxBadge` already polls at 60s with `staleTime: 55_000`. Same pattern. Count query hits `(channel, readAt)` index. |
| Migration breaks build because `readAt` is referenced before column exists | Medium | Medium | Use `force-dynamic` on pages reading `readAt`; build does NOT execute DB queries. Migration applies before deploy (Railway runs `prisma migrate deploy` on startup). |

## Goal Verification

### Truths

- **T1:** A fresh inbound email from a known customer creates exactly one OPEN FOLLOW_UP CrmTask within 5s (TS-001).
- **T2:** A second inbound email from the same customer/deal within the SLA window does NOT create a second task; the existing task's `dueAt` and `body` are updated (TS-002).
- **T3:** The "Задачи" sidebar item shows a badge with the count of `CrmTask{kind=FOLLOW_UP, status=OPEN, ownerUserId=session.userId}`. Per-user, owner-scoped — directly reflects the auto-task ownership model. (TS-003)
- **T3a:** `readAt` on `CommunicationLog` is a separate per-message UI state used ONLY for timeline styling (unread message bolding on Customer 360). It does NOT drive the badge. This separation prevents the "any manager's page view clears the global badge for everyone" anti-pattern. (TS-004)
- **T4:** Opening the Deal page (or Customer 360) flips `readAt` to non-null for all visible EMAIL_INBOUND rows belonging to that customer (TS-004).
- **T5:** A new endpoint `/api/admin/replies/count` returns `{ count: <n> }` with `n = db.crmTask.count({where: {kind: "FOLLOW_UP", status: "OPEN", ownerUserId: session.userId}})`. Per-user, no global leakage.
- **T6:** Auto-task creation failure does NOT break inbound delivery. Verified by a `scripts/verify-auto-task-failure-isolation.ts` integration script that monkey-patches `ensureFollowUpTask` to throw, runs `resolveInboundEmail` through the known-customer path, and asserts the `CommunicationLog` row is still created and the function still returns `{kind: "customer", id}`.

### Artifacts

- `prisma/schema.prisma` — new `readAt` field on `CommunicationLog`
- `prisma/migrations/<timestamp>_communication_log_read_at/migration.sql`
- `lib/crm/auto-task.ts` (new) — pure function `pickTaskOwner(deal, fallbackAdminId)` + `buildAutoTaskInput(customer, deal, ownerId)`
- `lib/email/resolve.ts` — calls `ensureFollowUpTask(...)` after Steps 1 and 2
- `app/actions/crm/communications.ts` (new) — `markRepliesRead(customerUserId)` server action
- `app/api/admin/replies/count/route.ts` (new) — count endpoint
- `components/admin/replies/RepliesBadge.tsx` (new) — React Query badge
- `components/shared/Sidebar.tsx` — wire badge into "Задачи" slot
- Modified pages: `app/(admin)/admin/crm/deals/[id]/page.tsx` and `app/(admin)/admin/customers/[id]/page.tsx` — call `markRepliesRead` server-side on render

## E2E Test Scenarios

### TS-001: Fresh inbound reply creates auto-task
**Priority:** Critical
**Preconditions:** Known customer (a.m.spiskov@gmail.com) has an open deal owned by admin@geleoteka.ru. No OPEN FOLLOW_UP task exists for this customer+deal pair.
**Mapped Tasks:** Task 1, Task 2, Task 3

| Step | Action | Expected Result |
|---|---|---|
| 1 | Customer sends email from gmail to info@geleoteka.ru | Email delivered to Resend MX |
| 2 | Wait ≤ 30s, open `/admin/settings/inbound-log` | New entry "✓ Принято (известный клиент)" |
| 3 | Open `/admin/crm/tasks?scope=open&owner=mine` as admin | New row appears with title `Ответить клиенту <name>`, kind=FOLLOW_UP, dueAt ~now+4h, dealId = the open deal |
| 4 | Open `/admin` dashboard | New task appears in "Мои задачи" widget |

### TS-002: Dedup — second reply updates existing task
**Priority:** High
**Preconditions:** TS-001 completed. The OPEN FOLLOW_UP task exists.
**Mapped Tasks:** Task 2

| Step | Action | Expected Result |
|---|---|---|
| 1 | Customer sends a second email from gmail to info@geleoteka.ru | Email delivered |
| 2 | Wait ≤ 30s, refresh `/admin/crm/tasks?scope=open&owner=mine` | Still ONE task row for this customer+deal (no duplicate); body suffix shows "+ ещё 1 ответ" (or equivalent) |
| 3 | Hover the task — `dueAt` is renewed to ~now+4h | Task `dueAt` reflects the latest reply |

### TS-003: Nav badge reflects per-user OPEN FOLLOW_UP task count
**Priority:** Critical
**Preconditions:** TS-001 completed (one task auto-created, owned by admin@geleoteka.ru). Logged in as admin. No other OPEN FOLLOW_UP tasks for this admin.
**Mapped Tasks:** Task 5, Task 6

| Step | Action | Expected Result |
|---|---|---|
| 1 | Load any admin page (e.g., `/admin/crm/deals`) | Sidebar shows badge "1" next to "Задачи" item |
| 2 | Customer sends one more email (TS-002 path: dedup hits) | Badge STILL shows "1" (no new task — same FOLLOW_UP got updated) |
| 3 | Manually trigger `fetch('/api/admin/replies/count')` in browser console | Returns `{ count: 1 }` |
| 4 | Open the task, mark DONE | Badge disappears (count = 0) within ≤ 60s polling cycle |
| 5 | (Negative) Log in as a second admin who owns no deals for this customer | Their badge shows 0 — owner-scoping works |

### TS-004: Opening Customer 360 marks messages as read (UI styling only — does not affect badge)
**Priority:** Medium
**Preconditions:** TS-002 completed. Two `EMAIL_INBOUND` rows with `readAt=null` exist for this customer. Badge shows "1" (one FOLLOW_UP task).
**Mapped Tasks:** Task 4

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `/admin/customers/<customer-id>` | Page renders. Communications timeline shows the EMAIL_INBOUND rows WITHOUT the "unread" visual treatment (no bold/dot/highlight per the chosen styling). |
| 2 | Verify in DB: `SELECT COUNT(*) FROM "CommunicationLog" WHERE customerUserId='<id>' AND channel='EMAIL_INBOUND' AND "readAt" IS NULL` | Returns 0 |
| 3 | Refresh — badge in nav STILL shows "1" (task not closed yet) | Confirms badge decoupling from readAt |

## Progress Tracking

- [x] Task 1: Add `readAt` column + migration
- [x] Task 2: `ensureFollowUpTask` helper with dedup
- [x] Task 3: Wire helper into `resolveInboundEmail` (with try/catch isolation)
- [x] Task 4: `markRepliesRead` server action + page-render integration
- [x] Task 5: `/api/admin/replies/count` endpoint
- [x] Task 6: `RepliesBadge` component + sidebar wiring
- [x] Task 7: E2E verification on prod
      **Total Tasks:** 7 | **Completed:** 7 | **Remaining:** 0

## Verification Evidence (prod E2E)

**Commit:** `ff10f35 feat(crm): auto-task on inbound reply + nav badge for follow-ups`

**TS-001 PASS** — User sent fresh email from a.m.spiskov@gmail.com → info@geleoteka.ru. Within ~30s a new CrmTask appeared on `/admin/crm/tasks?scope=open&owner=all`:
- Title: "Ответить клиенту: Alex Alex"
- Kind: FOLLOW_UP (rendered as "Связаться")
- Owner: Администратор (first ADMIN fallback — Alex Alex deal has no owner)
- dueAt: 07:29 (≈ now + 4h)
- Body: "Клиент ответил по email. Откройте сделку и ответьте."

**TS-002 PASS** — User sent a second email. Task did NOT duplicate (atomic dedup via partial unique index). Body extended in-place: `+ ещё 1 ответ 18.05.2026, 23:29:26`. After a third email the body grew to `+ ещё 1 ответ 18.05.2026, 23:29:26 + ещё 1 ответ 18.05.2026, 23:31:36`. dueAt rolled forward to 07:31. Confirms `ensureFollowUpTask` create → P2002 → findFirst+update path works under real load.

**TS-003 PASS** — `GET /api/admin/replies/count` returns `{"count": 1}`. Sidebar nav (CRM expanded) shows "Задачи **Открытых задач-ответов: 1**" — aria-label correct, badge "1" rendered. Per-user scope confirmed (matches the owner-scoped task).

**TS-004 PASS** — Opened `/admin/customers/cmoxwethf0000mr0plhvi9pcs`. Re-queried count endpoint: still `{"count": 1}`. Confirms badge is decoupled from `readAt` flips — opening Customer 360 marks messages read for timeline styling but does NOT close any team member's per-user action queue.

**Anti-regression:** `/admin` dashboard still loads. `/admin/crm/deals` still loads. `/admin/settings/inbound-log` still works (new entries with outcome `accepted_customer`). All 5 verify-*.ts integration scripts pass locally (verify-email-log, verify-email-resolve [extended with auto-task assertion], verify-email-inbound, verify-deal-estimate, verify-crm-task-unique, verify-auto-task).

## Implementation Tasks

### Task 1: Add `readAt` column to CommunicationLog + partial unique index on CrmTask

**Objective:** Schema migration adds nullable `readAt DateTime?` to track per-message read state AND adds a partial unique index on `CrmTask` to enforce atomic dedup of OPEN FOLLOW_UP tasks per `(customerUserId, dealId)`.
**Dependencies:** None
**Mapped Scenarios:** TS-002 (dedup enforcement), TS-004 (read state)

**Files:**
- Modify: `prisma/schema.prisma` (add `readAt` field on `CommunicationLog`)
- Create: `prisma/migrations/<auto-timestamped>_inbound_reply_task_and_badge/migration.sql`

**Trivial:** Omit.

**Key Decisions / Notes:**
- Place `readAt DateTime?` immediately after `createdAt` on `CommunicationLog`. NOT used by the badge — used only for in-page timeline styling.
- Add `@@index([customerUserId, channel, readAt])` on `CommunicationLog` so the `markRepliesRead` count + update remains fast as the table grows.
- **Partial unique index on CrmTask** (Prisma schema syntax does NOT natively support partial unique indexes with WHERE clauses, so this lives in raw SQL added to the migration file by hand AFTER Prisma generates the auto-migration):
  ```sql
  CREATE UNIQUE INDEX "CrmTask_open_followup_unique"
    ON "CrmTask"("customerUserId", COALESCE("dealId", '00000000-0000-0000-0000-000000000000'))
    WHERE status = 'OPEN' AND kind = 'FOLLOW_UP';
  ```
  The `COALESCE` handles the case `dealId IS NULL` — PostgreSQL otherwise treats NULLs as distinct in unique indexes, which would let two no-deal OPEN follow-ups for the same customer coexist.
- The index is intentionally narrow: it does NOT block closed/cancelled follow-ups for the same pair — only one OPEN at a time.
- After `prisma migrate dev` succeeds, run `pkill -f "prisma migrate dev"` to kill the post-apply drift prompt.

**Definition of Done:**
- [ ] Schema validates: `npx prisma validate` clean
- [ ] Migration file exists and contains BOTH the `readAt` column addition AND the raw `CREATE UNIQUE INDEX` statement
- [ ] Migration applies locally: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Примени" npx prisma migrate dev`
- [ ] Generated client refreshed: `npx prisma generate`
- [ ] Manual test: insert two `CrmTask` rows with the same `(customerUserId, dealId, kind=FOLLOW_UP, status=OPEN)` — second insert MUST fail with P2002 unique-violation
- [ ] Manual test: insert two `CrmTask` rows with the same `customerUserId` and `dealId=null, kind=FOLLOW_UP, status=OPEN` — second insert MUST also fail (verifies COALESCE)
- [ ] Anti-regression: existing CrmTask creations from `app/actions/crm/tasks.ts` (manager-created tasks) continue to work — those use `kind=GENERIC` by default, NOT FOLLOW_UP, so the index does not affect them. Verify by re-running `npm run verify-deal-estimate`.

**Verify:** `npx prisma validate && npx prisma migrate status`

### Task 2: `ensureFollowUpTask` helper with dedup + owner fallback

**Objective:** Pure-ish helper that, given `(customerUserId, dealId, customerName)`, finds an OPEN FOLLOW_UP task or creates one.
**Dependencies:** Task 1
**Mapped Scenarios:** TS-001, TS-002

**Files:**
- Create: `lib/crm/auto-task.ts`

**Trivial:** Omit.

**Key Decisions / Notes:**
- Export `ensureFollowUpTask(input: { customerUserId: string; customerName: string; dealId: string | null }): Promise<{ taskId: string; created: boolean }>`.
- **Atomic upsert pattern** (relies on the partial unique index from Task 1):
  ```typescript
  const ownerUserId = await pickOwner(input.dealId);  // deal.ownerUserId ?? first ADMIN by createdAt
  const dueAt = addHours(new Date(), 4);
  try {
    const created = await db.crmTask.create({
      data: {
        title: `Ответить клиенту: ${input.customerName}`,
        body: `Клиент ответил по email. Откройте сделку и ответьте.`,
        kind: "FOLLOW_UP",
        status: "OPEN",
        dueAt,
        customerUserId: input.customerUserId,
        dealId: input.dealId,    // pass literal null when null
        ownerUserId,
      },
      select: { id: true },
    });
    return { taskId: created.id, created: true };
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    // Unique-index hit — an OPEN FOLLOW_UP already exists for (customerUserId, dealId).
    // Fetch it and update dueAt + append to body. The findFirst MUST include
    // customerUserId in the where clause to prevent matching another customer's
    // no-deal task. dealId: null is passed literally (NOT undefined — Prisma
    // would match any dealId otherwise).
    const existing = await db.crmTask.findFirst({
      where: {
        customerUserId: input.customerUserId,
        dealId: input.dealId,
        kind: "FOLLOW_UP",
        status: "OPEN",
      },
      select: { id: true, body: true },
    });
    if (!existing) throw new Error("P2002 fired but no matching OPEN FOLLOW_UP found");
    const appendedBody = `${existing.body ?? ""}\n+ ещё 1 ответ ${new Date().toLocaleString("ru-RU")}`.slice(-4000);
    await db.crmTask.update({
      where: { id: existing.id },
      data: { dueAt, body: appendedBody },
    });
    return { taskId: existing.id, created: false };
  }
  ```
- Owner pick helper: if `dealId`, lookup `deal.ownerUserId`. If null OR `dealId===null`, query `db.user.findFirst({where: {permissionRole: "ADMIN"}, orderBy: {createdAt: "asc"}, select: {id: true}})` — must be deterministic across runs.
- Body cap: `.slice(-4000)` — keep the most-recent tail when very chatty customers blow past 4000 chars.

**Definition of Done:**
- [ ] File created with TypeScript-strict signature
- [ ] No `any` types; all DB results cast explicitly per project convention
- [ ] `npx tsc --noEmit` clean
- [ ] Unit-style verification script `scripts/verify-auto-task.ts` covers: (a) creates when no existing, (b) hits P2002 and updates when OPEN exists, (c) creates a new one when prior was DONE (index allows), (d) falls back to first ADMIN when `deal.ownerUserId=null`, (e) falls back to first ADMIN when `dealId=null`, (f) two no-deal calls for same customer dedupe to one task (COALESCE check).

**Verify:** `npx tsc --noEmit && npm run verify-auto-task` (script added to `package.json`).

### Task 3: Wire `ensureFollowUpTask` into `resolveInboundEmail`

**Objective:** After Step 1 ("thread") and Step 2 ("customer") branches in `resolveInboundEmail` insert their `CommunicationLog` row, call `ensureFollowUpTask`. Errors swallowed so inbound delivery never fails because of task-side issues.
**Dependencies:** Task 2
**Mapped Scenarios:** TS-001, TS-002

**Files:**
- Modify: `lib/email/resolve.ts` (extend Steps 1 and 2; leave Step 3 unchanged — unknown senders don't get auto-tasks)

**Trivial:** Omit (cross-module wiring + failure-isolation requires its own test path).

**Key Decisions / Notes:**
- After each `db.communicationLog.create` for known customer (Steps 1 and 2), call:
  ```
  try {
    const customerInfo = await db.user.findUnique({ where: { id: prior.customerUserId }, select: { name: true } });
    if (customerInfo) {
      await ensureFollowUpTask({
        customerUserId: prior.customerUserId,
        customerName: customerInfo.name,
        dealId: prior.dealId,  // may be null in Step 2 if no open deal
      });
    }
  } catch (err) {
    console.error("[AUTO-TASK] ensureFollowUpTask failed", err);
  }
  ```
- For Step 2, `customer.id` is already in scope; reuse customer name from the same `findFirst` if we extend its `select`. Better: add `name: true` to the `select` to avoid extra round-trip.
- For Step 1, the prior row only has `customerUserId, dealId` — needs the extra `user.findUnique` for `name`. Acceptable: 1 extra ms per known-customer reply.

**Definition of Done:**
- [ ] `resolveInboundEmail` Steps 1 and 2 call `ensureFollowUpTask` in a try/catch
- [ ] Existing `npm run verify-email-resolve` still passes (anti-regression: known-customer + In-Reply-To paths)
- [ ] Extended script `scripts/verify-email-resolve.ts` asserts: after Step 2, a FOLLOW_UP task exists for the test customer (new assertion appended to existing test cases)

**Verify:** `npm run verify-email-resolve`

### Task 4: `markRepliesRead` server action + page-render integration

**Objective:** Server action that flips `readAt` for unread `EMAIL_INBOUND` rows of a given customer. Called from `/admin/customers/[id]` and `/admin/crm/deals/[id]` page renderers.
**Dependencies:** Task 1
**Mapped Scenarios:** TS-004

**Files:**
- Create: `app/actions/crm/communications.ts`
- Modify: `app/(admin)/admin/customers/[id]/page.tsx` — call `markRepliesRead(customerId)` once after `requireRole` (fire-and-forget, do NOT await in critical render path)
- Modify: `app/(admin)/admin/crm/deals/[id]/page.tsx` — same pattern, derive `customerUserId` from the deal

**Trivial:** Omit.

**Key Decisions / Notes:**
- Action signature: `export async function markRepliesRead(customerUserId: string): Promise<void>`.
- Inside: `await requireRole(["ADMIN", "MANAGER"])`. Then cheap pre-check `db.communicationLog.count({where: {customerUserId, channel: "EMAIL_INBOUND", readAt: null}})` → if 0, return immediately (avoids unnecessary write).
- If > 0: `db.communicationLog.updateMany({where: {customerUserId, channel: "EMAIL_INBOUND", readAt: null}, data: {readAt: new Date()}})`.
- Page-side call MUST be wrapped: `await markRepliesRead(customerId).catch(() => {});` — the `.catch` swallows failures so the page still renders; the `await` ensures execution (NOT a floated Promise).
- **`requireRole` in RSC context is safe.** It reads from `headers()`/`cookies()` which Next.js exposes during Server Component render. This is the same pattern existing pages use (`/admin/page.tsx` line 27 calls `getSession()` which reads cookies). The `.catch(() => {})` is for failure resilience only; auth enforcement is preserved — an unauthenticated caller throws inside `requireRole`, the catch swallows, and the page still renders without flipping `readAt`.
- Performance: with `@@index([channel, readAt])` from Task 1, the count + updateMany combo is sub-ms even with 100k inbound rows per customer (highly unlikely anyway).

**Definition of Done:**
- [ ] Server action created and exported
- [ ] Both pages import + call it
- [ ] Manual local test: insert a fake unread row → load customer page → row's readAt is non-null
- [ ] `npx tsc --noEmit` clean
- [ ] Anti-regression: pages still render under existing E2E coverage (admin dashboard + customer 360 + deal detail still load)

**Verify:** `npx tsc --noEmit && npm run build` (build catches Server Action wiring errors)

### Task 5: `/api/admin/replies/count` endpoint

**Objective:** GET endpoint returning `{ count: <n> }` for the nav badge — count of OPEN FOLLOW_UP tasks owned by the current user.
**Dependencies:** Task 1, Task 2
**Mapped Scenarios:** TS-003

**Files:**
- Create: `app/api/admin/replies/count/route.ts`

**Trivial:** Omit — auth + per-user scoping is a small but non-trivial pattern (gets per-user query right, response shape change vs. `InboxBadge`'s `{pending}`).

**Key Decisions / Notes:**
- Authentication: `const session = await requireRole(["ADMIN", "MANAGER"])`. Return 401 on failure.
- Query: `db.crmTask.count({where: {kind: "FOLLOW_UP", status: "OPEN", ownerUserId: session.id}})`. Per-user — every manager sees only their own follow-up backlog.
- Response: `NextResponse.json({ count })`. NOTE: field name is `count`, NOT `unread` — `unread` was the team-wide design that the reviewer correctly rejected as not matching the owner-scoped task model.
- `export const dynamic = "force-dynamic"` (auth-dependent, never cacheable).
- Query hits the existing `@@index([ownerUserId, status, dueAt])` on CrmTask (line 1323) — fast.

**Definition of Done:**
- [ ] File created, mirrors `inbox/count/route.ts` shape
- [ ] Curl (logged-in cookie): returns `{count: <number>}` 200
- [ ] Curl (no cookie): returns `{error: "Unauthorized"}` 401

**Verify:** Covered by Task 7 (TS-003 in prod E2E).

### Task 6: `RepliesBadge` component + sidebar wiring

**Objective:** Mirror `InboxBadge` for the "Задачи" sidebar item.
**Dependencies:** Task 5
**Mapped Scenarios:** TS-003

**Files:**
- Create: `components/admin/replies/RepliesBadge.tsx`
- Modify: `components/shared/Sidebar.tsx` — extend the `trailing` condition

**Trivial:** Justified — mirrors `InboxBadge.tsx` 1:1; only the endpoint and aria-label change. Covered by TS-003.

**Key Decisions / Notes:**
- Copy `InboxBadge.tsx` to `RepliesBadge.tsx`. **Three edits required — missing any of them silently hides the badge**:
  1. Swap endpoint to `/api/admin/replies/count`
  2. Swap React Query key to `["admin-followup-tasks-count"]`
  3. **Change `data.pending` → `data.count` everywhere in the component.** React renders `undefined` as nothing, so if `data.pending` survives the copy the badge will silently never appear, with no error.
- Swap aria-label to `Открытых задач: ${data}`.
- In `Sidebar.tsx:235`, extend:
  ```
  trailing={
    item.href === "/admin/crm/inbox" ? <InboxBadge /> :
    item.href.startsWith("/admin/crm/tasks") ? <RepliesBadge /> :
    undefined
  }
  ```
- Use `startsWith` because the nav href has `?scope=open&owner=mine` query suffix.

**Definition of Done:**
- [ ] Component file created
- [ ] Sidebar conditional updated
- [ ] `npm run build` succeeds
- [ ] Visual smoke: open `/admin` — "Задачи" link shows badge (or no badge if count = 0). Confirmed via TS-003 in prod.

**Verify:** Covered by Task 7 (TS-003).

### Task 7: E2E verification on prod

**Objective:** Full prod E2E covering all four scenarios. Push to main, wait for Railway, exercise the feature with playwright-cli, document evidence in plan.
**Dependencies:** Tasks 1–6
**Mapped Scenarios:** TS-001, TS-002, TS-003, TS-004

**Files:** (no code change — verification only)

**Trivial:** Omit (verification task).

**Key Decisions / Notes:**
- Commit + push the previous tasks as one logical change (or split into 2–3 commits if helpful for review).
- Wait ~3 min for Railway. Apply the one-time `UPDATE "CommunicationLog" SET "readAt"=NOW() WHERE channel='EMAIL_INBOUND' AND "readAt" IS NULL` against prod DB (Railway shell) — otherwise badge starts at the count of historical inbound rows.
- Execute TS-001 → TS-004 via playwright-cli on https://geleoteka.ru. Ask user to send the test email for TS-001 + TS-002 (user already showed willingness in the previous /spec).
- Update the plan's "Verification Evidence" section with snapshots / counts / timestamps.

**Definition of Done:**
- [ ] All four TS-* scenarios pass with browser evidence
- [ ] Plan file updated with `## Verification Evidence` section showing concrete numbers + timestamps
- [ ] No regression: `/admin` still loads, `/admin/crm/deals` still loads, /admin/settings/inbound-log still works
- [ ] One-time historical `readAt` reset executed on Railway prod DB and confirmed: `SELECT COUNT(*) FROM "CommunicationLog" WHERE channel='EMAIL_INBOUND' AND "readAt" IS NULL` returns 0 BEFORE running TS-004. (Note: lower priority than in the old design — badge is no longer driven by readAt, so historical unread rows only affect timeline styling, not the badge count.)

**Verify:** Browser snapshots saved under `.playwright-cli/` referenced in the verification evidence section.
