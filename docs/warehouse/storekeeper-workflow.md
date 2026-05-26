# Storekeeper Workflow — Canonical Sequence

**Status:** canonical. Validate every warehouse screen against this. Supersedes the candidate sequence in `docs/handover/2026-05-26-warehouse-workflow-review.md`.

## Principles

- **One identity, one label.** A part's identity is its **article (SKU)**. Our internal QR label encodes the article. A supplier barcode, if stored, resolves on scan as an *alias* but is never what we print.
- **Relabel on receipt.** Every accepted item gets **our** QR label. All internal scanning (putaway / pick / pack) uses only our label, one consistent format.
- **All stock lives in a bin.** Received goods land in the **ПРИЁМКА** (staging) bin; putaway *transfers* them to a shelf. `on-hand = Σ bins` at all times.
- **placed ≤ on-hand is structural.** No operation may leave more placed in cells than is on hand. On-hand is corrected only at the bin/location level (see Stocktake), never by a blind absolute override.
- **Quantity-by-article.** No per-unit serial tracking.

## Receiving clerk

```
scan supplier barcode / type article   → resolve & confirm part
  (supplier barcode is an optional lookup aid; not required)
receive  → into ПРИЁМКА bin            → on-hand +qty, placed +qty (balanced)
  · order-backed: against an open supplier-order line (CAS on receivedQuantity)
  · blind:        no order (gray import), distinct ManualReceipt source
print & affix OUR QR label (article)   → /admin/warehouse/labels?part=<id>
```

Receipt always stages into ПРИЁМКА — no inline target cell. Putaway is a separate, explicit step.

## Putaway

```
scan our QR (part) + scan shelf cell   → transfer ПРИЁМКА → shelf
```

Bin-to-bin transfer; conserves on-hand. `placeStock` refuses to bin more than `unplaced = on-hand − placed`.

## Picker (repair order)

```
open RO  → per APPROVED-estimate PART line:
  scan part + scan shelf → consume full line qty from that bin → CONSUMPTION
```

Parts go onto the car (internal consumption). Allowed RO statuses: SCHEDULED / IN_PROGRESS / READY.

## Packer (parts shipment)

```
open order → per line:
  scan part + scan shelf → consume full line qty from that bin → CONSUMPTION
scan box → ship → customer notified
```

Allowed shipment status: PROCESSING.

## Inventory correction (Stocktake / сверка)

On-hand is corrected **only** through a count tied to a location: open a count session, count the cell, the system reconciles that bin and on-hand together with an audited adjustment. There is no blind "set on-hand to X" control — removing it is what makes `placed ≤ on-hand` structurally safe.

## Cell setup (Раскладка)

Create cells (single or a range `A-1-1..A-3-4`), then **Печать наклеек** to print their QR labels and affix them to the shelves.
