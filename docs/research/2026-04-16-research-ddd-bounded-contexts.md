# DDD Bounded Contexts for Multi-Module Web Apps

Research for Geleoteka (Next.js 16 + Prisma monolith, 27 models, 4 conceptual modules: Service, Parts, Rentals, Procurement). Critical lens applied — DDD is not assumed correct by default.

---

## Bounded context vs module distinction

A **module** is a code-organisation unit (folder, package, namespace). A **bounded context** is a *linguistic and modelling* boundary: the same word ("Customer", "Order", "Vehicle") legitimately means different things inside it. Modules are how you ship bounded contexts; the two only collapse into one decision when team and code boundaries align.

The DDD literature is clear that **total unification of a domain model across a large system is neither feasible nor cost-effective** (Evans, repeatedly cited). The canonical example: Sales `Customer` cares about lead score, purchase intent, sales rep; Support `Customer` cares about ticket history, SLA, incident timeline. Forcing one shared `Customer` table produces a "compromise model that satisfies no one well" — a bloated entity with optional columns nobody owns.

**The core trade-off: shared entity vs duplicate-with-sync**

| Axis | One shared `Customer` | `RentalCustomer` + `ServiceCustomer` (sync via events) |
|---|---|---|
| DRY | High | Low (duplicated identity, name, phone) |
| Coupling | High — schema change ripples to every module | Low — each module evolves independently |
| Query convenience | Trivial joins | Requires read models or API calls |
| Team autonomy | Blocked on shared-schema review | Unblocked |
| Right answer when… | One team, one definition, one lifecycle | Two teams, divergent attributes, different lifecycles |
| Cost paid | Coupling cost (felt later, in refactors) | Duplication cost (felt immediately, in code volume) |

Evans' formulation: you choose **which kind of complexity to pay for**. Shared = cheaper to write, more expensive to change. Duplicated-with-sync = more expensive to write, cheaper to change.

The pragmatic heuristic from the literature: **the cost of integrating bounded contexts can exceed the cost of duplicating the entity.** If two modules' definitions of "Customer" already diverge in 3+ attributes, or one module needs lifecycle events the other doesn't (lead → opportunity → won, vs guest → registered → returning), duplicate. If they genuinely share identity + 2-3 fields and change together, share.

For a single-team monolith: the team-autonomy benefit of duplication evaporates, so the calculus tips toward sharing. The remaining justification for splitting is *semantic divergence* — when the word "Customer" is starting to lie.

---

## Shared kernel — what belongs

A shared kernel is a deliberate, **small** set of code/data shared by multiple bounded contexts. The DDD definition explicitly calls it "between teams" — the pattern was formulated to coordinate cross-team work, not to organise a single team's codebase.

**What goes in (consensus from Vernon, Khononov, DDD-practitioners.com):**

- **Identity primitives** — `UserId`, `Money`, `Currency`, `Email`, `PhoneNumber`. Value objects with no behaviour beyond validation.
- **The User/Account principal** — *only* if every module truly authenticates against the same user record. Even then, modules layer their own profile data on top (cabinet profile vs admin profile vs supplier profile).
- **Cross-cutting reference data that genuinely never diverges** — currencies, ISO country codes, units of measure.

**What stays out:**

- **Anything with rich behaviour** (Customer, Order, Invoice). These will sprout module-specific methods and the shared kernel becomes a fight zone.
- **Generic plumbing** (BaseEntity, Result<T>, IdGenerator). These are *framework utilities*, not a Shared Kernel — calling them one inflates the pattern's perceived value and licenses adding more.
- **Anything growing.** A growing shared kernel signals you should either (a) merge the contexts entirely, or (b) push the entity out as its own bounded context with a published API.

**Single-team rule:** if you reach for a shared kernel, the entity belongs in *one* module, not "shared." A shared kernel without team boundaries to defend is just a shared schema by another name.

---

## Anti-corruption layer — when overkill

An ACL is a translation layer between two contexts so neither leaks its model into the other. Standard pattern: the consuming context defines what *it* needs, then has an adapter that translates from the upstream model. Used when the upstream is external/legacy/unstable, or when the downstream is a core subdomain that must stay pure.

