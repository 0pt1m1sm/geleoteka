# Service vs. Deal IA Split — Записи / Сметы

Created: 2026-05-10
Author: aleksandr.spiskov@gmail.com
Category: Product / IA
Status: Draft
Research: Light

## Problem Statement

The admin currently mixes two distinct manager workflows on the same page (`/admin/repair-orders/[id]`):

- **Booking management** — appointment status, customer card, vehicle, master assignment, mileage, customer concern, in-progress photos. This is **operations** and lives within the Service module.
- **Deal / financial management** — line-by-line job pricing, labor (hours × rate), parts (qty × price), per-line approval status, "send estimate to client", PROPOSED → APPROVED → DONE flow. This is **commercial** and belongs in CRM.

Stuffing both into one screen confuses the manager (different tasks, different mental models, different update cadence) and produces edit-conflict risk: the operations manager updates RO status on the same minute the deals manager edits a price line.

The data model can stay unified — `RepairOrder` is the right aggregate root — but the **surfaces** must split so the manager picks the route based on what they're doing, not based on remembering which page contains which form.

## Goals

1. Separate **booking surface** (`/admin/repair-orders/[id]`) from **deal surface** (`/admin/estimates/[id]`).
2. Keep one persistence model (`RepairOrder` + `JobLine` + `LaborLine` + `PartLine`) — no schema duplication.
3. Each surface owns a non-overlapping field set; cross-references are read-only links.
4. Sidebar IA reflects the split: Сервис → Записи / Календарь / Команда; CRM → Клиенты / Сделки (Сметы).

## Non-Goals

- Building a per-line approval inbox for clients (deferred — current cabinet preview is acceptable).
- A separate Deal entity in Prisma. The PRD locks in: deal = RepairOrder viewed through the financial lens.
- Renaming "смета" → "сделка" in UI copy. Russian "смета" is the trade term operators expect; we surface it as-is in CRM.

## Surface Ownership

### `/admin/repair-orders/[id]` — Booking
| Section | Owned fields | Module |
|---|---|---|
| Header | RO number, scheduled time, current status | Service |
| Customer card | name, phone, email (read-only link to CRM detail) | Service (read) |
| Параметры заказ-наряда | concern, notes, mileageIn, mileageOut, promisedAt, masterUserId | Service |
| Статус | status (StatusChanger) | Service |
| Фотографии работ | RepairOrderPhoto CRUD | Service |
| Финансы (read-only summary) | total, jobLine count, link "→ Открыть в Сметах" | Service (read) |

### `/admin/estimates/[id]` — Deal
| Section | Owned fields | Module |
|---|---|---|
| Header | Client name + RO number (link back to booking), deal stage chip | CRM |
| Финансы | JobLine CRUD: description, hours×rate, parts (qty × price), JobLineStatus | CRM |
| Итоги | subtotalLabor, subtotalParts, discount, tax, total | CRM |
| Действия | "Отправить клиенту", "Скачать PDF" (deferred), "Отметить APPROVED целиком" | CRM |
| Booking context (read-only) | scheduled date, vehicle, master | CRM (read) |

### Cross-links (mandatory)
- Booking page: gold link "→ Финансы (Сметы)" jumps to `/admin/estimates/[id]`.
- Deal page: subtle link "← Запись" jumps back to `/admin/repair-orders/[id]`.

## Sidebar IA

```
Сервис
  Записи          → /admin/repair-orders
  Календарь       → /admin/calendar
  Команда         → /admin/team

CRM
  Клиенты         → /admin/customers
  Сделки (Сметы)  → /admin/estimates  (filter: status ∈ ESTIMATE/APPROVED/IN_PROGRESS)
```

`/admin/estimates` becomes a real list (not a redirect). Default filter shows open deals. Today's `/admin/repair-orders?status=ESTIMATE` link gets retired.

## Scope

### In Scope

1. **New route** `app/(admin)/admin/estimates/[id]/page.tsx` rendering the deal surface. Reuses `JobLineEditor` (already extracted).
2. **Slim `/admin/repair-orders/[id]`** — remove `JobLineEditor` from the booking page; replace with a read-only finance summary and the cross-link.
3. **Real `/admin/estimates` list** with stage filter chips: "Открытые" (ESTIMATE+APPROVED+IN_PROGRESS), "Согласованные", "Завершённые", "Все".
4. **Sidebar move**: "Сметы" goes to CRM group as "Сделки (Сметы)".
5. **`addJobLines` redirect** changes to `/admin/estimates/[id]` (deal-first flow after creating estimate).
6. **Module boundaries**: deal surface lives in `components/admin/crm/` (new dir); booking surface stays in `components/admin/`. ESLint boundaries per existing PRD — no cross-imports.

### Out of Scope

- DealStage as a separate enum (we keep `RepairOrderStatus`; `ESTIMATE` and `APPROVED` are deal stages, `IN_PROGRESS` onward are booking stages — a single column is fine).
- PDF estimate export (deferred).
- Per-JobLine client-facing approval UX (deferred).
- Deal-pipeline kanban (consider after CRM v2 PRD).

## Migration Path

Single change set, no DB migration:
1. Create new components under `components/admin/crm/`.
2. Build `/admin/estimates/[id]` page, reuse `JobLineEditor` (move it into `crm/` if no other consumer).
3. Trim `/admin/repair-orders/[id]` to remove the editor; add finance summary + cross-link.
4. Replace `/admin/estimates/page.tsx` redirect with the real list.
5. Update sidebar nav. Drop the `?status=ESTIMATE` chip from the records list.
6. Run e2e: create estimate → land on deal surface → add JobLines → click "← Запись" → see updated total in booking summary.

## Acceptance Criteria

- [ ] `/admin/repair-orders/[id]` shows zero pricing inputs; only summary + link.
- [ ] `/admin/estimates/[id]` is the only place to add/edit JobLines.
- [ ] `/admin/estimates` list paginates open deals with stage filter chips.
- [ ] Sidebar "Сделки (Сметы)" lives under CRM; activeHref highlights it on `/admin/estimates*`.
- [ ] No file imports across module dirs except via `shared/` (ESLint clean).
- [ ] Browser-verified: end-to-end deal creation → status change → finance summary updates.

## Open Questions

- Should "Сделки" show closed deals by default or only open? Recommendation: open by default with an explicit "Все" tab.
- Do we surface PartOrder + RentalBooking under Сделки too? Recommendation: yes after CRM v2, not now.
