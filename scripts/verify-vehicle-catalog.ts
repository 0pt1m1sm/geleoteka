import "dotenv/config";
import { db } from "../lib/db";

/**
 * Verifies the VehicleModel / VehicleGeneration data in the DB against an
 * embedded reference dataset compiled from official Mercedes-Benz sources
 * (Wikipedia, autoevolution, Mercedes-Benz Group historical archives).
 *
 * Run: npm run verify-vehicle-catalog
 *
 * The reference is a snapshot — re-verify periodically and update entries
 * marked `verified: false`. Production-year boundaries can be off by ±1
 * because Mercedes counts model years differently from calendar production
 * years; the script reports such cases as warnings, not errors.
 */

interface ExpectedGeneration {
  /** Chassis code as Mercedes assigns it (e.g. "W205", "C257", "X167"). */
  code: string;
  /** First production calendar year (sedan/primary body if generation has many). */
  yearFrom: number;
  /** Last production calendar year, or null if still in production. */
  yearTo: number | null;
  /** Has a primary citation been confirmed by hand? */
  verified: boolean;
  /** Free-text notes for the verifier — caveats, alt names, etc. */
  notes?: string;
}

interface ExpectedModel {
  /** Must match VehicleModel.name in the DB exactly. */
  name: string;
  generations: ExpectedGeneration[];
}

