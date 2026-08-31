import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Сторож ПОЛНОТЫ охвата правила «проданный б/у уходит с витрины».
 *
 * История: правило было подключено к 3 путям из 7. Пропущены оказались, среди
 * прочего, списание по ремонт-ордеру (главный путь расхода для сервиса) и
 * складская корректировка — тот самый экран, которым реально пользуется склад.
 * Гейт при этом был полностью зелёным: тесты покрывали предикат, а не места
 * врезки.
 *
 * Все пути изменения остатка проходят через `recordMovement`/`consumeStock`.
 * Правило сознательно не живёт в ядре WMS (ядро оперирует количествами и о
 * состоянии товара не знает), поэтому единственное, что мешает забыть вызов, —
 * этот список. При добавлении нового пути расхода тест обязан упасть.
 */

const ROOT = join(__dirname, "..", "..");

/** Файлы, где остаток МОЖЕТ уйти вниз и потому нужен вызов правила. */
const MUST_SYNC = [
  "app/actions/part-orders.ts", // розничная продажа
  "app/actions/parts.ts", // правка карточки и заведение товара
  "app/actions/stocktake.ts", // проводка инвентаризации
  "lib/fulfillment/consume-parts.ts", // ремонт-ордер и отгрузка заказа
  "lib/warehouse/adjust.ts", // складская корректировка
  "lib/warehouse/receive.ts", // сторно приёмки
  "lib/warehouse/scan-consume.ts", // списание по скану
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("полнота охвата правила снятия проданного б/у", () => {
  it.each(MUST_SYNC)("%s зовёт syncSoldOutUsedPart", (rel) => {
    expect(read(rel)).toContain("syncSoldOutUsedPart(");
  });
});

/**
 * Файлы с движением остатка, которые правило НЕ зовут — и это верно, потому что
 * они остаток только увеличивают либо трогают резерв, а не количество.
 * Список закрытый: любой новый файл с движением обязан попасть либо сюда, либо
 * в MUST_SYNC — осознанно, а не по умолчанию.
 */
const REVIEWED_INCREASE_ONLY = [
  "lib/fulfillment/reservations.ts", // RESERVATION/RELEASE меняют reserved, не quantity
  "lib/warehouse/scan-receive.ts", // приёмка по скану только увеличивает
];

describe("замыкание списка путей", () => {
  it("новых путей расхода не появилось без ведома этого теста", () => {
    // Обходим прикладной слой в поисках движений остатка вниз. Ядро WMS
    // (lib/wms) исключено намеренно: правило туда не кладём.
    const suspects = ["app/actions", "lib/fulfillment", "lib/warehouse"];
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith(".ts")) {
          const src = read(rel);
          // consumeStock всегда уменьшает остаток; recordMovement может и
          // увеличивать, поэтому его одного мало для вывода — но файл с ним
          // обязан быть осознанно рассмотрен.
          // Ищем ОБА примитива, а не только consumeStock: из четырёх дефектов,
          // ради которых написан этот сторож, три шли через recordMovement —
          // проверка по одному consumeStock поймала бы лишь один.
          const moves = src.includes("consumeStock(") || src.includes("recordMovement(");
          if (moves && !src.includes("syncSoldOutUsedPart(")) found.push(rel);
        }
      }
    };
    for (const d of suspects) walk(d);
    const unknown = found.filter(
      (f) => !MUST_SYNC.includes(f) && !REVIEWED_INCREASE_ONLY.includes(f),
    );
    expect(
      unknown,
      "движение остатка без снятия проданного б/у: добавьте вызов правила либо " +
        "внесите файл в REVIEWED_INCREASE_ONLY с обоснованием",
    ).toEqual([]);
  });

  it("слепое пятно названо явно, чтобы список не считали полным автоматически", () => {
    // Прикладной файл может двигать остаток, НЕ называя ни один примитив —
    // так делает app/actions/stocktake.ts, где движение живёт в ядре WMS.
    // Такой путь sweep не найдёт: его обязан заметить человек.
    expect(MUST_SYNC).toContain("app/actions/stocktake.ts");
    const src = read("app/actions/stocktake.ts");
    expect(src.includes("consumeStock(") || src.includes("recordMovement(")).toBe(false);
  });
});
