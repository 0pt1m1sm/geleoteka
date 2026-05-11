# YooKassa Integration (Follow-up Plan)

Created: 2026-05-11
Status: DRAFT (deferred — placeholder only)
Approved: No
Iterations: 0
Worktree: No
Type: Feature

> This is a placeholder stub for the YooKassa integration. The companion plan
> `2026-05-11-estimate-pdf-two-page-layout.md` introduces the CMS field
> `payments.gateway_url_template` as the QR target. This follow-up plan covers
> the actual integration — admin-side settings, server-side checkout-session
> creation, signed redirect, webhook handler, and reconciliation.

## Why a separate plan

The PDF-layout plan only needs a URL to encode into the QR. A real YooKassa
integration adds:

- A new admin route `/admin/settings/integrations/yookassa` for shopId + secret + test/live toggle.
- A new Prisma model (or `Integration` table) so secrets don't live in the CMS table.
- A server endpoint `POST /api/payments/yookassa/checkout` that takes an estimate id,
  calls YooKassa's `payments` API with idempotency keys, and returns the hosted
  payment URL.
- A webhook receiver `POST /api/payments/yookassa/webhook` that verifies HMAC and
  updates payment status on the Deal/Estimate.
- A receipt-data flow (54-FZ compliance) — YooKassa requires line items + VAT codes
  for fiscalization.
- Status reflection in the customer cabinet ("Оплачено", "Ожидание", "Возврат").

Each of those is its own multi-task block. Bundling them with the PDF refactor
would push the PR past 12 tasks and slow the PDF ship.

## Out of scope until this plan is approved

- `payments.gateway_url_template` stays a plain CMS string. If set, the QR
  resolves it. If left empty (default), no QR is rendered.
- No admin menu under `/admin/settings`. Admin uses `/admin/cms` → "Платёжный
  шлюз" → paste a URL.
- No webhook, no payment status, no fiscalization.

## Open questions for the YooKassa plan

- Test environment: do we want to support YooKassa's "Тестовый магазин" mode
  via the admin toggle, or always production?
- 54-FZ: do we need fiscal receipts via YooKassa's `/v3/receipts` endpoint, or
  through an external OFD provider?
- Recurring payments / installments: scoped in or out?
- Will the QR continue to point at the hosted-payment URL after this plan, or
  switch to a deep link into a custom checkout page we host?

## Next step

Run `/spec` against this plan once requirements above are clarified.
