/**
 * Verifies the ZONE stocktake fix (bug #38): a ZONE scope now matches cells by
 * code PREFIX (zone "A" → A-1-1, A-1-2; not B-1-1), and a zone matching no cells
 * is rejected with EMPTY_ZONE instead of silently creating an empty session.
 * Runs inside a rolled-back transaction — no fixtures persist.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { createCountSession } from "../lib/wms/public/stocktake";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const TENANT = "geleoteka";
const WH = "wh_main_geleoteka";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

class Rollback extends Error {}

async function main(): Promise<void> {
  console.log("[verify-stocktake-zone-prefix] starting");
  // Unique throwaway codes so we don't collide with existing dev cells (A-1-1 etc.).
  const z = `VZ${Date.now()}`; // matching zone prefix
  const other = `VX${Date.now()}`; // non-matching sibling
  const empty = `VW${Date.now()}`; // matches nothing
  try {
    await db.$transaction(async (tx: Tx) => {
      const mk = (code: string) =>
        (tx as Tx).stockLocation.create({
          data: { code, warehouseId: WH, tenantKey: TENANT, isActive: true, isBlocked: false },
        });
      await mk(`${z}-1-1`);
      await mk(`${z}-1-2`);
      await mk(`${other}-1-1`);

      // ZONE z → prefix match → z-1-1, z-1-2 only (not the VX sibling).
      const session = (await createCountSession(tx, {
        scope: "ZONE",
        warehouseId: WH,
        scopeValue: z,
        tenantKey: TENANT,
      })) as { id: string };
      const row = (await (tx as Tx).stockCountSession.findUnique({
        where: { id: session.id },
        select: { scopeLocations: true },
      })) as { scopeLocations: string[] } | null;
      const got = [...(row?.scopeLocations ?? [])].sort();
      assert(
        got.length === 2 && got[0] === `${z}-1-1` && got[1] === `${z}-1-2`,
        `zone "${z}" should resolve to its two cells (got ${JSON.stringify(got)})`,
      );
      console.log(`  ✓ ZONE prefix-matches "${z}-1-1", "${z}-1-2" (excludes the VX sibling)`);

      // Non-matching zone → EMPTY_ZONE.
      let code: string | undefined;
      try {
        await createCountSession(tx, { scope: "ZONE", warehouseId: WH, scopeValue: empty, tenantKey: TENANT });
      } catch (e) {
        code = (e as Error).message;
      }
      assert(code === "EMPTY_ZONE", `zone with no cells must throw EMPTY_ZONE (got ${code})`);
      console.log("  ✓ zone with no matching cells rejected with EMPTY_ZONE");

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log("  ✓ fixtures rolled back — nothing persisted");
  console.log("[verify-stocktake-zone-prefix] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-stocktake-zone-prefix] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