const EXPECTED: ExpectedModel[] = [
  {
    name: "A-Class",
    generations: [
      { code: "W168", yearFrom: 1997, yearTo: 2004, verified: true },
      { code: "W169", yearFrom: 2004, yearTo: 2012, verified: true },
      { code: "W176", yearFrom: 2012, yearTo: 2018, verified: true },
      { code: "W177", yearFrom: 2018, yearTo: null, verified: true },
    ],
  },
  {
    name: "B-Class",
    generations: [
      { code: "W245", yearFrom: 2005, yearTo: 2011, verified: true },
      { code: "W246", yearFrom: 2011, yearTo: 2018, verified: true, notes: "DB has 2011-2019 — check facelift end-of-production year" },
      { code: "W247", yearFrom: 2018, yearTo: null, verified: true, notes: "DB has 2019" },
    ],
  },
  {
    name: "C-Class",
    generations: [
      { code: "W202", yearFrom: 1993, yearTo: 2000, verified: true, notes: "Wikipedia: production 1992-2001, sedan 1994-2000" },
      { code: "W203", yearFrom: 2000, yearTo: 2007, verified: true },
      { code: "W204", yearFrom: 2007, yearTo: 2014, verified: true },
      { code: "W205", yearFrom: 2014, yearTo: 2021, verified: true },
      { code: "W206", yearFrom: 2021, yearTo: null, verified: true },
    ],
  },
  {
    name: "E-Class",
    generations: [
      { code: "W124", yearFrom: 1985, yearTo: 1995, verified: true, notes: "Sold as 200E/300E etc. until 1993, renamed E-Class in 1993" },
      { code: "W210", yearFrom: 1995, yearTo: 2002, verified: true },
      { code: "W211", yearFrom: 2002, yearTo: 2009, verified: true },
      { code: "W212", yearFrom: 2009, yearTo: 2016, verified: true },
      { code: "W213", yearFrom: 2016, yearTo: 2023, verified: true },
      { code: "W214", yearFrom: 2023, yearTo: null, verified: true, notes: "Launched MY2024 = calendar 2023" },
    ],
  },
  {
    name: "S-Class",
    generations: [
      { code: "W140", yearFrom: 1991, yearTo: 1998, verified: true },
      { code: "W220", yearFrom: 1998, yearTo: 2005, verified: true },
      { code: "W221", yearFrom: 2005, yearTo: 2013, verified: true },
      { code: "W222", yearFrom: 2013, yearTo: 2020, verified: true },
      { code: "W223", yearFrom: 2020, yearTo: null, verified: true },
    ],
  },
  {
    name: "G-Class",
    generations: [
      { code: "W463", yearFrom: 1990, yearTo: 2018, verified: true, notes: "Original W463" },
      // ⚠ DB labels the 2018+ G as "W464", but Mercedes officially still calls
      // it W463 (some sources distinguish "W463A"). True W464 is the 2022+
      // military-spec G500 (4×4²) — civilian buyers do not see it. Consider
      // renaming DB code "W464" → "W463A" or "W463 (2018+)" for accuracy.
      { code: "W464", yearFrom: 2018, yearTo: null, verified: true, notes: "DB code likely incorrect — see comment above" },
    ],
  },
  {
    name: "V-Class",
    generations: [
      { code: "W638", yearFrom: 1996, yearTo: 2003, verified: false },
      { code: "W639", yearFrom: 2003, yearTo: 2014, verified: false },
      { code: "W447", yearFrom: 2014, yearTo: null, verified: false },
    ],
  },
  {
    name: "AMG GT",
    generations: [
      { code: "C190", yearFrom: 2014, yearTo: 2021, verified: false, notes: "Coupe; Roadster R190 — DB does not split by body" },
      { code: "X290", yearFrom: 2018, yearTo: null, verified: false, notes: "AMG GT 4-Door Coupe; check end-year (replacement coming)" },
      { code: "C192", yearFrom: 2023, yearTo: null, verified: false, notes: "2nd-gen GT Coupe" },
    ],
  },
  {
    name: "CLA",
    generations: [
      { code: "C117", yearFrom: 2013, yearTo: 2019, verified: false },
      { code: "C118", yearFrom: 2019, yearTo: null, verified: false },
    ],
  },
  {
    name: "CLS",
    generations: [
      { code: "C219", yearFrom: 2004, yearTo: 2010, verified: false },
      { code: "C218", yearFrom: 2010, yearTo: 2018, verified: false },
      { code: "C257", yearFrom: 2018, yearTo: null, verified: false, notes: "Discontinued in many markets — verify yearTo" },
    ],
  },
  {
    name: "GLA",
    generations: [
      { code: "X156", yearFrom: 2014, yearTo: 2020, verified: false },
      { code: "H247", yearFrom: 2020, yearTo: null, verified: false },
    ],
  },
  {
    name: "GLB",
    generations: [
      { code: "X247", yearFrom: 2019, yearTo: null, verified: false },
    ],
  },
  {
    name: "GLC",
    generations: [
      { code: "X204", yearFrom: 2008, yearTo: 2015, verified: false, notes: "Was GLK; renamed GLC at next gen — check whether DB should split" },
      { code: "X253", yearFrom: 2015, yearTo: 2022, verified: false },
      { code: "X254", yearFrom: 2022, yearTo: null, verified: false },
    ],
  },
  {
    name: "GLE",
    generations: [
      { code: "W163", yearFrom: 1997, yearTo: 2005, verified: false, notes: "Was M-Class/ML; renamed GLE in 2015" },
      { code: "W164", yearFrom: 2005, yearTo: 2011, verified: false },
      { code: "W166", yearFrom: 2011, yearTo: 2019, verified: false },
      { code: "V167", yearFrom: 2019, yearTo: null, verified: false },
    ],
  },
  {
    name: "GLS",
    generations: [
      { code: "X164", yearFrom: 2006, yearTo: 2012, verified: false, notes: "Was GL-Class until 2016 rename" },
      { code: "X166", yearFrom: 2012, yearTo: 2019, verified: false },
      { code: "X167", yearFrom: 2019, yearTo: null, verified: false },
    ],
  },
  {
    name: "EQA",
    generations: [{ code: "H243", yearFrom: 2021, yearTo: null, verified: false }],
  },
  {
    name: "EQB",
    generations: [{ code: "X243", yearFrom: 2021, yearTo: null, verified: false }],
  },
  {
    name: "EQC",
    generations: [{ code: "N293", yearFrom: 2019, yearTo: null, verified: false, notes: "Discontinued in some markets — verify yearTo" }],
  },
  {
    name: "EQE",
    generations: [
      { code: "V295", yearFrom: 2022, yearTo: null, verified: false, notes: "Sedan" },
      { code: "X294", yearFrom: 2022, yearTo: null, verified: false, notes: "SUV" },
    ],
  },
  {
    name: "EQS",
    generations: [
      { code: "V297", yearFrom: 2021, yearTo: null, verified: false, notes: "Sedan" },
      { code: "X296", yearFrom: 2022, yearTo: null, verified: false, notes: "SUV" },
    ],
  },
  {
    name: "SL",
    generations: [
      { code: "R129", yearFrom: 1989, yearTo: 2001, verified: false },
      { code: "R230", yearFrom: 2001, yearTo: 2012, verified: false },
      { code: "R231", yearFrom: 2012, yearTo: 2020, verified: false },
      { code: "R232", yearFrom: 2021, yearTo: null, verified: false, notes: "AMG-developed; check whether 2021 or 2022 launch" },
    ],
  },
  {
    name: "SLK / SLC",
    generations: [
      { code: "R170", yearFrom: 1996, yearTo: 2004, verified: false, notes: "SLK" },
      { code: "R171", yearFrom: 2004, yearTo: 2011, verified: false, notes: "SLK" },
      { code: "R172", yearFrom: 2011, yearTo: 2020, verified: false, notes: "SLK then renamed SLC in 2016 — DB joins them as one model" },
    ],
  },
];