**When ACL is right:**
- Talking to a third-party API (payment provider, SMS gateway, shipping API).
- Talking to a legacy/separate system you don't own.
- Two contexts owned by different teams with different release cadences.
- The upstream model is "inefficient or inconvenient" for the downstream's needs (Vernon's wording).

**When ACL is overkill (single-team monolith):**
- Two modules in the same repo, same deploy, same team, same week.
- The "translation" would be a 1:1 field copy.
- You don't actually need the contexts to evolve independently.

**Practitioner reality:** in a single-team Next.js monolith, an ACL between two of *your own* modules is almost always over-engineering. It introduces 3 layers (DTO, mapper, port interface) to solve a coordination problem that doesn't exist when one person owns both sides. The right pattern at this scale is a **thin module facade** (one exported function per use-case) that does whatever mapping is needed inline. You can promote it to a real ACL the day a second team takes over one of the modules.

---

## Core vs supporting subdomain identification

DDD distinguishes three subdomain types:

- **Core** — your competitive advantage. Where bespoke modelling pays off. Build, don't buy.
- **Supporting** — necessary infrastructure unique to your business but not differentiating. Build cheaply.
- **Generic** — solved problems (auth, payments, email). Buy or use a library.

**For Geleoteka — the honest classification:**

| Module | Subdomain type | Reasoning |
|---|---|---|
| **Service (workshop appointments, masters, estimates)** | **CORE** | This is the G-Class specialist proposition. Booking flow, master matching, estimate-to-appointment conversion, loyalty against service spend — these *are* the business. |
| **Parts shop** | Supporting | Necessary to capture wallet share but not differentiating; many shops sell parts. The product list is small, the workflow is generic ecommerce. |
| **Rentals** | Supporting (or arguably a separate core if it's a real revenue line) | If rentals are 5% of revenue and a side amenity → supporting. If they're a 30%+ revenue line with their own customer base → start treating as a parallel core, with its own bounded context. |
| **Procurement (suppliers, founders, contributions)** | Supporting/internal | Internal back-office. No customer ever sees it. |

**Why this matters for the data model:** core deserves rich modelling, supporting deserves boring CRUD, internal deserves the simplest schema possible. The mistake is the inverse — over-modelling Procurement (because founders are a vivid concept) while under-modelling Service (because appointments "feel obvious"). Spend complexity budget on the core.

A second consequence: the core subdomain is the one that should resist coupling pressure from the others. If Parts wants Service to add a column to `Appointment` for a parts-fulfilment field, the answer is "no — Parts owns that." Core protection trumps DRY.

---

## Single-database multi-module patterns

Three options, ranked by isolation:

1. **Schema-per-module** (`service.appointment`, `parts.order`, `rentals.booking`) — separate Postgres schemas, separate roles, separate Prisma multi-schema configs.
2. **Shared schema with module-prefixed tables** (`service_appointment`, `parts_order`).
3. **No separation** — one `public` schema, table names mostly without prefixes.

**The practitioner consensus** (Milan Jovanović, Mehmet Ozkaya, the official Postgres wiki) is: **schema-per-module wins for any non-trivial modular monolith**, because:

- Schemas allow same-name tables across modules (`service.customer` vs `rentals.customer`) without collision — matches DDD bounded contexts naturally.
- Postgres roles + grants make boundaries **enforceable**, not aspirational. A rogue `JOIN` across module boundaries fails at the DB level.
- Eases extraction to a separate service later (the schema already names a clean cut line).
- It's the approach the Postgres project itself recommends.

**The honest caveats:**

- Schemas don't make queries faster. They improve *human* performance (clearer intent, fewer mistakes).
- "Don't over-engineer. Stick with public. Schemas shine when complexity is real, not hypothetical." — for a 27-model monolith with one developer, the public schema is fine *until* you can name a concrete cross-module pain.
- Prisma's multi-schema support exists but adds friction (multi-file schema, `@@schema()` everywhere, migration coordination). The juice has to be worth the squeeze.

**Recommendation for small monoliths**: stay in `public` schema, **but** discipline yourself to module-prefix table names where the conceptual boundary is real (`PartOrder`, `RentalBooking`, `SupplierOrder` — note Geleoteka already does this for some). Promote to schema-per-module when (a) the team grows to 3+, or (b) a module is a candidate for extraction, or (c) cross-module queries are starting to feel "wrong" the way they did for the Trello/Asana/Jira author who coined "prefixes are a workaround."

---

## Critique of "CRM as spine" force-fit

The "everything points to Customer" pattern is the most common data-modelling default and the most common source of structural pain at year 2. It fails for predictable reasons:

**1. CRM's `Customer` is a sales-pipeline concept.** It's shaped for lead → opportunity → close. Billing needs a *legal entity* (tax ID, payment terms, parent/subsidiary). Support needs a *contracted service consumer*. Workshop needs a *vehicle owner* (who may or may not be the payer). Forcing all of these into one table produces a row with 40 columns where most are null for any given context.

**2. Some entities aren't customer transactions at all.** An invoice between two business owners (Geleoteka's `FounderContribution` is the local example) is *not* a customer record — there's no customer in the relationship. A supplier order is a *vendor* transaction, not a customer one. A rental car's maintenance log is internal. CRM-as-spine forces these into a "customer" frame they don't fit, producing dummy customer rows ("Internal," "N/A," "Founder #2") that pollute every customer query downstream.

