# Salesforce + Dynamics CRM Data Model Research

Date: 2026-04-12
Scope: How the canonical CRM platforms model the customer "spine" (Account / Contact / Party), how they extend it to operational modules, and what the lessons are for a small multi-module platform like Geleoteka.

---

## Salesforce

### Account vs Contact

**The distinction:**
- **Account** = an organization (company, household, institution).
- **Contact** = a person, almost always linked to an Account.
- **Opportunity, Case, Order, Contract, Asset** all anchor on `AccountId` first, with `ContactId` as a secondary lookup.

**Why the split exists (history):**
Salesforce was born in 1999 selling B2B sales-force-automation. The world it modelled was: "Acme Corp" buys from you, and you talk to "Jane Smith at Acme Corp." Account holds the commercial relationship; Contact holds the human relationship. This works perfectly when you sell to companies and sales cycles span multiple stakeholders (decision maker, influencer, economic buyer, technical buyer).

**When the distinction matters:**
- Multi-stakeholder B2B sales (need many Contacts per Account, with roles).
- Account-level reporting (revenue per company, support load per company).
- Hierarchies (parent-child accounts: Acme Holdings -> Acme EU -> Acme Germany).
- Account teams (sales rep + SE + CSM all assigned at Account level).

**When it creates friction (B2C / sole-proprietor):**
- A bank customer is a person, not a company. Forcing the rep to create "Jane Smith Household" Account + "Jane Smith" Contact doubles data entry and clutters reports with empty company fields.
- Mass-market B2C (retail, insurance, mortgage, wealth-mgmt, healthcare) hated the Account/Contact split so much that Salesforce had to bolt on "Person Accounts" in the early 2000s after a banking client demanded it.
- Every report has to decide: group by Account or by Contact? Wrong choice = wrong number.
- AppExchange apps split into camps: some support Person Accounts, some don't. Email-marketing tools especially tend to sync only to Contact.

### Account-as-spine pattern (everything points to Account)

Standard objects with an Account lookup:
| Object | AccountId optionality (DB level) | Logical reality |
|---|---|---|
| Opportunity | Optional | Almost always set; reports break without it |
| Case | Optional | Usually set (support context) |
| Contract | **Required** | Hard FK |
| Order | **Required** | Hard FK |
| Asset | One of AccountId or ContactId required | XOR constraint |
| Contact | Optional (Private Contacts allowed) | Logically required in practice |

**Trade-off of making AccountId required:**
- *Pro:* Every transactional record has a guaranteed customer anchor -> rollups, sharing, territory assignment, ownership all work uniformly. Reports never have orphaned rows. Enterprise sharing model (which is Account-driven) covers everything automatically.
- *Con:* You can't easily model anonymous / pre-customer activity (an inbound web lead, a walk-in repair, a one-off cash sale). Salesforce's answer: the **Lead** object — a deliberately separate "pre-Account" buffer that gets *converted* into Account+Contact+Opportunity later. This is why Salesforce has Lead as a first-class object with its own conversion API: the Account-required spine forces you to invent a "before they exist" zone.
- *Con:* B2C friction (handled via Person Accounts).
- *Con:* Internal-only objects (an internal task, an inventory event) feel awkward — they pull in an Account just to be filed.

### Person Accounts (the B2C hack)

**What it really is:** Salesforce kept the Account/Contact two-table model under the hood and just glued one Account row to one Contact row, presenting them as a single record in the UI. A flag `IsPersonAccount = true` marks them.

**Mechanics:**
- One Person Account = 1 Account row + 1 Contact row (stitched). You see one record; you pay for two.
- Storage cost is roughly 2x per customer.
- Once enabled at the org level, **cannot be turned off**. Org-wide setting, irreversible.
- Sharing model must be set to "Private" with Contacts "Controlled by Parent" before activation.
- Person Accounts and Business Accounts can coexist in the same org (mixed B2B/B2C).
- Every Account flow/trigger/automation will run on Person Account create/edit -> performance hit if heavy automation exists.
- Many AppExchange packages have spotty Person Account support.

**When it applies:** wealth management, retail banking, insurance, mortgage, healthcare patients, individual consumer SaaS — any industry where the natural customer entity is a single human and there's no underlying company. Default in Salesforce industry clouds (Financial Services Cloud, Health Cloud, Consumer Goods Cloud).

**Alternative: Household Account model** — instead of Person Account, use a normal Account named "Smith Household" with multiple Contacts (mom, dad, kids). Used by nonprofits and high-touch B2C (auto dealers, agencies).

