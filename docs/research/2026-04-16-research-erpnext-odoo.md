# ERPNext + Odoo Multi-Module Data Model Research

Research date: 2026-04-12. Focus: how mature multi-module business platforms structure the relationship between CRM, operational modules, and finance — with implications for Geleoteka (G-Class workshop + parts shop + rentals + 4 founders).

---

## ERPNext

### Core entity model

ERPNext is built on the Frappe framework. Every entity is a **DocType** — essentially a table-plus-metadata definition. Schemas live as `.json` files alongside `.py` business logic in the source tree (`erpnext/<module>/doctype/<name>/`).

ERPNext does **NOT** use a single "party" entity. Instead it has three distinct master DocTypes that play customer-like roles:

- **Customer** — `erpnext/selling/doctype/customer/` (Selling module)
- **Supplier** — `erpnext/buying/doctype/supplier/` (Buying module)
- **Employee** — Frappe HR app (separate repo since v14)

These are linked to transactional documents via two field types:
- **Link** — typed reference to a specific DocType (e.g. `customer` field on Sales Order is `Link → Customer`)
- **Dynamic Link** — reference where the target DocType is itself a field value (used for polymorphic associations like Address → either Customer or Supplier)

The unifying abstraction sits in code, not data: `erpnext.accounts.party`. There is a "Party Type" concept (Customer / Supplier / Employee / Shareholder / Member) used by the **Accounts** module so that GL Entries, Payment Entries, and Journal Entries can post against any of them via a `(party_type, party)` pair. This is the *only* place ERPNext treats them as a uniform "party" — the rest of the system keeps them separate.

Inheritance hierarchy for transactional documents:
```
Document (Frappe) → TransactionBase → AccountsController → SellingController → SalesOrder
                                                         → BuyingController  → PurchaseOrder
```
Customer, Supplier, Employee themselves inherit only from `TransactionBase` / `Document` — they're masters, not transactions, and are *not* submittable.

**Verdict for question 2: ERPNext is closest to (c) — independent module-rooted records — with a thin shared "Party" facade only inside the Accounts module for ledger posting.**

### Supplier modeling

Supplier is a **completely separate DocType** from Customer, living in a different module (Buying vs Selling). Even when the same real-world company is both — e.g. a parts wholesaler who also buys back cores — ERPNext expects two records, manually cross-referenced via the child tables `Customer Number at Supplier` and `Supplier Number at Customer`.

This is the opposite tradeoff from Odoo: **duplication accepted in exchange for module independence**. The Selling team's data model isn't polluted by purchasing concerns and vice versa.

### Employee/owner modeling

- **Employee** is a third master DocType, owned by Frappe HR (now extracted to a separate app). It has its own fields (designation, salary structure, leave allocation, attendance) that have no analog on Customer/Supplier.
- **User** (`User` DocType in Frappe core) is the login identity. Linked to Employee via `user_id` field — many employees, one user max, but a user can exist without an employee (e.g. external admin).
- **Owners / shareholders** are modeled via the **Shareholder** DocType (in the Accounts module). It's a simple master with `folio_no`, equity tracking via Share Transfer DocType. Crucially, Shareholder is one of the valid `Party Type` values, so dividends, capital injections, and owner draws can post to GL against a Shareholder party.

For Geleoteka's 4-founder cost-split case: ERPNext would model each founder as a **Shareholder** (or a custom "Founder" DocType registered as a Party Type) and post owner-related transactions through the Accounts party mechanism — keeping them entirely outside the Customer table.

### Cross-module references

Three concrete mechanisms:

1. **Direct Link fields** — `Sales Order.customer → Customer`, `Sales Order.items[].item_code → Item`, `Sales Order.items[].warehouse → Warehouse`. The DB foreign-key is implicit; Frappe enforces existence at save time.
2. **Mapped documents** — `frappe.model.mapper.get_mapped_doc` builds downstream documents by copying fields with declared mappings. Example: `make_sales_invoice(source_name)` on a Sales Order produces a Sales Invoice in the Accounts module. The link is recorded both in `against_sales_order` fields on the invoice and in a global `tabSeries` / link tracker.
3. **`ignore_linked_doctypes` on cancel** — when a transactional doc is cancelled, it explicitly lists which side-effect doctypes (`GL Entry`, `Stock Ledger Entry`, `Payment Ledger Entry`) it owns and may cascade-cancel. This makes inter-module ownership boundaries readable in source.

For service appointments specifically: ERPNext does NOT have a dedicated appointment doctype in the core selling flow. The recommended pattern is to create the service as an **Item** with `is_stock_item = 0`, then issue a **Sales Order** with `order_type = "Maintenance"`. A separate Healthcare module exists with its own `Patient Appointment` doctype, but it bypasses Sales Order entirely and requires custom glue code to feed the Accounts module. **This is the canonical "service vs sales" split-brain in ERPNext.**

### Real-world breakdowns observed

- **Customer / Supplier duplication** when same legal entity plays both roles — leads to reconciliation pain and the awkward `Customer Number at Supplier` cross-reference tables.
- **Healthcare Appointment vs Sales Order parallel universe** — practitioners report that picking the appointment-native model means re-implementing invoicing logic; picking Sales Order means appointments don't feel first-class.
- **Custom doctype proliferation** — because each module owns its masters, customizations tend to add yet another sibling doctype rather than extending a shared one. Maintainable, but the schema grows wide.

---

## Odoo

### Core entity model

Odoo's central abstraction is **`res.partner`** — a single table that stores **every** business entity: customers, suppliers, vendors, employees, leads, contacts, individual people, companies, branches, even shipping addresses (modeled as child partners with `type='delivery'`). Multi-role flags:
- `customer_rank` (integer, > 0 = treated as customer)
- `supplier_rank` (integer, > 0 = treated as vendor)
- `employee` (boolean, set when an `hr.employee` is linked)
- `is_company` (boolean) and `parent_id` (recursive — partners form a tree of company→contacts→addresses)

Pre-Odoo-13 these were `is_customer` / `is_supplier` booleans; v13 replaced them with rank counters that auto-increment when the partner appears on a Sale/Purchase Order. The change reduced duplicate records but removed user-visible role checkboxes, which generated significant community confusion.

**Verdict for question 2: Odoo is a textbook (b) — central Party-as-spine, where `res.partner` is the universal reference target.**

### Supplier modeling

Same `res.partner` row, distinguished only by `supplier_rank > 0`. A purchase order's `partner_id` and a sales order's `partner_id` are foreign keys to the same table. The "Vendors" and "Customers" menus are filtered views, not separate stores.

This works elegantly when an entity is genuinely both (the recurring example: retail/wholesale where customers also sell back inventory). It breaks down when the same real-world person needs **distinct billing/payment terms per role** — Odoo's solution is multiple partner records anyway, defeating the unification.

### Employee/owner modeling

Odoo runs three overlapping models and the community calls this the **"triple identity problem"**:

| Model | Purpose | Auto-creates |
|-------|---------|--------------|
| `res.partner` | Contact identity (name, email, address) | — |
| `res.users` | Login / portal access | a `res.partner` (with `partner_id` link) |
| `hr.employee` | HR attributes (contract, payroll, leave, manager) | a `res.partner` (separate from the user's partner) |

A single physical person who is both a user and an employee ends up with **two `res.partner` rows** (one auto-created by `res.users`, one by `hr.employee`) plus a `res.users` row plus an `hr.employee` row — four records linked by `partner_id` / `user_id` / `address_home_id` fields that frequently desync.

Constraint: **one user can be linked to at most one employee per company** (enforced by SQL constraint on `hr.employee.user_id + company_id`). This blocks legitimate multi-role cases (founder who's also a contractor on a side project) and forces workarounds like duplicate user accounts — with licensing, audit, and access-control consequences.

Founders / business owners: there is no "Owner" or "Shareholder" first-class concept in core Odoo. The standard approach is a `res.partner` flagged with custom categories (`category_id` tags like "Shareholder") plus accounting partner accounts. The OCA `account_partner_owner` module exists in some forks to make owner draws/contributions cleaner, but it's not standard.

### Cross-module references

- Almost every transactional model has `partner_id = fields.Many2one('res.partner', ...)` — Sale Order, Purchase Order, Invoice, Stock Picking, MRP Order, Project, Helpdesk Ticket. This is the **CRM-as-spine** pattern in its purest form.
- Modules extend `res.partner` itself via Odoo's inheritance (`_inherit = 'res.partner'`) to add module-specific fields directly onto the partner table. Sale module adds `property_payment_term_id`, accounting module adds `property_account_receivable_id`, etc. Result: a partner record may carry 80+ fields once a typical Odoo install is loaded — the **"kitchen-sink partner" problem**.
- Stock movements reference partners for source/destination location ownership. Inventory itself lives in `stock.quant` keyed by `(product_id, location_id, lot_id, owner_id, package_id)` — `owner_id` is a partner link, allowing consigned-stock scenarios.
- Service appointments: Odoo has dedicated `calendar.event` and the **Appointments** app (`appointment.type`, `calendar.event` extension) — appointments are **separate** from Sale Order. Bridging to invoicing requires the Sales/Subscription apps and explicit configuration of products to bill from appointments. Same split-brain pattern as ERPNext.

### Real-world breakdowns observed

- **Triple-identity desync** — email changed on `res.users` propagates to its partner but not to the `hr.employee.work_email`, leading to "I updated it, why is HR still wrong?" tickets.
- **Loss of role distinction in v13** — users couldn't find Is Customer / Is Vendor checkboxes after upgrade; the rank-based system had no UI surface, requiring developer-mode access.
- **Bug class: parent_id not set** — auto-created partners (e.g. when adding `hr.employee`) sometimes fail to set `parent_id` to the company partner, leaving orphan records. Open issue #188197 against odoo/odoo demonstrates this in v17.
- **Customization brittleness** — overriding `res.partner.create()` to add behavior for "students" forces every override to re-check what kind of partner is being created. The single-table polymorphism leaks into every extension.
- **One-user-one-employee constraint** — blocks legitimate multi-role scenarios; standard advice is "create another user account", which breaks audit trails.

---

## Synthesis — takeaways for Geleoteka

1. **Don't put the four founders in the Customer table.** Both platforms agree: owners are a distinct concept. ERPNext makes them a separate `Shareholder` master that's still postable in the GL via the Party Type abstraction. Odoo's failure mode (forcing them onto `res.partner` with category tags) generates exactly the kind of muddle you want to avoid. For Geleoteka, model `Founder` as its own table with a clean link to financial transactions for cost-split tracking — do not graft it onto the customer model.

2. **Decide explicitly between (b) party-spine and (c) module-independent — don't drift into "accidentally (b)".** Geleoteka is small enough that ERPNext's "separate masters per module + party facade only at the GL layer" is probably the better fit. The Odoo `res.partner` approach pays off when the same entities genuinely play many roles in your business — which a workshop-with-rentals doesn't really need (the rental customer and service customer overlap heavily, but supplier overlap is minimal). One central `Customer` table referenced by service appointments, parts orders, and rental bookings is fine. Suppliers should be a separate `Supplier` table.

3. **Service appointments and parts orders should NOT share a base `Order` table.** Both ERPNext and Odoo tried variants of this and both ended up with a recognized split-brain problem — services modeled either as Items-on-a-Sales-Order (loses appointment-native UX) or as a parallel Appointment doctype (loses invoicing integration). The pragmatic answer in both ecosystems is two distinct transactional tables (`ServiceAppointment`, `PartsOrder`, `RentalBooking`), each linking to the same `Customer`, with a thin shared concept at the financial layer (an `Invoice` or `LedgerEntry` table that polymorphically references whichever source document generated the receivable).

4. **Make the inter-module boundary explicit in code, not implicit.** ERPNext's `ignore_linked_doctypes` list at cancel time and the `make_*` mapper functions are the readable parts of its inter-module contract. The Odoo `_inherit = 'res.partner'` pattern is the unreadable part — modules silently extend the central table from anywhere. Whatever Geleoteka chooses, document at each cross-module reference: who owns the source-of-truth, what cancellation/deletion semantics apply, and which side a backfill goes from.

5. **A `User` is a login identity, not a person.** Both platforms keep `User` separate from `Customer` / `Employee` / `Founder` — and both have bugs and workarounds at the seams between these. For Geleoteka, do this from day one: `User` carries email + password + role; everything else (founder profile, customer profile, employee profile if added later) is a separate row linked by `userId` (nullable — many customers will never log in, many users may not be founders).

---

## Sources

- [ERPNext Customer source code (GitHub)](https://github.com/frappe/erpnext/blob/develop/erpnext/selling/doctype/customer/customer.py)
- [ERPNext Supplier source code (GitHub)](https://github.com/frappe/erpnext/blob/develop/erpnext/buying/doctype/supplier/supplier.py)
- [ERPNext Sales Order source code (GitHub)](https://github.com/frappe/erpnext/blob/develop/erpnext/selling/doctype/sales_order/sales_order.py)
- [ERPNext for Service Organization (docs)](https://docs.erpnext.com/docs/v13/user/manual/en/selling/articles/erpnext-for-services-organization)
- [DocType Development - ERPNext (Mintlify)](https://www.mintlify.com/frappe/erpnext/developers/doctype)
- [DocType (Frappe docs)](https://docs.frappe.io/erpnext/doctype)
- [ER Diagram for ERPNext (Google Groups discussion)](https://groups.google.com/g/erpnext-developer-forum/c/1RDF7hzfdho/m/eEhmpaajKcAJ)
- [ClefinCode - Service-Centric E-Commerce on ERPNext](https://clefincode.com/blog/global-digital-vibes/en/designing-a-service-centric-e-commerce-platform-with-erpnext)
- [Odoo res.partner concept (Technaureus)](https://www.technaureus.com/blog-detail/odoo-partner-respartner-concept-2)
- [Odoo issue #21650 — Contact, Employee, User relations](https://github.com/odoo/odoo/issues/21650)
- [Odoo issue #188197 — res.partner created via hr.employee does not set parent_id](https://github.com/odoo/odoo/issues/188197)
- [Odoo issue #39144 — Share partner as Sale Customer and Purchase Vendor](https://github.com/odoo/odoo/issues/39144)
- [Odoo forum — A user cannot be linked to multiple employees in the same company](https://www.odoo.com/forum/help-1/the-operation-cannot-be-completed-a-user-cannot-be-linked-to-multiple-employees-in-the-same-company-251656)
- [Odoo forum — Customer vs Supplier confusion using the same class](https://www.odoo.com/forum/help-1/i-am-littile-confused-because-of-supplier-and-customer-98175)
- [Odoo forum — Where are Is Customer/Is Vendor checkboxes in Odoo 13?](https://www.odoo.com/forum/help-1/where-are-is-customeris-vendor-checkboxes-in-odoo-13-contacts-157566)
- [Odoo forum — res.partner / res.user relationship and inheritance](https://www.odoo.com/forum/help-1/what-is-the-relationship-between-respartner-and-resuser-if-i-override-respartner-to-create-students-will-users-be-automatically-created-116634)
- [Contacts / Partners in Odoo (odootricks.tips)](https://odootricks.tips/about/odoo-applications/contacts-partners-in-odoo/)