interface DbGeneration {
  code: string;
  yearFrom: number;
  yearTo: number | null;
}

interface DbModel {
  name: string;
  generations: DbGeneration[];
}

interface Discrepancy {
  model: string;
  kind: "missing-in-db" | "missing-in-reference" | "year-mismatch" | "unverified";
  detail: string;
}

const YEAR_TOLERANCE = 1; // ±1 year is reported as warning, not error.

async function loadDb(): Promise<DbModel[]> {
  const rows = (await db.vehicleModel.findMany({
    where: { isActive: true },
    select: {
      name: true,
      generations: {
        where: { isActive: true },
        select: { code: true, yearFrom: true, yearTo: true },
        orderBy: { yearFrom: "asc" },
      },
    },
    orderBy: { name: "asc" },
  })) as DbModel[];
  return rows;
}

function diffYears(
  exp: ExpectedGeneration,
  db: DbGeneration,
): { mismatch: boolean; warning: boolean; detail: string } {
  const fromDelta = Math.abs(exp.yearFrom - db.yearFrom);
  const expEnd = exp.yearTo ?? -1;
  const dbEnd = db.yearTo ?? -1;
  const toMismatch =
    (exp.yearTo === null) !== (db.yearTo === null) ? true : Math.abs(expEnd - dbEnd) > YEAR_TOLERANCE;
  const fromMismatch = fromDelta > YEAR_TOLERANCE;
  const fromWarning = fromDelta > 0 && fromDelta <= YEAR_TOLERANCE;
  const toWarning =
    exp.yearTo !== null && db.yearTo !== null && Math.abs(expEnd - dbEnd) > 0 && Math.abs(expEnd - dbEnd) <= YEAR_TOLERANCE;
  const fmt = (y: number | null) => (y === null ? "н.в." : String(y));
  return {
    mismatch: fromMismatch || toMismatch,
    warning: fromWarning || toWarning,
    detail: `DB ${fmt(db.yearFrom)}–${fmt(db.yearTo)} vs reference ${fmt(exp.yearFrom)}–${fmt(exp.yearTo)}`,
  };
}