### Role-based party model (does Salesforce use it?)

**Short answer: not in the core CRM, only in Data Cloud / CDP.**

The "true" party model — one record represents an entity, and Customer / Supplier / Partner / Employee are *roles* attached to it — is **not** how Salesforce Sales Cloud works. In Sales Cloud:
- Account is *the* customer-side entity. Suppliers and partners get modelled by abusing Account (with a "Type" picklist) or by separate custom objects.
- Salesforce does have **Partner Accounts** (a flag on Account), **Account Contact Relations** (allows a Contact to be linked to multiple Accounts with role labels), and **Contact-to-Multiple-Accounts** (an opt-in feature for partner/channel scenarios).
- The intent is solved by *adding more relationship rows*, not by a Party super-table.

**Where Salesforce did adopt a real party model: Customer 360 / Data Cloud (CDP).**
- The **Individual** object is the unified party record.
- **Party Identification** (many-to-one to Individual) holds external IDs across systems (LinkedIn ID, marketing key, CRM contact ID).
- **Contact Point Email / Phone / Address** are separate child objects (many per Individual).
- **Party Role Relationships** describe how parties relate (employer, household member, decision-maker, etc.).
- This sits *above* Sales Cloud's Account/Contact and is used for cross-cloud identity resolution — not as the operational schema.

**Practical impact:** if you adopt a true party model from day one, you avoid the "is this person a customer or a supplier or both?" duplication problem. Salesforce's Industry Clouds (Financial Services Cloud, especially) lean on this — a single individual can be a client, an advisor's prospect, and a beneficiary on someone else's policy at once.

### Custom modules extending core (the "rental fleet" question)

Salesforce's extensibility ladder, in order of effort:

1. **Custom fields on standard objects** — add `RentalCustomerSegment__c` to Account. Cheapest, fastest. Counts against per-org field limits.
2. **Custom objects with lookup/master-detail to Account** — create `RentalVehicle__c`, `RentalAgreement__c`, `RentalReturn__c`, each with `Account__c` lookup. The Account remains the spine; your module hangs off it. This is the dominant pattern.
3. **Managed package (1st-party or AppExchange)** — namespace your custom objects, version them, distribute via AppExchange. Same Account-anchor pattern, just packaged. Examples: nCino (banking), Veeva (life sciences), Conga (docs) — all giant industries built as managed packages on top of Account.
4. **Industry Cloud** — Salesforce-built vertical packages (Financial Services Cloud, Field Service, etc.) that ship with their own custom objects, page layouts, and (sometimes) data model extensions but always sit on Account/Contact (or Person Account).
5. **External Objects (Salesforce Connect)** — surface data from an outside system (SAP, custom DB) as if it were a Salesforce object, lookup to Account. Used when the rental fleet really lives in a separate inventory system.

**The unifying rule:** custom modules join the spine via `AccountId` (and often `ContactId`). The spine is owned by Salesforce; modules attach to it.

### How operational modules tie in (Field Service / Service Cloud / CPQ)

**Service Cloud:** core object is **Case**, which has `AccountId` + `ContactId`. Cases roll up to Account for "customer health." Entitlements, Service Contracts, Milestones all attach via Account. Knowledge articles, omni-channel routing, and case feeds are bolted around the Case-> Account spine.

**Field Service (FSL):** adds Work Order, Work Order Line Item, Service Appointment, Service Resource (technician), Service Territory, Asset, Maintenance Plan, Product Required. Work Order has lookups to Account, Contact, Asset, and Case — multiple anchors back to the spine. Asset itself is an Account-anchored object representing the installed thing being serviced.

**CPQ (Configure-Price-Quote):** adds Quote, Quote Line, Product Configuration, Price Rule, Product Option, Bundle structures. Quote attaches to Opportunity (which attaches to Account). Standard quote-to-cash flow: Opportunity -> Quote -> Order -> Contract -> Asset, all sharing the same `AccountId` for sharing/reporting consistency. CPQ also uses "twin fields" — same API name on related objects -> values auto-flow Quote -> Order -> Contract.

**Boundary management:**
- Modules add their own custom objects in their own namespace (e.g. `SBQQ__Quote__c` for CPQ).
- They add managed custom fields to standard objects (Account, Opportunity, Product) to extend behaviour without forking the schema.
- The "core" remains Account/Contact/Opportunity/Case; modules are the spokes.
- **Boundary stress:** per-org governor limits (custom object count, total fields per object, SOQL row limits, daily API calls) are the real wall. Heavy enterprises hit it and either go multi-org or push subsystems out to external apps connected via API.