**3. The "buying group" problem.** In B2B, the entity that books service may not be the one who pays, who in turn may not be the one who signed the master agreement. CRMs handle this poorly because they were built around the consumer-sales model. Trying to retrofit a "company → contacts → opportunity" hierarchy onto an entity originally modelled as a person produces brittle joins and constant data-quality issues.

**4. Bounded-context violation, formalised.** This is the canonical case the DDD literature warns about: "Many have attempted to define a canonical data model as 'the one consistent common data model for the whole enterprise.' These projects are doomed to fail." The customer concept is **polysemic** — same word, different meanings — and a single table cannot carry all the meanings without becoming a compromise that satisfies none.

**The DDD-recommended fix:** treat each module's notion of "customer" as its own concept (`ServiceClient`, `RentalRenter`, `PartsBuyer`), connect them via a **shared identity** (just a `UserId`) when the same human appears in multiple modules, and use anti-corruption layers / events when external CRMs need to feed in. The shared spine is the *identity*, not the *entity*.

---

## Inter-module communication options

Three options for "Module A needs to react to something in Module B":

| Pattern | Description | When to use | When NOT |
|---|---|---|---|
| **Direct DB join / FK** | Module A's table points at Module B's table; queries join across them | Strong invariant they must always agree; same team; one deploy | Independent lifecycles; modules might split later |
| **Synchronous in-process call** | Module B exposes a function/facade; Module A calls it | Same team monolith; consistency must be immediate (e.g. "create appointment, deduct loyalty points") | Crossing trust/team boundaries; needs to scale to async |
| **Domain events (in-process bus or DB outbox)** | Module B publishes `AppointmentCompleted`; Module A subscribes and creates an invoice | Eventually-consistent workflows; multiple subscribers; future microservice extraction | Strict consistency required; you don't yet have a real second subscriber (YAGNI) |

**For Next.js + Prisma specifically:**

- **Server Actions are your facade.** A module's `app/actions/*.ts` file *is* its public API. Other modules import from there, not from the Prisma model directly. This is the cheapest way to enforce a boundary without infrastructure.
- **Prisma transactions** (`db.$transaction([...])`) keep cross-module mutations atomic when needed — use this when "appointment completed → invoice created → loyalty awarded" must all-or-nothing.
- **Domain events at this scale = a single function call.** Don't build an event bus until you have 3+ subscribers for the same event. A `notifyAppointmentCompleted(...)` function that invokes 2 handlers is fine. The day you have 4, extract a tiny dispatcher. The day you split a module out, replace it with an outbox.
- **Avoid building a generic event/CQRS infrastructure speculatively.** It's the highest-effort, lowest-immediate-payoff pattern in DDD. Earn it.

**The escalation ladder for one-team monoliths:** FK/join → in-process function call → in-process event bus → DB outbox + queue → cross-service messaging. Climb only when forced.

---

## Real-world codebases studied

The targeted search for Cal.com / Documenso / Twenty CRM Prisma organisation didn't surface specific schema-layout documentation in the public-facing search results — these projects exist but their architectural diagrams are not heavily indexed. From what is documented:

- **Cal.com** — single `schema.prisma`, uses Prisma `multiSchema` previewFeature in places to namespace, but most models live in one file. Effectively a "public schema, prefixed table names" approach.
- **Twenty CRM** — uses NestJS modules per bounded context (workspace, calendar, messaging, billing) with TypeORM; database is logically partitioned per workspace (multi-tenancy) rather than per bounded context. Demonstrates that a "modular" application can keep one shared schema if the partitioning axis is *tenancy*, not *module*.
- **Kamil Grzybek's `modular-monolith-with-ddd`** (.NET, but the most-cited reference implementation) — uses **schema-per-module** with strict module-internal-only types and a small explicitly-shared kernel. This is the gold-standard reference for the schema-per-module pattern.

The honest finding: **most real OSS SaaS at the small-to-medium scale does not implement strict DDD bounded contexts in the database**. They use a single Prisma schema with naming conventions, plus module folders in code, and treat boundary enforcement as a code-review concern rather than a DB-schema one. The strict patterns appear when (a) the team is large enough to need enforcement, or (b) the codebase is explicitly written as a teaching reference.

---

## Synthesis for Geleoteka (single-team Next.js + Prisma monolith, 27 models, 4 conceptual modules)

Five opinionated takeaways:

**1. Don't introduce a shared kernel. You already have one — it's called `User` — and that's enough.** Resist the urge to formalise "shared types" as a pattern. The single team is the kernel. Adding a shared-kernel pattern at this scale buys complexity without solving any coordination problem you actually have.

**2. Stay on the `public` schema with module-prefixed table names. Don't migrate to schema-per-module yet.** Geleoteka already half-does this (`PartOrder`, `RentalBooking`, `SupplierOrder`). Finish the convention: every model carries a module prefix except the genuine cross-module ones (`User`, `Notification`, `CMSBlock`). Promote to schema-per-module **only** when one of the modules becomes a candidate for extraction or when a second developer joins and trips on a cross-module query. Until then, the multi-schema friction in Prisma + migrations is a tax with no buyer.

**3. Service is your CORE. Spend modelling budget there; keep Parts/Rentals/Procurement boring.** The temptation will be the opposite — Procurement and Founders feel "interesting" because they're novel. Resist. Appointment, Master, Estimate, Loyalty — that's where rich domain logic earns its keep. For Parts and Rentals, prefer plain CRUD until proven otherwise. For Procurement, the simplest workable schema wins.

**4. Reject CRM-as-spine before it metastasises.** Today's `User` model handles auth — that's good. The trap is letting `User` drift into "everything points here." Specifically: do not add a single `customerId` to `Appointment`, `RentalBooking`, `PartOrder`, and `SupplierOrder` and call it consistent. A founder transferring money is not a customer; a supplier is not a customer; a rental renter and a service client may be the same human but have different lifecycles. Use `userId` as a *shared identity link* where applicable, but each module owns its own view (cabinet profile, master profile, supplier profile, founder profile — already the right instinct in the schema). Suppliers and Founders should never share a table with customers.

**5. Don't build inter-module event infrastructure. Use Server Actions as module facades and Prisma transactions for atomicity.** When Service needs to award loyalty after an appointment, write a function `completeAppointment()` in `app/actions/service.ts` that does both inside one `db.$transaction`. When Service needs to deduct parts from inventory after an estimate, same pattern — direct call, transactional. Don't introduce a domain-event bus until you have a concrete third subscriber. The pattern is correct; the *infrastructure* is premature. Earn it.

**Bonus heuristic:** every six months, run this check — name each model in `schema.prisma` and assign it to one of the four modules. Any model you can't cleanly assign is a *leak* (it belongs to two modules' invariants and you owe yourself a decision). Today the obvious sniff-test candidates are `Notification` (cross-cutting — fine), `User` (shared kernel — fine), and `LoyaltyAccount`/`LoyaltyTransaction` (Service-owned but referenced by Parts? clarify).

---

## Sources

