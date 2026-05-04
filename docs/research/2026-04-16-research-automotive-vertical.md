# Automotive Workshop + Fleet Rental Data Model Research

Vertical: independent garages, dealership service departments, specialty/restoration shops. Sources are commercial SaaS docs (Tekmetric, Shopmonkey, Shop-Ware, Mitchell1, Workshop Software, Torque360, R.O. Writer, Orderry, AutoFluent), open-source schemas on GitHub, an academic ERD discussion (DaniWeb), and dealer-loaner fleet vendors (TSD, Rent Centric, VenueVision, RENTALL, Dealerware).

## Customer / vehicle relationship pattern

**Universal pattern: Vehicle is a standalone, first-class entity**, never a sub-record of Customer. Every system surveyed models `Customer 1—M Vehicle` as the *current* ownership view, but the long-lived links are between Vehicle and the operational records (work orders, parts orders, mileage history).

Why standalone:
- A vehicle outlives its owner. Cars get sold; the **service history must follow the VIN, not the customer**. Tekmetric, Mitchell1, and Shop-Ware all key vehicle history off VIN so a new owner inherits the maintenance record.
- A vehicle can have **multiple stakeholders** at one moment: legal owner, primary driver, insurance payer, the person who actually dropped it off. The DaniWeb thread (cleanest normalized sketch in the wild) makes this explicit: keep `vehicle.current_owner_id` and let `booking.booked_by_customer_id` differ.
- Ownership transfer is modeled by a **`vehicle_owner_history`** table (one row per ownership span: `vehicle_id`, `customer_id`, `start_date`, `end_date`). Past invoices/work orders keep pointing at the historical owner, current screen shows the current one.

Linkage in the canonical schema:
```
Customer  1 ──< owns >── M  Vehicle           (current pointer; historical via VehicleOwnerHistory)
Vehicle   1 ──< has >──  M  Appointment
Vehicle   1 ──< has >──  M  WorkOrder/RepairOrder
Vehicle   1 ──< has >──  M  MileageReading    (every RO, MOT, dropoff appends one)
Vehicle   1 ──< has >──  M  Inspection (DVI)
WorkOrder 1 ──< has >──  M  PartLine          (parts attach to the WO, not directly to the vehicle)
```
The DaniWeb design tip is the consensus rule: **never link Part directly to Vehicle**; parts are issued to a WorkOrder, the WorkOrder is for a Vehicle. That avoids duplication and gives a clean audit trail.

Common extra fields on Vehicle: VIN (unique), license_plate, make, model, year, engine, trim, color, current_mileage, last_service_date, notes/quirks (specialty shops lean heavily on this), photo_url, plus a `tags` field for things like "track car", "garage queen", "customer's daily".

## Service appointment / work order pattern

**Canonical name: "Repair Order" (RO)** in the US (Tekmetric, Shop-Ware, Shopmonkey, Mitchell1). Synonyms used elsewhere: **Work Order** (Workshop Software, Torque360), **Job Sheet / Job Card** (UK/AU/IN — Garageplug, Workshop Software AU), **Job** (open-source ChanMeng666 RepairOS). Appointment is a separate, lighter-weight entity that **becomes** an RO at check-in.

Universal status machine (every system):
```
Estimate → Approved → In Progress → Awaiting Parts → QC → Ready for Pickup → Invoiced → Paid → Closed
```
Tekmetric calls these "stages", Shop-Ware "workflow lanes", Shopmonkey just "status". Same idea everywhere.

