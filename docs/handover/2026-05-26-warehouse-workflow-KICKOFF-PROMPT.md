# Master kickoff prompt — Warehouse workflow rework

> Paste the block below into a fresh session to start the work. It references the
> full analysis in `docs/handover/2026-05-26-warehouse-workflow-review.md` and
> memory observation #13649 (project `geleoteka`).

---

We're reworking the warehouse (WMS) module after live testing. Full analysis is in
`docs/handover/2026-05-26-warehouse-workflow-review.md` — read it first, and fetch
memory #13649 (`geleoteka`) for context. Do NOT start coding until the open
questions below are settled; treat this as planning input, not approved scope.

**Order of work:** Section 0 (workflow correctness) FIRST — it may reframe the rest —
then 1 (receiving/сверка), 2 (warehouse delete), 3 (pick/pack).

Here are my answers / decisions to the open questions. Where I left one blank,
ask me before assuming.

### Section 0 — Storekeeper workflow correctness (TOP PRIORITY)
0.1 Canonical happy-path sequence per role (receiving clerk → putaway → picker → packer).
    The proposed sequence in the doc is: ________
0.2 Is there a "new part with no barcode" path where the internal label MUST be
    printed before the part can be re-scanned (NEW_PART draft from supplier orders)?
    → ________
0.3 Add an inline "Печать наклеек" button to the "Раскладка" cell creator
    (deep-link to /labels?loc=<created codes>)? → ________

### Section 1 — Blind receiving + "требуется сверка"
1.1 Should blind receive ALWAYS land in ПРИЁМКА (staging) and force an explicit
    putaway step, instead of letting the worker type any target cell inline? → ________
1.2 The drift source is "Новый остаток" (absolute on-hand adjust that ignores bins).
    Remove/gate it from the scan card, OR make adjust-down auto-shrink bins (FIFO)? → ________
1.3 The "требуется сверка" badge has no fix-action. Add a reconcile action
    (snap placed→on-hand / open a count session) OR just clearer copy? → ________

### Section 2 — Deleting warehouses
2.1 Hard-delete empty warehouses only (mirror cell-delete), OR is "Деактивировать"
    the intended removal and we just make it more discoverable/relabel it? → ________
2.2 A warehouse with movement HISTORY but zero current stock — allow delete
    (history rows are audit) or force deactivate? → ________

### Section 3 — Pick vs Pack (near-duplicate)
3.1 Will pick and pack DIVERGE later (partial-qty picking, lot/serial, kitting)?
    → ________
3.2 Is the pain primarily UX (two screens feel identical to the worker) or
    maintenance (parallel code for us)? → ________
3.3 Is partial pick/pack a requirement, or is full-line-per-scan fine? → ________

Once these are answered, propose a plan (likely several small specs) and we'll go
section by section.
