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
      { code: "W246", yearFrom: 2011, yearTo: 2018, verified: true },
      { code: "W247", yearFrom: 2018, yearTo: null, verified: true },
    ],
  },
  {
    name: "C-Class",
    generations: [
      { code: "W202", yearFrom: 1993, yearTo: 2000, verified: true },
      { code: "W203", yearFrom: 2000, yearTo: 2007, verified: true },
      { code: "W204", yearFrom: 2007, yearTo: 2014, verified: true },
      { code: "W205", yearFrom: 2014, yearTo: 2021, verified: true },
      { code: "W206", yearFrom: 2021, yearTo: null, verified: true },
    ],
  },
  {
    name: "E-Class",
    generations: [
      { code: "W124", yearFrom: 1985, yearTo: 1995, verified: true, notes: "Sold as 200E/300E etc.; renamed E-Class in 1993" },
      { code: "W210", yearFrom: 1995, yearTo: 2002, verified: true },
      { code: "W211", yearFrom: 2002, yearTo: 2009, verified: true },
      { code: "W212", yearFrom: 2009, yearTo: 2016, verified: true },
      { code: "W213", yearFrom: 2016, yearTo: 2023, verified: true },
      { code: "W214", yearFrom: 2023, yearTo: null, verified: true },
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
      { code: "W460", yearFrom: 1979, yearTo: 1991, verified: true, notes: "Original civilian" },
      { code: "W461", yearFrom: 1985, yearTo: 2022, verified: true, notes: "Puch G / utility & military; civilian production through 2019, full through 2022" },
      { code: "W463", yearFrom: 1990, yearTo: 2018, verified: true, notes: "Classic luxury, first generation" },
      { code: "W463A", yearFrom: 2018, yearTo: 2024, verified: true, notes: "Wikipedia: W463 second generation (2018–2024); also designated W463A/W464 in some sources. Aftermarket convention: W463A." },
      { code: "W464", yearFrom: 2022, yearTo: null, verified: true, notes: "Wikipedia: W461 replacement (utility/military); details limited in source. Customer-facing: yes." },
      { code: "W465", yearFrom: 2024, yearTo: null, verified: true, notes: "Wikipedia: section heading present but body truncated; details limited in source. Likely the next-gen luxury successor to W463A." },
    ],
  },
  {
    name: "V-Class",
    generations: [
      { code: "W638", yearFrom: 1996, yearTo: 2003, verified: true },
      { code: "W639", yearFrom: 2003, yearTo: 2014, verified: true },
      { code: "W447", yearFrom: 2014, yearTo: null, verified: true },
    ],
  },
  {
    name: "AMG GT",
    generations: [
      { code: "C190", yearFrom: 2014, yearTo: 2022, verified: true, notes: "Coupe; Roadster R190 not split out separately" },
      { code: "X290", yearFrom: 2018, yearTo: null, verified: true, notes: "AMG GT 4-Door Coupe" },
      { code: "C192", yearFrom: 2023, yearTo: null, verified: true, notes: "2nd-gen GT Coupe" },
    ],
  },
  {
    name: "CLA",
    generations: [
      { code: "C117", yearFrom: 2013, yearTo: 2019, verified: true },
      { code: "C118", yearFrom: 2019, yearTo: null, verified: true },
    ],
  },
  {
    name: "CLS",
    generations: [
      { code: "C219", yearFrom: 2003, yearTo: 2010, verified: true },
      { code: "C218", yearFrom: 2011, yearTo: 2018, verified: true },
      { code: "C257", yearFrom: 2018, yearTo: 2023, verified: true, notes: "Production ended August 2023" },
    ],
  },
  {
    name: "GLA",
    generations: [
      { code: "X156", yearFrom: 2014, yearTo: 2020, verified: true },
      { code: "H247", yearFrom: 2020, yearTo: null, verified: true },
    ],
  },
  {
    name: "GLB",
    generations: [{ code: "X247", yearFrom: 2019, yearTo: null, verified: true }],
  },
  {
    name: "GLC",
    generations: [
      { code: "X204", yearFrom: 2008, yearTo: 2015, verified: true, notes: "Was GLK; renamed GLC at next generation" },
      { code: "X253", yearFrom: 2015, yearTo: 2022, verified: true },
      { code: "X254", yearFrom: 2022, yearTo: null, verified: true },
    ],
  },
  {
    name: "GLE",
    generations: [
      { code: "W163", yearFrom: 1997, yearTo: 2004, verified: true, notes: "Was M-Class/ML; renamed GLE in 2015" },
      { code: "W164", yearFrom: 2005, yearTo: 2011, verified: true },
      { code: "W166", yearFrom: 2011, yearTo: 2019, verified: true },
      { code: "V167", yearFrom: 2019, yearTo: null, verified: true, notes: "Mercedes also documents this as W167; we follow aftermarket V167 convention" },
    ],
  },
  {
    name: "GLS",
    generations: [
      { code: "X164", yearFrom: 2006, yearTo: 2012, verified: true, notes: "Was GL-Class until 2016 rename" },
      { code: "X166", yearFrom: 2012, yearTo: 2019, verified: true },
      { code: "X167", yearFrom: 2019, yearTo: null, verified: true },
    ],
  },
  {
    name: "EQA",
    generations: [{ code: "H243", yearFrom: 2021, yearTo: null, verified: true }],
  },
  {
    name: "EQB",
    generations: [{ code: "X243", yearFrom: 2021, yearTo: null, verified: true }],
  },
  {
    name: "EQC",
    generations: [{ code: "N293", yearFrom: 2019, yearTo: 2023, verified: true, notes: "Production ended 2023" }],
  },
  {
    name: "EQE",
    generations: [
      { code: "V295", yearFrom: 2022, yearTo: null, verified: true, notes: "Sedan" },
      { code: "X294", yearFrom: 2022, yearTo: null, verified: true, notes: "SUV" },
    ],
  },
  {
    name: "EQS",
    generations: [
      { code: "V297", yearFrom: 2021, yearTo: null, verified: true, notes: "Sedan" },
      { code: "X296", yearFrom: 2022, yearTo: null, verified: true, notes: "SUV" },
    ],
  },
  {
    name: "SL",
    generations: [
      { code: "R129", yearFrom: 1988, yearTo: 2001, verified: true },
      { code: "R230", yearFrom: 2001, yearTo: 2011, verified: true },
      { code: "R231", yearFrom: 2012, yearTo: 2020, verified: true },
      { code: "R232", yearFrom: 2021, yearTo: null, verified: true, notes: "AMG-developed; presented Oct 2021" },
    ],
  },
  {
    name: "SLK / SLC",
    generations: [
      { code: "R170", yearFrom: 1995, yearTo: 2004, verified: true, notes: "SLK" },
      { code: "R171", yearFrom: 2004, yearTo: 2011, verified: true, notes: "SLK" },
      { code: "R172", yearFrom: 2011, yearTo: 2020, verified: true, notes: "SLK then renamed SLC in 2016 — DB joins them as one model" },
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

  if (warnings.length > 0) {
    console.log("");
    console.log(`⚠ ${warnings.length} warning(s) (within ±${YEAR_TOLERANCE}-year tolerance):`);
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
  console.log("Sources used to populate verified entries:");
  console.log("  - https://en.wikipedia.org/wiki/Mercedes-Benz_<Model>");
  console.log("  - https://en.wikipedia.org/wiki/Mercedes-Benz_<Model>_(<chassis>)");
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