### Real-world breakdowns

- **Regulated industries fled to Person Accounts** because the B2B model literally didn't fit. Salesforce built FSC, Health Cloud, etc. on Person Accounts as a result.
- **Multi-org sprawl** at large enterprises: hitting custom-object limits, governor limits, or org-wide automation conflicts forces splitting into multiple Salesforce orgs partitioned by business unit. Costly and disruptive — design for single-org longevity if possible.
- **Lead vs Account/Contact split** is famously confusing. Marketing creates Leads; Sales converts to Account+Contact+Opportunity. Duplicate management across the boundary is a perennial admin task.
- **Account Contact Relations** (added later) was the admission that the strict 1-Contact-to-1-Account model breaks for partner/channel/consultant scenarios.
- **Person Accounts double storage** -> companies with millions of consumer records pay 10–15% annual storage overage premium.

---

## Dynamics 365

### Account vs Contact

Same conceptual split as Salesforce in the Customer Engagement (CE) apps:
- **Account** = organization.
- **Contact** = person, typically (but not necessarily) linked to an Account via `parentcustomerid` (which is a polymorphic "Customer" lookup that can point to either Account or Contact).
- Opportunity, Case, Quote, Order, Invoice all have a polymorphic `customerid` that can target Account *or* Contact directly. This is a key Dynamics divergence from Salesforce: Dynamics does not need a "Person Account" bolt-on because its core "Customer" reference is *already* polymorphic.

### Account-as-spine pattern

Less rigid than Salesforce. Because the `customerid` lookup is polymorphic (Customer = Account OR Contact), Dynamics doesn't enforce "everything points to Account." Trade-off:
- *Pro:* No Person Account hack needed; B2C just sets `customerid` to a Contact.
- *Con:* Reports and rollups must handle the polymorphism (filter or branch on type). Account-level aggregation requires walking through Contacts when the customer is a person.
- Workflow, security roles, and business units still work uniformly because the polymorphic field is first-class.

### Person Accounts equivalent

Dynamics doesn't have Person Accounts because it never needed them — the polymorphic Customer field solves the same problem more elegantly. The Contact entity *is* the B2C customer record.

In **Customer Insights / Customer Service** the Contact entity is reused for portal users and B2C customers — the table represents "a person, portal user, B2C customer, or vendor" all in one schema. The role is implicit and deduced from related transactions.

### Role-based party model (Dynamics' big architectural answer)

This is where Dynamics is genuinely different and arguably ahead of Salesforce.

**Finance & Operations (F&O / formerly AX) has always had a Party model in the Global Address Book (GAB).**

- `DirParty` is the master entity. Subtypes: `DirPerson`, `DirOrganization`.
- A Party can hold many **roles**: Customer, Vendor, Worker (Employee), Competitor, Prospect, Contact, Bank, Applicant.
- One Party row = one real-world entity. The same Fabrikam record can be a customer of you in one company, a vendor to you in another, and a competitor in a third — same master data (name, addresses, contact points), shared and consistent.
- Address and electronic-address (email/phone) are stored against the Party, not the role -> change once, reflects everywhere.
- Multiple legal entities can each have their own Customer/Vendor account, all stitched to the same Party.

**Dual-write Party model (CE + F&O bridge):**
Microsoft introduced `msdyn_party` and `msdyn_contactforparty` tables in Dataverse to bridge the CE world (Account/Contact) with the F&O world (Customer/Vendor/Party).
- New `msdyn_party` table — type = organization or person.
- Every Account or Contact auto-gets a Party record on create.
- `msdyn_contactforparty` is an N:N table allowing a Contact to be related to multiple Customers/Vendors/Accounts with role context.
- Setting Party ID on a Contact assigns it to all roles of the selected party.

**Practical impact:**
- A supplier who is also a customer is *one* record in F&O, not two with sync hacks.
- Address changes propagate automatically to all roles.
- Audit and KYC are simpler — one identity, many roles.
- The price: more abstract schema, more joins, harder to reason about in ad-hoc reports. F&O is famously denser/harder than CE for new developers.

### Custom modules extending core