Universal RO fields:
- `id`, `ro_number` (human-friendly, sequential per shop/year)
- `customer_id`, `vehicle_id`, `mileage_in`, `mileage_out`
- `status`, `created_at`, `promised_at`, `completed_at`
- `service_advisor_id`, `assigned_technician_id` (or M:M via WorkOrderTechnician)
- `concern` / `complaint` (customer's words), `cause`, `correction` (the famous "3 Cs")
- `subtotal_labor`, `subtotal_parts`, `subtotal_sublet`, `tax`, `discount`, `total`, `paid_amount`
- `notes_internal`, `notes_customer`

**Children of an RO** (this is where the data model earns its keep):
- `JobLine` (a.k.a. "Job", "Service Item", "Canned Job") — the unit of approval. Each JobLine has its own status (declined / deferred / approved), its own labor lines, and its own parts lines. Mitchell1 calls this "Job View"; Shop-Ware "Service"; Tekmetric "Smart Jobs". **This is critical: the customer approves jobs, not the whole RO.** Each job rolls up its labor + parts + sublet → job total.
- `LaborLine` (`job_line_id`, `description`, `book_hours` (FRU), `actual_hours`, `rate`, `technician_id`, `total`)
- `PartLine` (`job_line_id`, `part_id` or free-text part, `qty`, `unit_cost`, `unit_price`, `markup_pct`, `supplier_id`, `status` — see parts section)
- `SubletLine` (work farmed out: glass, alignment, paint) — `vendor_id`, `cost`, `price`
- `Fee` / `Charge` (shop supplies %, hazmat, EPA)

Repair history on the Vehicle screen is just `WHERE vehicle_id = ? ORDER BY created_at DESC` over closed ROs — no separate "history" table needed. The `MileageReading` table is the exception: it lets you graph mileage even from rows that aren't ROs (walk-in oil top-ups, MOT visits).

## Parts catalog vs inventory pattern

**Two-layer model is universal.** All major systems separate the SKU definition from the stock count.

| Layer | Entity | Purpose |
|---|---|---|
| Catalog | `Part` | Identity of a SKU: number, name, description, brand, oem_number, category, default_cost, default_price. Exists whether you stock it or not. |
| Stock | `InventoryItem` (or `StockLevel`) | Per-location counts: `part_id`, `location_id`, `qty_on_hand`, `qty_on_order`, `qty_allocated`, `reorder_point`, `reorder_qty`, `bin`, `last_counted_at`. |
| Movement | `InventoryTransaction` | Every change: `+receive`, `-issue_to_RO`, `-sale`, `+return`, `+adjust`. Append-only ledger. |

**How small garages handle parts they don't stock** (the realistic question — most independents stock < 200 SKUs and order the rest per-job):

1. **Free-text part lines on ROs.** Every system lets you add a part to an RO that has no `part_id` — just description, cost, price. Shopmonkey, Tekmetric, Shop-Ware all default to this (Moxie Automotive Consulting confirms ShopMonkey and Tekmetric are "usage-centric" — the part record is created at the moment it's quoted on an RO, not pre-loaded).
2. **"Special order" flag on PartLine.** Status enum: `needed → ordered → backordered → received → installed → returned`. The PartLine carries the supplier_id and PO number. When the part arrives, it's marked `received` against the originating RO — no inventory movement at all (it lands on a job, not in stock).
3. **Auto-promote to catalog (optional).** Tekmetric and Shop-Ware optionally upsert a `Part` row the first time a SKU appears on an RO so future searches find it. Shopmonkey leaves it RO-local until you explicitly "Save to inventory".
4. **Allocation engine.** Shop-Ware's term for the rule: when an estimate is built, the system asks "do I have this in stock, on order for another RO, or do I need to order?" The PartLine carries an `allocation_status` so multiple ROs don't double-claim one stocked unit.

Cores (returnable cores like alternators) get their own `core_charge` field on PartLine and a `core_return_status` that tracks the credit back to the supplier — this is universal in US auto parts.

## Supplier purchasing pattern

Suppliers are modeled as a separate entity, **not** as an attribute of Part — because the same SKU can come from multiple vendors at different prices.

```
Supplier (vendor)
  ├── id, name, account_number, contact_name, phone, email, address
  ├── tax_id, payment_terms, default_markup_pct
  └── integrator (PartsTech / Nexpart / WorldPac / NAPA Prolink, etc.)

PurchaseOrder (PO)
  ├── id, po_number, supplier_id, status (draft/sent/partial/received/closed)
  ├── created_by, created_at, expected_at, received_at
  ├── source_ro_id (NULLABLE — special-order POs link back to the originating RO)
  └── PurchaseOrderLine
        ├── part_id (or free-text), qty_ordered, qty_received
        ├── unit_cost, line_total
        └── target_ro_part_line_id (NULLABLE — links the received part to the exact RO line waiting on it)
```

Two PO archetypes coexist:
- **Stock replenishment PO** — auto-generated when `qty_on_hand <= reorder_point`. Receives into inventory.
- **Special-order PO** — created from inside an RO. Receives directly to the RO's PartLine, bypassing inventory. `source_ro_id` is the lineage marker.

Delivery tracking lives on PO and PO line: status, expected date, received date, qty_received (allows partial receipts), tracking number, delivery notes. Returns are modeled either as negative-qty PO lines or as a separate `SupplierReturn` table — both patterns exist; Tekmetric uses a separate "Return Order" entity.

A `PartSupplier` join table (`part_id`, `supplier_id`, `supplier_part_number`, `last_cost`, `lead_time_days`, `is_preferred`) lets the same Part be bought from multiple vendors with vendor-specific SKUs. This is the table that makes "compare prices across PartsTech / Nexpart" features possible.

## Rental fleet pattern (combined service+rental businesses)

This is a real and well-understood pattern because of **dealer service-loaner fleets** — every franchised dealer that does warranty work runs essentially a small Hertz alongside their service department. Vendors who specialize in this: TSD (now Reynolds & Reynolds), Rent Centric, VenueVision, RENTALL, Dealerware, ARSLoaner, ShopLoaner.com.

**Dominant pattern: ONE `Vehicle` table with a `vehicle_type` discriminator (and/or `is_owned_by_shop` flag).**

Reasoning:
- A loaner/rental car still needs the same service history, mileage tracking, and DVI workflow as a customer car. Duplicating Vehicle into `CustomerVehicle` and `RentalVehicle` doubles the maintenance code.
- Fleet vehicles **do** become RO subjects (oil changes between rentals, brake service before resale at 18 months) — same WorkOrder schema applies.
- The cross-cutting attributes (VIN, mileage, photos, condition reports) are identical.

Concrete shape:
```
Vehicle
  ├── id, vin, plate, make, model, year, mileage, …  (shared with customer vehicles)
  ├── ownership_type: 'CUSTOMER' | 'FLEET_RENTAL' | 'FLEET_LOANER' | 'DEMO' | 'EMPLOYEE'
  ├── owner_customer_id (NULL when ownership_type != 'CUSTOMER')
  ├── fleet_status: 'AVAILABLE' | 'RENTED' | 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'RETIRED' | NULL
  ├── daily_rate, weekly_rate, deposit  (only meaningful for fleet rows)
  └── acquired_at, retired_at
```

Renter vs Customer: **same `Customer` table**, with a separate `RentalAgreement` (a.k.a. `Booking`, `Rental`, `Reservation`) entity. The renter is just `customer_id`; the database doesn't care whether they ever did service work with you. A `driver_id` may differ from `customer_id` (one company books, an employee drives).

```
RentalAgreement
  ├── id, agreement_number, vehicle_id, customer_id (renter), driver_id
  ├── status: 'RESERVED' | 'ACTIVE' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED'
  ├── start_at, end_at, actual_return_at
  ├── pickup_location_id, return_location_id
  ├── start_mileage, end_mileage, fuel_in, fuel_out
  ├── daily_rate, days, subtotal, deposit, deposit_returned, taxes, total
  ├── damage_report_id (links to DVI-style condition report at pickup and return)
  └── insurance_doc_url, license_doc_url
```

Availability checks are `WHERE vehicle_id = ? AND status IN ('RESERVED','ACTIVE') AND tstzrange(start_at, end_at) && tstzrange(:wanted_start, :wanted_end)` — a tstzrange exclusion constraint in Postgres is the clean way and several open-source rental schemas use it.

Coastr/HQ Rental add a `DamageEvent` table tied to RentalAgreement with photo proof for pickup/return condition diff — pattern is copied from insurance ops.

## Estimates pattern

**Estimate is NOT a separate top-level entity in modern systems. It's a *state* of the Repair Order.** This is consistent across Tekmetric, Shopmonkey, Shop-Ware, AutoLeap, Mitchell1 Manager SE.

Lifecycle:
```
RO created (status=ESTIMATE)
   └─ JobLines added with proposed labor+parts; each JobLine status = 'PROPOSED'
   └─ Customer review (often via SMS/email link with per-job approve/decline buttons)
       ├─ Approved jobs → JobLine.status = 'APPROVED' → work begins
       ├─ Declined jobs → JobLine.status = 'DECLINED' (kept for "you should have done this" history)
       └─ Deferred jobs → JobLine.status = 'DEFERRED' → revived on next visit ("recommended last time")
   └─ Work performed → RO.status = 'IN_PROGRESS' → 'READY'
   └─ RO converted to invoice (often just a status change + immutable snapshot)
```

Lineage is preserved by **never deleting estimate lines** — declined and deferred items stay on the RO permanently. Mitchell1's "Job View" exposes this explicitly: Order / Revision / History tabs all hang off the same RO id. Tekmetric does the same with "estimate revisions" — each revision is a snapshot row, not a new RO.

Some legacy/UK systems do keep a separate `Quote` entity that converts to a `JobSheet` (Workshop Software AU, Garageplug). The conversion is: copy fields, link `job_sheet.source_quote_id`, mark quote `CONVERTED`. Cleaner audit trail at the cost of doubled tables. Modern cloud-native systems consolidated.

Invoice is similarly a state: `RO.status = 'INVOICED'` plus an immutable `Invoice` row that snapshots totals, tax, and line items at the moment of invoicing (so editing the RO afterward doesn't silently mutate billed amounts). Payment is its own entity (`Payment`: amount, method, processor_ref, applied_to_invoice_id) because one invoice can have multiple partial payments.

## Multi-owner partnership accounting pattern (rare)

**Direct hits in workshop SaaS: zero.** Tekmetric, Shopmonkey, Shop-Ware, Mitchell1, Workshop Software — none expose partner equity accounting. They stop at "QuickBooks / Xero export" and let the accounting tool handle ownership splits.

What this means: the partnership-accounting layer is almost universally **outside** the operational workshop system. The pattern in practice:
1. Operational system (workshop SaaS) tracks revenue, COGS, supplier invoices as flat numbers per shop entity.
2. Accounting tool (QuickBooks/Xero) holds **partner capital accounts** — one equity account per partner, plus a draw/withdrawal account each.
3. Net income at period close is allocated by formula (equal split, % split, salary-allowances-then-remainder, or the three-criteria method: salary + interest on capital + remainder).

If you wanted to model 4-way equal supplier-cost splits *inside* the app (Geleoteka's case), the minimal schema additions are:
```
Partner
  ├── id, user_id, display_name, equity_pct (0.25 for 4-way equal)
  └── capital_balance  (running total)

ExpenseAllocation              (table that joins SupplierInvoice → Partner)
  ├── id, supplier_invoice_id, partner_id, amount, allocation_basis ('EQUAL'|'EQUITY_PCT'|'CUSTOM')
  └── created_at

PartnerLedgerEntry             (append-only per-partner ledger)
  ├── id, partner_id, amount (signed), kind ('CONTRIBUTION'|'DRAW'|'EXPENSE_SHARE'|'PROFIT_SHARE')
  ├── source_table, source_id  (polymorphic ref to invoice/payment/etc)
  └── created_at
```
This keeps the operational tables clean (a SupplierInvoice is still just one row with a total) and pushes per-partner math into a side ledger that can be reconciled or exported. It mirrors how QuickBooks itself does it — single source-document row + multiple journal entries.

The closest "real" precedent is **multi-store / franchise revenue sharing** in chain shop systems: Tekmetric multi-location reports roll cross-store data so the franchise owner can see partner-attributable performance. That's the same shape: one operational row → multiple allocation entries. But it's not exposed as "partner equity"; it's exposed as "store performance".

## Real ERDs found

- **ChanMeng666/automotive-repair-management-system** (Flask/MySQL, multi-tenant): Tenant → User → Customer → Job → JobService/JobPart → Service/Part → Inventory → InventoryTransaction. ERD in repo README. Notable: **no Vehicle table** (a pragmatic small-shop simplification — vehicle data lives inside Job notes). Confirms the Job/RO-as-center pattern. https://github.com/ChanMeng666/automotive-repair-management-system
- **dydx/ShopManager** (Rails, simpler): Customer → Vehicle → WorkOrder → Repair → Part. Adds a User role enum (Service Advisor / Technician / Parts Advisor / Admin). Demonstrates the "Repair as the unit of work inside a WorkOrder" pattern (their Repair == JobLine in commercial systems). https://github.com/dydx/ShopManager
- **DaniWeb ERD discussion thread** (best normalized sketch): customer / vehicle / vehicle_owner_history / booking / work_order / mechanic / work_order_mechanic / part / work_order_part / invoice / invoice_booking / invoice_line. Explicitly separates **owner** from **booker**, and isolates **parts ↔ work_order**, never parts ↔ vehicle. https://www.daniweb.com/programming/databases/threads/183974/erd-diagram-for-a-garage-sales-and-repair-cars
- **rithinsuryasai/Car-Rental-Company-Database-Application** (rental side, MySQL EER mapped to relational): Owner / Car / CarType / Customer (individual vs company subtype) / Rental with daily_rate × noofdays vs weekly_rate × noofweeks pricing. Useful for the rental booking shape. https://github.com/rithinsuryasai/Car-Rental-Company-Database-Application
- **momintecz/CAR_RENTAL_SYSTEM** (PHP/MySQL, role-based): normalized rental schema with availability flag and dynamic rent calculation. https://github.com/momintecz/CAR_RENTAL_SYSTEM

## Synthesis for Geleoteka

1. **Keep ONE `Vehicle` table for both customer cars and the rental fleet, with a `ownershipType` enum (`CUSTOMER` | `RENTAL` | `LOANER`) and a nullable `ownerCustomerId`.** The dealer-loaner-fleet vendors have validated this pattern at scale — it lets your service team treat a rental car for its own oil change exactly the same way as a client's G-Class. Don't fork into `CustomerVehicle` / `RentalVehicle`. The cost (a few `WHERE ownershipType = 'RENTAL'` filters in fleet views) is trivial compared to the cost of duplicating service-history code.

2. **Adopt the JobLine-inside-RepairOrder pattern, not flat RO line items.** Even small G-Class jobs come bundled ("inspection + brake fluid + air filter"); customers approve/decline at the *bundle* level, not the line level. This is the single biggest divergence between toy schemas and real shop SaaS. Each JobLine carries its own status (`PROPOSED`/`APPROVED`/`DECLINED`/`DEFERRED`/`DONE`) and its own labor + parts children. Declined and deferred items stay forever — they become the next visit's upsell list.

3. **Treat estimates as a *status* of RepairOrder, not a separate model. Treat invoices as an immutable snapshot that hangs off the RO.** This is where modern systems (Tekmetric, Shop-Ware, Shopmonkey) all converged. Geleoteka's `app/actions/` Server Actions can do all four transitions (`createEstimate` / `approveEstimate` / `convertToWorkOrder` / `issueInvoice`) by mutating the same RO row plus inserting an immutable `Invoice` snapshot at the end. Keeps the data model small.

4. **Build the parts model as Catalog + Inventory + Free-text-on-RO from day one.** A specialty G-Class shop will stock < 100 SKUs (filters, fluids, common wear parts) and special-order the other 95% per-job. The schema needs (a) a `Part` catalog row, (b) an optional `InventoryItem` per location, (c) a `PartLine` on RO that can carry either `partId` or just free-text + supplier — with a status (`needed`/`ordered`/`received`/`installed`). Add a `PurchaseOrder` with optional `sourceRoId` so special-order POs link back to the RO that triggered them. This handles 99% of independent-shop reality.

5. **For the 4-way founder cost split: do NOT bake equity accounting into the operational schema.** Add a thin side-ledger: `Partner` (4 rows, one per founder, with `equityPct = 0.25`) + `ExpenseAllocation` (joins SupplierInvoice to Partner with allocated amount) + `PartnerLedgerEntry` (append-only, signed amounts per partner). Operational tables (SupplierInvoice, RepairOrder, PartLine) stay clean — they hold totals, not splits. The split layer can be regenerated from operational data + an allocation rule, which means founders can change the split policy without rewriting history. This matches how QuickBooks/Xero already model it, and keeps your option open to push the split layer into an external accounting tool later.

## Sources

- [Tekmetric — Auto Repair & Shop Management Software](https://www.tekmetric.com/)
- [Tekmetric — Estimate Building feature](https://www.tekmetric.com/feature/estimate-building)
- [Tekmetric — Inventory feature](https://www.tekmetric.com/feature/inventory)
- [Tekmetric — Inventory & Stock Management Best Practices](https://www.tekmetric.com/post/inventory-and-stock-management-best-practices-for-auto-repair-shops)
- [Shopmonkey — Auto Repair Software](https://www.shopmonkey.io/)
- [Shopmonkey — Auto Parts Inventory Management Best Practices](https://www.shopmonkey.io/blog/auto-parts-inventory-management-best-practices)
- [Shop-Ware — Inventory Management Software](https://shop-ware.com/features/inventory-management-software/)
- [Shop-Ware — Pre-Order Parts to Speed Up Workflows](https://shop-ware.com/articles/pre-order-parts-to-speed-up-auto-repair-shop-workflows/)
- [Mitchell1 Manager SE — Estimating](https://mitchell1.com/manager-se/estimating/)
- [Moxie Automotive Consulting — Parts Purchased vs Parts Usage (ShopMonkey, Mitchell1, Tekmetric Compared)](https://moxieautoconsulting.com/2025/10/06/parts-purchased-vs-parts-usage-and-how-shop-systems-track-it-shopmonkey-mitchell1-tekmetric-compared/)
- [Workshop Software (AU)](https://workshopsoftware.com/)
- [Workshop Software — CARFAX Integration](https://workshopsoftware.com/Integrations/carfax/)
- [Torque360 — Auto Repair Shop Management Software](https://www.torque360.co/)
- [Torque360 — Auto Parts Inventory Management Software](https://www.torque360.co/auto-parts-inventory-management-software/)
- [OctopusPro — Mobile Mechanic Workshop Software](https://octopuspro.com/field-service-management/mobile-mechanic-software/)
- [GaragePlug — Workshop Garage Management Software](https://www.garageplug.com/)
- [Atelio Pro — Workshop Management & Invoicing](https://www.infopro-digital-automotive.com/atelio-pro/)
- [DaniWeb — ERD for Garage Sales and Repair (forum thread)](https://www.daniweb.com/programming/databases/threads/183974/erd-diagram-for-a-garage-sales-and-repair-cars)
- [GitHub — ChanMeng666/automotive-repair-management-system](https://github.com/ChanMeng666/automotive-repair-management-system)
- [GitHub — dydx/ShopManager](https://github.com/dydx/ShopManager)
- [GitHub — rithinsuryasai/Car-Rental-Company-Database-Application](https://github.com/rithinsuryasai/Car-Rental-Company-Database-Application)
- [GitHub — Efthymiapp/Car-Rental-Management-System](https://github.com/Efthymiapp/Car-Rental-Management-System)
- [GitHub — momintecz/CAR_RENTAL_SYSTEM](https://github.com/momintecz/CAR_RENTAL_SYSTEM)
- [HQ Rental Software](https://hqrentalsoftware.com/)
- [Rent Centric — Dealership Service Loaner](https://www.rentcentric.com/products/dealership-loaner/)
- [VenueVision — Loaner Management](https://www3.venuevision.com/loaner-management/)
- [RENTALL — Dealership Loaner Software](https://www.rentallsoftware.com/dealership-loaner/)
- [ShopLoaner.com — Cloud Loaner Fleet Management](https://www.shoploaner.com/)
- [Dealerware — Mass Market Loaners](https://www.dealerware.com/articles/mass-market-loaners/)
- [FenderBender — Effectively Using a Loaner Fleet](https://www.fenderbender.com/topic-category/article/11487211/effectively-using-a-loaner-fleet-2017-09-01-fixed-ops-business)
- [ZenBusiness — How to Split Profits in a Small Business Partnership](https://www.zenbusiness.com/blog/how-to-split-profits-partnership/)
- [CliffsNotes — Partnership Accounting](https://www.cliffsnotes.com/study-guides/accounting/accounting-principles-ii/partnerships/partnership-accounting)
- [Intuit — Revenue Sharing: 4 Structures & Implementation Steps](https://www.intuit.com/enterprise/blog/financials/revenue-sharing/)
