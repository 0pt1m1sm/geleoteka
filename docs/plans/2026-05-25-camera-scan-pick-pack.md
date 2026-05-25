# Camera-Scan Buttons for Picking & Packing Lines Implementation Plan

Created: 2026-05-25
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** A warehouse worker on a phone can tap one "Сканировать камерой" button per open picking/packing line, scan the bin label then the part with the camera (sequential, mirroring a hardware-scanner sweep), and have the decoded codes land in that line's bin (ячейка) and part (запчасть) fields — without typing. The PackBox короб (parcel) field gets its own single camera button.

## Out of Scope

- No change to the server actions `pickRepairOrderLine` / `packOrderLine` / `recordPackBoxScan` — the scanned raw code feeds the SAME fields the manual inputs already feed; the server resolves it via `parseScanCode` + `lookupByCode`/article fallback.
- `components/warehouse/QrScanner.tsx` is reused with its existing `{ onScan, busy }` props (no API change; the redundant manual-entry input is accepted as the cost of reuse). One minimal, additive internal fix was made during verification (Codex finding): a `disposedRef` guard stops a camera stream whose `decodeFromConstraints` await resolves after the component is unmounted — without it, switching scan target mid-startup orphaned a live stream. No behavior change for the existing WarehouseScanBox consumer.
- The existing manual text inputs and bin-badge quick-select remain fully intact and editable.
- No new dependency — `@zxing/browser ^0.2.0` is already installed.

## Approach

**Chosen:** Per-line reveal of the existing `QrScanner` with ref-driven sequential field routing, in `components/admin/PickBox.tsx` and `components/admin/PackBox.tsx`.
**Why:** Reusing `QrScanner` (the component `WarehouseScanBox.tsx` already consumes) gives the iOS-Safari-safe canvas decoder for free and keeps the change to two files. One camera button per line (not per field) preserves the hardware-scanner metaphor and avoids button clutter, at the cost of a second tap to start the camera inside the revealed panel (QrScanner owns its own start button — its API is fixed, so we reveal rather than auto-start).

## Context for Implementer

Both tasks share one non-obvious constraint. `QrScanner.startCamera()` registers its zxing decode callback **once**; that callback closes over the `onScan` prop captured at camera-start time. Any `onScan` handler that reads component state directly (e.g. `bin[lineId]`) will read a **stale** snapshot. Therefore the bin→part sequencing MUST be driven by a `useRef` step pointer (mutated synchronously, never stale) and all field writes MUST use functional state updaters (`setBin(m => ...)`). A second ref holds the last code written so a bin label still in the camera frame cannot bleed into the part field after QrScanner's internal 1 s duplicate guard expires.

## Progress Tracking

- [x] Task 1: PickBox — per-line camera button + sequential bin→part scan routing
- [x] Task 2: PackBox — same per-line pattern + single короб camera button

## Implementation Tasks

### Task 1: PickBox — per-line camera scan

**Objective:** Add one "Сканировать камерой" button per open line in `components/admin/PickBox.tsx` that reveals an inline `QrScanner`; successive decodes fill the line's bin field (if empty) then the part field, then close the panel. Verified by TS-001.

**Files:**

- Modify: `components/admin/PickBox.tsx`

**Key Decisions / Notes:**

