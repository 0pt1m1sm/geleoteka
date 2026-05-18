# Email Setup (Resend)

Transactional email for booking confirmations, estimate-sent notifications, registration welcomes, part-order receipts, and rental-booking confirmations. Sender code is in `lib/email/`; this doc covers operator setup.

## TL;DR

1. Sign up at https://resend.com and create an API key.
2. Add `RESEND_API_KEY` to Railway env. Leave `RESEND_FROM` **empty** (or commented out) — the transport falls back to `onboarding@resend.dev` so first sends work immediately.
3. Verify the `geleoteka.ru` domain in the Resend dashboard (SPF + DKIM TXT records at your DNS provider).
4. Once the domain status is green, set `RESEND_FROM="Geleoteka <info@geleoteka.ru>"` and redeploy.

Without `RESEND_API_KEY`, helpers run in **mock mode** — they log to console and return success, but nothing leaves the server. Safe for local dev, dangerous in production: the boot log emits a `[EMAIL] WARNING: RESEND_API_KEY not set in production` line so misconfiguration is visible.

## 1. Get the API key

1. Go to https://resend.com → sign up (free tier covers 100 emails/day, 3000/month).
2. Dashboard → **API Keys** → **Create API Key**. Name it `geleoteka-production`. Permission: **Sending access**. Copy the key (shown once).
3. Paste into your password manager. You'll plug it into Railway in step 4.

## 2. Verify the geleoteka.ru domain

Resend rejects sends from unverified custom domains.

1. Resend dashboard → **Domains** → **Add Domain** → enter `geleoteka.ru`.
2. Resend shows three to five TXT records to add — typically one SPF, one DKIM, optionally a return-path CNAME, optionally a DMARC policy.
3. At your DNS provider (where `geleoteka.ru` is hosted), add each record exactly as Resend shows. Common pitfall: don't wrap the value in extra quotes — paste verbatim.
4. Click **Verify**. Status turns green within minutes (sometimes up to an hour). If it doesn't propagate within 4 hours, double-check that records were added at the apex (`@` or empty subdomain) where Resend specified.
5. Once green, the sender `info@geleoteka.ru` becomes usable.

## 3. Configure env vars

Three vars control the email behaviour:

```env
# Production key from step 1. Empty value → mock mode (logs only).
RESEND_API_KEY=

# Custom sender once the domain is verified. LEAVE EMPTY (or commented) until
# the geleoteka.ru SPF + DKIM records show green in Resend — the transport
# automatically uses RESEND_FROM_FALLBACK when this is unset.
# RESEND_FROM="Geleoteka <info@geleoteka.ru>"

# Default sender used when RESEND_FROM is empty. onboarding@resend.dev is
# always usable without DNS setup; perfect for bootstrap + dev.
RESEND_FROM_FALLBACK="onboarding@resend.dev"
```

Additionally, `NEXT_PUBLIC_APP_URL` (already in `.env.example`) provides the base URL for outgoing links. Set it to `https://geleoteka.ru` in production.

## 4. Add the vars to Railway

1. Railway project → **Variables**.
2. Add `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_FROM_FALLBACK` (plus `NEXT_PUBLIC_APP_URL` if not already set).
3. Trigger a redeploy (Railway auto-redeploys on env change in most projects).

## 5. Local dev

For local development you don't need a key. Leave `RESEND_API_KEY` empty in your local `.env`. Helpers log `[EMAIL MOCK] to=… subject="…"` so you can verify the flow without sending real mail.

To actually send during dev (e.g. while polishing templates), drop the production key into local `.env`. The transport defaults to `RESEND_FROM_FALLBACK` if `RESEND_FROM` points at an unverified domain, so you can iterate before DNS is set.

## 6. Preview templates locally

Templates live in `lib/email/templates/`. To inspect a rendered HTML in your browser without sending:

```bash
node --import tsx --eval "
import { renderBookingConfirmation } from './lib/email/templates/booking-confirmation';
import { writeFileSync } from 'node:fs';
const { html } = renderBookingConfirmation({
  customerName: 'Иван Петров',
  dateTime: new Date('2026-05-25T10:00:00'),
  vehicleSummary: 'Mercedes-Benz G-Class 2020 г.',
  services: ['Диагностика', 'Замена масла'],
  address: 'Москва, ул. Примерная, 15',
  managerPhone: '+7 495 123-45-67',
});
writeFileSync('/tmp/preview.html', html);
console.log('open /tmp/preview.html');
"
open /tmp/preview.html
```

Repeat with `renderEstimateSent`, `renderRegistrationWelcome`, `renderPartOrderConfirmation`, `renderRentalBookingConfirmation`.

## 7. Monitoring after launch

1. **Resend dashboard → Activity** — every send appears here with bounce/delivery status.
2. Watch the first 7 days for delivery to `mail.ru` and `yandex.ru` inboxes. If bounce or spam-mark rate exceeds 20%, consider switching to direct SMTP via Yandex 360 (see TD entry in `docs/tech-debt.md` for the deferred plan).
3. The boot warning `[EMAIL] WARNING: RESEND_API_KEY not set` should never appear in production logs — if it does, env vars didn't propagate.

## Fail-mode contract (for developers wiring new flows)

All call sites use:

```ts
const { sendXyzEmail } = await import("@/lib/email");
void sendXyzEmail(to, { ... }).catch(() => {});
```

`void` + `.catch` is **mandatory** — without it a Node 18+ `unhandledRejection` from inside the helper can surface as a 500 in the parent server action. Helpers themselves wrap their bodies in `try/catch`, but the catch on the call site is belt-and-braces.

Email is **never** a precondition for business logic. A booking succeeds even if Resend returns 500; the failure surfaces only in `console.error`.