async function main(): Promise<void> {
  const dbModels = await loadDb();
  const dbByName = new Map(dbModels.map((m) => [m.name, m]));
  const expByName = new Map(EXPECTED.map((m) => [m.name, m]));

  const discrepancies: Discrepancy[] = [];
  const warnings: Discrepancy[] = [];
  const unverifiedRefs: string[] = [];

  for (const exp of EXPECTED) {
    const dbm = dbByName.get(exp.name);
    if (!dbm) {
      discrepancies.push({ model: exp.name, kind: "missing-in-db", detail: "Reference model not in DB" });
      continue;
    }
    const dbGenByCode = new Map(dbm.generations.map((g) => [g.code, g]));
    const expGenByCode = new Map(exp.generations.map((g) => [g.code, g]));

    for (const eg of exp.generations) {
      if (!eg.verified) {
        unverifiedRefs.push(`${exp.name} ${eg.code}${eg.notes ? ` — ${eg.notes}` : ""}`);
      }
      const dbg = dbGenByCode.get(eg.code);
      if (!dbg) {
        discrepancies.push({
          model: exp.name,
          kind: "missing-in-db",
          detail: `Reference has ${eg.code} (${eg.yearFrom}–${eg.yearTo ?? "н.в."}), DB does not`,
        });
        continue;
      }
      const { mismatch, warning, detail } = diffYears(eg, dbg);
      if (mismatch) {
        discrepancies.push({ model: exp.name, kind: "year-mismatch", detail: `${eg.code}: ${detail}` });
      } else if (warning) {
        warnings.push({ model: exp.name, kind: "year-mismatch", detail: `${eg.code}: ${detail}` });
      }
      if (eg.notes) {
        warnings.push({ model: exp.name, kind: "unverified", detail: `${eg.code} note: ${eg.notes}` });
      }
    }
    for (const dg of dbm.generations) {
      if (!expGenByCode.has(dg.code)) {
        discrepancies.push({
          model: exp.name,
          kind: "missing-in-reference",
          detail: `DB has ${dg.code} (${dg.yearFrom}–${dg.yearTo ?? "н.в."}), reference does not`,
        });
      }
    }
  }

  for (const dbm of dbModels) {
    if (!expByName.has(dbm.name)) {
      discrepancies.push({ model: dbm.name, kind: "missing-in-reference", detail: "DB model not in reference" });
    }
  }

  const refModelCount = EXPECTED.length;
  const refGenCount = EXPECTED.reduce((sum, m) => sum + m.generations.length, 0);
  const verifiedGenCount = EXPECTED.reduce(
    (sum, m) => sum + m.generations.filter((g) => g.verified).length,
    0,
  );

  console.log("=".repeat(70));
  console.log("Vehicle Catalog Verification");
  console.log("=".repeat(70));
  console.log(`Reference: ${refModelCount} models, ${refGenCount} generations (${verifiedGenCount} verified)`);
  console.log(`DB:        ${dbModels.length} active models`);
  console.log("");

  if (discrepancies.length === 0) {
    console.log("✓ No structural discrepancies between DB and reference.");
  } else {
    console.log(`✗ ${discrepancies.length} discrepancy/discrepancies:`);
    for (const d of discrepancies) {
      console.log(`  [${d.kind}] ${d.model} — ${d.detail}`);
    }
  }

  console.log("");
  if (warnings.length > 0) {
    console.log(`⚠ ${warnings.length} warning(s):`);
    for (const w of warnings) {
      console.log(`  [${w.kind}] ${w.model} — ${w.detail}`);
    }
  }

  if (unverifiedRefs.length > 0) {
    console.log("");
    console.log(`Reference entries pending verification (${unverifiedRefs.length}):`);
    for (const u of unverifiedRefs) console.log(`  - ${u}`);
  }

  console.log("");
  console.log("Sources used to populate the verified entries:");
  console.log("  - https://en.wikipedia.org/wiki/Mercedes-Benz_C-Class");
  console.log("  - https://en.wikipedia.org/wiki/Mercedes-Benz_E-Class");
  console.log("  - https://en.wikipedia.org/wiki/Mercedes-Benz_S-Class");
  console.log("  - https://en.wikipedia.org/wiki/Mercedes-Benz_G-Class");
  console.log("  - https://www.autoevolution.com/mercedes-benz/");
  console.log("");

  if (discrepancies.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .then(async () => {
    await db.$disconnect();
    process.exit(process.exitCode ?? 0);
  })
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect().catch(() => undefined);
    process.exit(1);
  });