- Import `QrScanner` from `@/components/warehouse/QrScanner` (same import `WarehouseScanBox.tsx:17` uses).
- New state/refs: `scanLine: string | null` (which line's panel is open, state), `scanStep: "bin" | "part"` (state, caption only), `scanStepRef` (ref, the authoritative step — non-stale), `lastCodeRef` (ref, last code written — bleed guard).
- `openScanner(lineId)`: set step to `"part"` if `(bin[lineId] ?? "").trim()` already filled (respects bin-badge quick-select), else `"bin"`; sync ref + state; `lastCodeRef.current = ""`; `setScanLine(lineId)`.
- `handleLineScan(lineId, raw)`: trim; ignore empty. If `scanStepRef.current === "bin"`: `setBin(m => ({...m, [lineId]: code}))`, `lastCodeRef.current = code`, advance ref+state to `"part"`. Else: if `code === lastCodeRef.current` return (same label still framed); `setPart(m => ({...m, [lineId]: code}))`, `setScanLine(null)`. ⛔ Must use functional updaters + refs — see Context for Implementer.
- Render per line, after the existing field row (`PickBox.tsx:103-132`): a `btn btn-secondary min-h-[44px]` button labelled "Сканировать камерой" calling `openScanner(line.lineId)`; when `scanLine === line.lineId`, render below it a panel with a caption (`Шаг 1/2: наведите на ячейку` / `Шаг 2/2: наведите на запчасть` from `scanStep`), `<QrScanner onScan={(raw) => handleLineScan(line.lineId, raw)} />`, and an "Отмена" button calling `setScanLine(null)`.
- `aria-label` on the per-line button includes `line.article` so multiple lines' buttons are distinguishable.
- `Trivial:` N/A — exceeds 5 lines and adds new UI state; but no pure logic worth a tsx verify script (camera/UI glue). Verification is live browser E2E (TS-001), per task constraints.

**Definition of Done:**

- [x] Each open line shows exactly ONE "Сканировать камерой" button; tapping it reveals the QrScanner panel for that line only.
- [x] With bin empty, the first decode populates the line's Ячейка input; the next (different) decode populates the Запчасть input and closes the panel.
- [x] If the bin was pre-filled via a bin badge, opening the scanner targets the part field first.
- [x] Manual Ячейка/Запчасть inputs and "Отобрать" remain functional and editable.
- [x] Verify: live browser E2E TS-001 on dev HTTPS:443 (or documented hardware limitation + render/wiring proof).

### Task 2: PackBox — per-line camera scan + короб button

**Objective:** Apply the Task 1 per-line pattern to `components/admin/PackBox.tsx` (keyed by `line.lineKey`), and add a single camera button next to the короб (parcel) field whose one decode fills `box` and closes. Verified by TS-002.

**Files:**

- Modify: `components/admin/PackBox.tsx`

**Key Decisions / Notes:**

- ⛔ PackBox has TWO scan surfaces (per-line + короб), so a single boolean-per-surface model could mount two `QrScanner`s at once (two `getUserMedia` streams; the same physical scan accepted by the wrong still-open panel — `QrScanner.tsx:44-55` starts an independent decode loop per mount). Make this **structurally impossible**: use ONE discriminated-union state `scanTarget: { kind: "box" } | { kind: "line"; key: string } | null` (replaces Task 1's `scanLine`). Only one panel can ever be open by construction — no manual cross-close to forget.
- Refs (`scanStepRef`, `lastCodeRef`) and the caption `scanStep` state are the same as Task 1; `handleLineScan(lineKey, raw)` is identical to Task 1's logic but keyed by `line.lineKey` (`PackBox.tsx` stores bin/part as `Record<lineKey, string>`).
- `openScanner(lineKey)`: compute step from `(bin[lineKey] ?? "").trim()`, reset refs, `setScanTarget({ kind: "line", key: lineKey })`.
- Per-line button + inline panel after the existing line field row (`PackBox.tsx:158-187`): render the panel when `scanTarget?.kind === "line" && scanTarget.key === line.lineKey`; "Отмена" calls `setScanTarget(null)`.
- короб (single field, `PackBox.tsx:103-123`): a "Сканировать камерой" button next to "Подтвердить короб" calling `setScanTarget({ kind: "box" })`; render the panel when `scanTarget?.kind === "box"` with `<QrScanner onScan={handleBoxScan} />` + "Отмена". `handleBoxScan(raw)`: trim, ignore empty, `setBox(code)`, `setScanTarget(null)`. One field, one decode — no sequencing (короб is a plain `useState<string>`, stable setter, no stale-closure issue).
- `Trivial:` N/A — same rationale as Task 1; verification via live browser E2E (TS-002).

**Definition of Done:**

- [x] короб field shows a "Сканировать камерой" button; one decode fills the короб input and closes the panel; "Подтвердить короб" still works.
- [x] Each open pack line shows one camera button; sequential bin→part fill works exactly as in PickBox.
- [x] Manual inputs, bin badges, "Упаковать", and "Подтвердить отгрузку" remain functional.
- [x] Verify: live browser E2E TS-002 on dev HTTPS:443 (or documented hardware limitation + render/wiring proof).

## E2E Test Scenarios

### TS-001: Picking line camera scan
**Priority:** Critical
**Preconditions:** Logged in as admin (`admin@geleoteka.ru` / `admin123`); a repair order in picking with ≥1 open line at `/admin/warehouse/picking/[id]`.
**Mapped Tasks:** Task 1

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to a picking order detail page | Open lines render, each with Ячейка/Запчасть inputs and a "Сканировать камерой" button |
| 2 | Tap "Сканировать камерой" on a line | An inline panel appears for that line with a step caption and QrScanner (start button + manual fallback); no other line shows a panel |
| 3 | Start the camera and decode a bin code (or use QrScanner manual entry) | The line's Ячейка input is populated; caption advances to "Шаг 2/2: запчасть" |
| 4 | Decode a different part code | The line's Запчасть input is populated and the panel closes |
| 5 | Tap "Отобрать" | The existing pick flow runs against the populated fields (success or inline error as before) |

### TS-002: Packing line + короб camera scan
**Priority:** Critical
**Preconditions:** Logged in as admin; an order in packing with ≥1 open line at `/admin/warehouse/packing/[id]`.
**Mapped Tasks:** Task 2

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to a packing order detail page | короб field + a "Сканировать камерой" button beside "Подтвердить короб"; each open line has its own camera button |
| 2 | Tap the короб camera button, then (before decoding) tap a line's "Сканировать камерой" | Only ONE scanner panel is mounted at a time — opening the line panel closes the короб panel (mutual exclusion; never two camera widgets on screen) |
| 3 | Tap the короб camera button, decode a code | короб input is populated and the panel closes; "Подтвердить короб" still works |
| 4 | Tap a line's "Сканировать камерой", decode bin then part | Ячейка then Запчасть populate sequentially; panel closes after the second decode |
| 5 | Tap "Упаковать" | Existing pack flow runs against the populated fields |

## E2E Results

Verified on dev HTTPS:443 (admin@geleoteka.ru) via Claude-in-Chrome. Camera hardware is unavailable in the test env, so the live camera decode itself was not exercised; the decoded-code routing was driven through QrScanner's manual-entry fallback, which calls the **same `onScan` path** as the camera decode (`QrScanner.dispatch`). PickBox was rendered via a temporary, reverted DB fixture (a DRAFT estimate flipped to APPROVED on the existing SCHEDULED repair order, then restored).

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001   | Critical | PASS   | 0            | PickBox: bin "A-1-1" then part "A4634210400" filled sequentially; panel closed after 2nd decode. |
| TS-002   | Critical | PASS   | 1            | PackBox: короб filled ("BOX-1", panel closed); sequential bin→part fill; mutual exclusion confirmed (only one QrScanner ever mounted — 1 input/1 video). Fix: Codex-flagged orphaned-camera race during target switch → disposedRef guard in QrScanner. |

**Not verified (camera hardware):** the live `getUserMedia` camera-startup race that the `disposedRef` guard addresses could not be reproduced without a camera; the fix is verified by static reasoning, types, and a clean build, and the manual-path regression confirms no breakage.