Dynamics extends via:
1. **Custom columns** on standard tables (Account, Contact, Customer).
2. **Custom tables** in **Dataverse** with lookups to standard tables — equivalent of Salesforce custom objects. Solutions package them.
3. **Power Platform solutions** — versioned, exportable bundles of tables, columns, flows, model-driven apps. Equivalent of managed packages.
4. **First-party apps** (Field Service, Project Operations, Sales Insights) layer custom tables that lookup to Account/Contact/Customer.
5. **Common Data Model (CDM) / Microsoft Cloud for X** — vertical accelerators (Cloud for Healthcare, Financial Services, Nonprofit, Retail) that ship pre-built tables and relationships extending the spine.

The "rental fleet" equivalent: build a Dataverse solution with `RentalVehicle`, `RentalAgreement`, etc., each with a Customer (polymorphic) lookup.

### Tying into operational modules

- **Field Service (D365)**: Work Order, Bookable Resource, Booking, Asset, Agreement, Incident Type. Work Order has Account + Contact + Asset. Mirror image of Salesforce FSL.
- **Customer Service**: Case (called "Incident" in some docs), Knowledge Article, SLA, Entitlement. Same Account/Contact spine via polymorphic Customer.
- **Sales (CPQ-equivalent)**: Lead, Opportunity, Quote, Order, Invoice. Same flow, same polymorphic anchor.
- **Project Operations** and **Field Service** in F&O bridge to GL, Inventory, Procurement — and that bridge is precisely where the Party model earns its keep, because the same external party flows through CRM-side and ERP-side modules without duplication.

### Real-world breakdowns

- **CE/F&O split** is the famous pain point. Two data models, bridged by dual-write, with two different identity philosophies (CE = Account/Contact, F&O = Party + Roles). Microsoft has been working since ~2019 to converge them via Dataverse. Still messy in 2026.
- **Polymorphic Customer field** is more flexible than Salesforce's Account-required model but reports/PowerBI dashboards must explicitly handle the type discriminator.
- **Solution layering** (managed solutions stacking on managed solutions) creates upgrade headaches very similar to Salesforce managed packages.

---

## Synthesis for Geleoteka

Context: single Russian auto workshop, four founders, modules = service (workshop bookings) + parts (shop) + rentals + admin/owner panel + client portal. Customers are mostly individuals (B2C) with some fleet customers (B2B). Founders hold equity, work as managers, drive the company.

**1. Use a Party-style core. Don't copy Salesforce's Account/Contact split.**
You are 90% B2C. A Salesforce-style Account-required spine would force "Иванов Иван Household" Account rows that add zero value. Use one `Party` table (or call it `Customer`) with a `kind` discriminator (`PERSON` | `ORGANIZATION`). Optional `parent_party_id` for "this person belongs to that company" (fleet driver -> fleet owner). This is Dynamics' polymorphic Customer flattened into a single table — the simplest version of the right idea.

**2. Roles are labels, not separate entities.**
A founder is simultaneously: owner (equity), employee (works the bay), customer (drives a personal G-Class), and possibly a supplier (sells used parts back). Don't make four tables. Make one `Party` row per real human, plus a `party_role` many-to-many with role types (`OWNER`, `EMPLOYEE`, `CUSTOMER`, `SUPPLIER`, `MANAGER`). This is exactly the F&O Global Address Book pattern, scaled down. Saves you the "duplicate founder records" problem you'd otherwise have in two years.

**3. Anchor every operational record on `party_id`, but don't make it required everywhere.**
- Bookings, work orders, invoices, parts orders, rental agreements -> `customer_party_id` required.
- Walk-in / cash sale / anonymous quote -> allow `party_id` nullable, or auto-create a stub Party with `kind=PERSON, name='Walk-in'`. (Salesforce's Lead object solves this with a separate buffer; you don't need that complexity — nullable + later-stitch is fine at your scale.)
- Internal records (inventory movements, shift logs) -> no party_id at all. Don't force the spine where it doesn't belong.

**4. Modules attach via lookup, not by extending core tables.**
Don't add `rental_*` columns to your `party` table. Make `rental_vehicle`, `rental_agreement`, `rental_return` tables with `customer_party_id` FK to Party. Same for parts (`parts_order`, `parts_order_line`) and service (`booking`, `work_order`, `service_record`). The Party row stays clean; modules orbit it. This is the Salesforce custom-object pattern done right at small scale.

