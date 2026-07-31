/**
 * Проверяет, что снятие брони при удалении сметы/сделки возвращает на склад
 * только то, что там ещё числится за этой сметой.
 *
 * Резерв гасится ровно один раз: либо RELEASE (смета отклонена/заменена/
 * удалена), либо CONSUMPTION при закрытии заказ-наряда — списание само
 * уменьшает reserved. Значит по уже установленным или отгруженным запчастям
 * возвращать нечего.
 *
 * В минус счётчик при этом не уходит — recordMovement клампит его нулём, и
 * именно поэтому ошибку не видно. reserved один на складскую карточку и общий
 * для всех смет, поэтому лишний RELEASE молча съедает чужую живую бронь
 * (сценарий D): запчасти, отложенные под другую машину, снова становятся
 * «доступными к обещанию».
 *
 * Всё пишется в транзакцию и откатывается — боевые данные не меняются.
 */
import "dotenv/config";

import { db } from "@/lib/db";
import { consumeStock, recordMovement } from "@/lib/wms/public";
import { defaultWarehouseId, TENANT_KEY } from "@/lib/wms-host";
import { releasePartLinesForEstimate, reserveForLine } from "@/lib/fulfillment/reservations";

const ROLLBACK = "__rollback__";

let failures = 0;

function check(label: string, actual: number, expected: number): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "  ✅" : "  ❌"} ${label}: reserved=${actual} (ожидалось ${expected})`);
}

async function reservedOf(tx: unknown, stockItemId: string): Promise<number> {
  const row = (await (tx as typeof db).stockItem.findUnique({
    where: { id: stockItemId },
    select: { reserved: true },
  })) as { reserved: number } | null;
  return row?.reserved ?? 0;
}

async function main(): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      const warehouseId = await defaultWarehouseId(tx);

      // Любая деталь, у которой есть складская карточка в основном складе.
      const stock = (await tx.stockItem.findFirst({
        where: { warehouseId, tenantKey: TENANT_KEY },
        select: { id: true, partId: true, quantity: true, reserved: true },
      })) as { id: string; partId: string; quantity: number; reserved: number } | null;
      if (!stock) throw new Error("нет ни одной складской карточки — нечего проверять");

      // Приход, чтобы точно было что списывать (неразмещённый остаток
      // расходуется первым, поэтому раскладка по ячейкам не нужна).
      await recordMovement(tx, {
        item: { itemId: stock.partId, warehouseId },
        reason: "RECEIPT",
        qty: 10,
        source: { type: "VerifyScript", id: `${ROLLBACK}:receipt` },
        tenantKey: TENANT_KEY,
      });

      const deal = (await tx.deal.findFirst({ select: { id: true } })) as { id: string } | null;
      if (!deal) throw new Error("нет ни одной сделки — нечего проверять");

      const base = await reservedOf(tx, stock.id);
      console.log(`Деталь ${stock.partId}, исходный reserved=${base}\n`);

      async function lineWithHold(qty: number): Promise<{ estimateId: string; lineId: string }> {
        const est = (await tx.estimate.create({
          data: { dealId: deal!.id, stage: "DRAFT" },
          select: { id: true },
        })) as { id: string };
        const line = (await tx.estimateLine.create({
          data: {
            estimateId: est.id,
            type: "PART",
            description: "verify",
            qty,
            partId: stock!.partId,
          },
          select: { id: true },
        })) as { id: string };
        await reserveForLine(tx, { partId: stock!.partId, qty, lineId: line.id });
        return { estimateId: est.id, lineId: line.id };
      }

      // ─── A. Черновик: запчасть забронирована, но никуда не ушла ───────────
      console.log("A. Смета-черновик — бронь должна вернуться полностью");
      const a = await lineWithHold(3);
      check("после брони", await reservedOf(tx, stock.id), base + 3);
      await releasePartLinesForEstimate(tx, a.estimateId);
      check("после удаления сметы", await reservedOf(tx, stock.id), base);

      // ─── B. Запчасть уже установлена/отгружена (списана) ──────────────────
      console.log("\nB. Запчасть списана в работу — возвращать нечего");
      const b = await lineWithHold(4);
      check("после брони", await reservedOf(tx, stock.id), base + 4);
      await consumeStock(tx, {
        item: { itemId: stock.partId, warehouseId },
        qty: 4,
        source: { type: "RepairOrder", id: `${ROLLBACK}:ro:${b.lineId}` },
        tenantKey: TENANT_KEY,
      });
      check("после списания (бронь сняло само списание)", await reservedOf(tx, stock.id), base);
      await releasePartLinesForEstimate(tx, b.estimateId);
      check("после удаления сделки — ничего не возвращается", await reservedOf(tx, stock.id), base);

      // ─── C. Повторный вызов ничего не разрушает ───────────────────────────
      console.log("\nC. Повторное удаление — идемпотентность");
      await releasePartLinesForEstimate(tx, a.estimateId);
      await releasePartLinesForEstimate(tx, b.estimateId);
      check("после повторных вызовов", await reservedOf(tx, stock.id), base);

      // ─── D. Чужая бронь на ту же деталь не должна пострадать ──────────────
      // Главный сценарий: reserved один на всю карточку, поэтому лишний
      // возврат по списанной строке уводит запчасти, отложенные под другую
      // машину. Клампинг нулём это не ловит — счётчик просто уменьшается.
      console.log("\nD. Списанная строка не должна съесть бронь другой сметы");
      const consumed = await lineWithHold(4);
      const other = await lineWithHold(5); // другая смета держит ту же деталь
      await consumeStock(tx, {
        item: { itemId: stock.partId, warehouseId },
        qty: 4,
        source: { type: "RepairOrder", id: `${ROLLBACK}:ro2:${consumed.lineId}` },
        tenantKey: TENANT_KEY,
      });
      check("живой остаётся только чужая бронь", await reservedOf(tx, stock.id), base + 5);
      await releasePartLinesForEstimate(tx, consumed.estimateId);
      check("чужая бронь цела после удаления", await reservedOf(tx, stock.id), base + 5);
      await releasePartLinesForEstimate(tx, other.estimateId);
      check("своя бронь возвращается штатно", await reservedOf(tx, stock.id), base);

      throw new Error(ROLLBACK);
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
    console.log("\n↩︎  транзакция откачена — данные не изменены");
  }

  console.log(failures === 0 ? "\n✅ ВСЁ СОШЛОСЬ" : `\n❌ ПРОВАЛОВ: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Ошибка:", e);
  process.exit(1);
});