- [Modeling Shared Entities Across Bounded Contexts in Domain-Driven Design (DEV)](https://dev.to/aws-builders/modeling-shared-entities-across-bounded-contexts-in-domain-driven-design-5hih)
- [Sharing Data Between Bounded Contexts in Domain-Driven Design (InfoQ, Julie Lerman)](https://www.infoq.com/news/2014/11/sharing-data-bounded-contexts/)
- [A Pattern for Sharing Data Across DDD Bounded Contexts (Microsoft Learn / MSDN, Lerman)](https://learn.microsoft.com/en-us/archive/msdn-magazine/2014/october/data-points-a-pattern-for-sharing-data-across-domain-driven-design-bounded-contexts)
- [Bounded Context (Martin Fowler)](https://martinfowler.com/bliki/BoundedContext.html)
- [Evolving modular monoliths: Passing data between bounded contexts (The Reformed Programmer)](https://www.thereformedprogrammer.net/evolving-modular-monoliths-3-passing-data-between-bounded-contexts/)
- [Shared Kernel Pattern in DDD (Mehmet Ozkaya)](https://mehmetozkaya.medium.com/shared-kernel-pattern-in-domain-driven-design-ddd-21cba2a9f92a)
- [Strategic DDD: The Balancing Act of Shared Kernel (BuildSimple)](https://buildsimple.substack.com/p/strategic-ddd-the-balancing-act-of)
- [Shared Kernel (DDD-Practitioners)](https://ddd-practitioners.com/home/glossary/bounded-context/bounded-context-relationship/shared-kernel/)
- [My experience of using modular monolith and DDD architectures (The Reformed Programmer)](https://www.thereformedprogrammer.net/my-experience-of-using-modular-monolith-and-ddd-architectures/)
- [modular-monolith-with-ddd (Kamil Grzybek, GitHub)](https://github.com/kgrzybek/modular-monolith-with-ddd)
- [How to Keep Your Data Boundaries Intact in a Modular Monolith (Milan Jovanović)](https://www.milanjovanovic.tech/blog/how-to-keep-your-data-boundaries-intact-in-a-modular-monolith)
- [Modular Monolith Architecture (Milan Jovanović)](https://www.milanjovanovic.tech/modular-monolith-architecture)
- [Refactoring Overgrown Bounded Contexts in Modular Monoliths (Milan Jovanović)](https://www.milanjovanovic.tech/blog/refactoring-overgrown-bounded-contexts-in-modular-monoliths)
- [Data Management in Modular Monoliths: 4 Data Isolation Strategies (Mehmet Ozkaya)](https://mehmetozkaya.medium.com/data-management-in-modular-monoliths-4-data-isolation-strategies-1042667a099c)
- [Database Schema Recommendations for an Application (PostgreSQL Wiki)](https://wiki.postgresql.org/wiki/Database_Schema_Recommendations_for_an_Application)
- [PostgreSQL Schemas Explained (Joshua Idunnu Paul, Medium)](https://cybernerdie.medium.com/postgresql-schemas-explained-the-missing-tool-for-clean-scalable-database-design-f6980622528e)
- [Schemas in PostgreSQL: Best Practices (DbVis)](https://www.dbvis.com/thetable/schemas-in-postgresql/)
- [B2B's 3 Most Common Approaches on Customer Data Strategy (Syncari)](https://syncari.com/blog/customer-data-strategy/)
- [B2B Customer Data Platforms (Bryan Bashaw, Medium)](https://medium.com/@bryan.bashaw/b2b-customer-data-platforms-the-complexity-of-b2b-cdps-vs-b2c-accb0c499f04)
- [Applying Domain-Driven Design with Salesforce (Denis Krizanovic)](https://medium.com/salesforce-architects/applying-domain-driven-design-with-salesforce-cd4b7ebe926b)
- [SAP's One Domain Model and Domain Driven Design (SAP Community)](https://blogs.sap.com/2020/07/23/saps-one-domain-model-and-domain-driven-design/)
- [Learning Domain-Driven Design ch. 6 (Khononov, O'Reilly)](https://www.oreilly.com/library/view/learning-domain-driven-design/9781098100124/ch06.html)
- [DDD Beyond the Basics: Mastering Multi-Bounded Context Integration (SSENSE-TECH)](https://medium.com/ssense-tech/ddd-beyond-the-basics-mastering-multi-bounded-context-integration-ca0c7cec6561)
- [How modular can your monolith go? Part 7 (microservices.io / Chris Richardson)](https://microservices.io/post/architecture/2024/05/13/how-modular-can-your-monolith-go-part-7-no-such-thing-as-a-modular-monolith.html)
- [Modular Database Model (Prisma issue #170)](https://github.com/prisma/prisma/issues/170)