**5. Plan for the "supplier who is also a customer" case from day one.**
Russian auto-parts ecosystem: your parts supplier might bring you their G-Class for service. Your founder-owner buys parts from the shop. Your fleet rental customer might supply you with consumables. If `Customer` and `Supplier` are separate tables (the naive ERP split), every one of these creates duplicate records and reconciliation pain. With a single `Party` + role labels you sidestep this entirely. This is the single biggest data-modelling lesson from both Salesforce (which got it wrong in core) and Dynamics (which got it right in F&O).

**Bonus: what Salesforce would do differently if starting today**
Practitioner consensus, paraphrased: ship a true Party + Roles model from day one (like F&O has), with Account/Contact as *views* over Party, not as primary tables. Make `customerid`-style polymorphic lookups standard everywhere. Don't bolt on Person Accounts as an irreversible flag — bake B2C into the core. That's exactly the model Geleoteka should adopt now, while the schema is small and changeable.

---

## Sources

- [Salesforce Person Accounts - Pros and Cons (Salesforce Ben)](https://www.salesforceben.com/salesforce-person-accounts-pros-and-cons/)
- [Salesforce Account Object Best Practices (Salesforce Ben)](https://www.salesforceben.com/best-practices-salesforce-account-object/)
- [Convert Salesforce Business Accounts to Person Accounts (Salesforce Ben)](https://www.salesforceben.com/convert-salesforce-business-accounts-to-person-accounts/)
- [Household account model vs Person account (SaltClick)](https://www.saltclick.com/blog/household-account-model-vs-person-account)
- [Salesforce Person Account and Individual Object (Mitul Patel, Medium)](https://medium.com/@mituldpatel/salesforce-person-account-and-individual-object-1cd18d71e975)
- [Salesforce Data Model Notation (developer.salesforce.com)](https://developer.salesforce.com/docs/platform/data-models/guide/salesforce-data-model-notation.html)
- [Sales Cloud Overview - Data Model Gallery (developer.salesforce.com)](https://developer.salesforce.com/docs/platform/data-models/guide/sales-cloud-overview.html)
- [Object Reference for the Salesforce Platform - Data Model](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/data_model.htm)
- [Salesforce Contracts - Data Model Gallery](https://developer.salesforce.com/docs/platform/data-models/guide/salesforce-contracts.html)
- [Salesforce Data Model Deep-Dive (Syncari)](https://syncari.com/blog/salesforce-data-model/)
- [Master Your Salesforce Data Model (Noltic)](https://noltic.com/stories/salesforce-data-model-a-complete-guide)
- [Salesforce Party Data Model (Salesforce Help)](https://help.salesforce.com/s/articleView?id=sf.c360_a_party_data_model.htm)
- [CDP Party Data Model (architect.salesforce.com)](https://architect.salesforce.com/diagrams/template-gallery/cdp-party-data-model)
- [Party Identification in Data Cloud (Salesforce Ben)](https://www.salesforceben.com/party-identification-in-data-cloud-your-complete-set-up-guide/)
- [Party Data Models: Comprehensive Guide (Hevo)](https://hevodata.com/learn/party-data-model/)
- [Salesforce CPQ Object Model PDF (Mark Cane / Audit9)](https://audit9.blog/wp-content/uploads/2018/03/salesforce-cpq-object-model.pdf)
- [Salesforce CPQ Data Model (cpqdevelopers.com)](https://cpqdevelopers.com/salesforce-cpq-data-model/)
- [Salesforce Service Cloud Data Model Guide (Folio3)](https://crm.folio3.com/blog/guide-to-salesforce-service-cloud-data-model/)
- [Audit9 - Salesforce Data Modelling tag](https://audit9.blog/tag/data-modelling/)
- [Party and Global Address Book - Dynamics 365 F&O (Microsoft Learn)](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/dual-write/party-gab)
- [Dataverse customers, vendors and contacts with dual-write (Dynamics community)](https://community.dynamics.com/blogs/post/?postid=21c9f6d8-83bb-ee11-92bd-000d3a7e795a)
- [Customer entities (account, contact) - Dynamics 365 (Microsoft Learn)](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customer-entities-account-contact?view=op-9-1)
- [Contact table/entity reference - Dynamics 365 (Microsoft Learn)](https://learn.microsoft.com/en-us/dynamics365/developer/reference/entities/contact)
- [Set up vendor accounts - Dynamics 365 SCM (Microsoft Learn)](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/set-up-vendor-accounts)
- [Create a unified business contact profile - Customer Insights (Microsoft Learn)](https://learn.microsoft.com/en-us/dynamics365/customer-insights/data/b2b/data-unification-contacts)
