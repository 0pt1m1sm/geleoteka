/**
 * Verifies resolveFulfilmentTarget for the unified fulfilment screen:
 *  - a PartShipment resolves to PACK by orderNumber and by id;
 *  - a RepairOrder resolves to PICK by roNumber and by id;
 *  - an unknown code resolves to null.
 * Rolled-back tx — no fixtures persist.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { resolveFulfilmentTarget } from "../lib/warehouse/resolve-fulfilment";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}
class Rollback extends Error {}

async function main(): Promise<void> {
  console.log("[verify-resolve-fulfilment] starting");
  const ts = Date.now();

  try {
    await db.$transaction(async (tx: Tx) => {
      const admin = (await tx.user.findFirst({ where: { email: "admin@geleoteka.ru" }, select: { id: true } })) as { id: string } | null;
      assert(admin, "seed admin not found");

      // A PartShipment with a human order number. dealId is required.
      const deal = (await tx.deal.findFirst({ select: { id: true } })) as { id: string } | null;
      assert(deal, "need at least one Deal fixture");
      const poNumber = `PO-VRF-${ts}`;
      const shipment = (await tx.partShipment.create({
        data: {
          orderNumber: poNumber,
          dealId: deal.id,
          status: "PROCESSING",
          contactName: "verify",
          contactPhone: "+70000000000",
          contactEmail: "verify@example.com",
        },
        select: { id: true },
      })) as { id: string };

      // A RepairOrder with a human roNumber.
      const vehicle = (await tx.vehicle.findFirst({ select: { id: true } })) as { id: string } | null;
      assert(vehicle, "need at least one Vehicle fixture");
      const roNumber = `RO-VRF-${ts}`;
      const ro = (await tx.repairOrder.create({
        data: { roNumber, userId: admin.id, vehicleId: vehicle.id, dealId: deal.id, dateTime: new Date(), status: "SCHEDULED" },
        select: { id: true },
      })) as { id: string };

      // PartShipment → pack, by number and by id.
      const byPo = await resolveFulfilmentTarget(tx, poNumber);
      assert(byPo?.kind === "pack" && byPo.id === shipment.id, "orderNumber resolves to pack");
      const byShipId = await resolveFulfilmentTarget(tx, shipment.id);
      assert(byShipId?.kind === "pack" && byShipId.id === shipment.id, "shipment id resolves to pack");
      console.log("  ✓ PartShipment resolves to PACK by orderNumber and by id");

      // RepairOrder → pick, by number and by id.
      const byRo = await resolveFulfilmentTarget(tx, roNumber);
      assert(byRo?.kind === "pick" && byRo.id === ro.id, "roNumber resolves to pick");
      const byRoId = await resolveFulfilmentTarget(tx, ro.id);
      assert(byRoId?.kind === "pick" && byRoId.id === ro.id, "RO id resolves to pick");
      console.log("  ✓ RepairOrder resolves to PICK by roNumber and by id");

      // Unknown.
      const none = await resolveFulfilmentTarget(tx, `NOPE-${ts}`);
      assert(none === null, "unknown code resolves to null");
      console.log("  ✓ unknown code resolves to null");

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log("  ✓ rolled back — nothing persisted");
  console.log("[verify-resolve-fulfilment] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-resolve-fulfilment] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
