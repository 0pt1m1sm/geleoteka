import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Сторож МЕСТ ВЫЗОВА, а не хелпера.
 *
 * Один и тот же урок всплыл трижды. Верификация Story 1 показала мутацией, что
 * тесты вокруг чистых функций не ловят подмену в вызывающем коде. Story 2 это
 * не закрыла — и блокер B1 оказался буквально такой подменой: в самом ходовом
 * месте сканирования источник был захардкожен `"label"`, хотя резолвер
 * обслуживает и ручной ввод. Тесты на `scanSourceFor` его не поймали, потому
 * что сама функция была верной.
 *
 * Этот тест читает исходники и требует, чтобы КАЖДЫЙ вызов резолвера брал
 * источник из `scanSourceFor(...)`. Литерал допускается только там, где он
 * обоснован природой эндпоинта, и такие места перечислены поимённо ниже —
 * добавление нового литерала обязано быть осознанным, а не незаметным.
 *
 * Цена ошибки, которую он стережёт: списание остатка с чужой позиции и
 * отгрузка б/у по цене новой.
 */

const ROOT = join(__dirname, "..", "..");

/** Места, где источник обязан вычисляться из типа разобранного кода. */
const DERIVED_SOURCE_FILES = [
  "app/actions/picking.ts",
  "app/actions/packing.ts",
  "app/actions/stocktake.ts",
  "app/actions/supplier-orders.ts",
  "app/api/warehouse/scan/route.ts",
];

/**
 * Единственное исключение: эндпоинт принимает `?code=` из ручного ввода,
 * типизированных этикеток там не бывает. Литерал здесь осознан.
 */
const LITERAL_SOURCE_FILES: ReadonlyArray<{ file: string; literal: string }> = [
  { file: "app/api/stock/lookup/route.ts", literal: '"raw"' },
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Аргументы каждого вызова resolvePartIdByCode в файле. */
function resolverCalls(src: string): string[] {
  const calls: string[] = [];
  let from = 0;
  for (;;) {
    const i = src.indexOf("resolvePartIdByCode(", from);
    if (i === -1) break;
    let depth = 0;
    let j = i + "resolvePartIdByCode".length;
    const start = j;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    calls.push(src.slice(start, j + 1));
    from = j + 1;
  }
  return calls;
}

describe("источник кода в местах вызова резолвера", () => {
  it.each(DERIVED_SOURCE_FILES)("%s берёт источник из scanSourceFor", (rel) => {
    const calls = resolverCalls(read(rel));
    expect(calls.length, `в ${rel} нет вызова resolvePartIdByCode`).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call, `в ${rel} источник не выведен из типа кода`).toContain("scanSourceFor(");
      // Именно этот литерал был блокером B1: он молча уводил ручной ввод
      // в новую позицию.
      expect(call, `в ${rel} источник захардкожен литералом`).not.toMatch(/["']label["']/);
    }
  });

  it.each(LITERAL_SOURCE_FILES)(
    "$file использует обоснованный литерал $literal",
    ({ file, literal }) => {
      const calls = resolverCalls(read(file));
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call).toContain(literal);
      }
    },
  );

  it("новых мест вызова резолвера не появилось без ведома этого теста", () => {
    // Если резолвер подключили где-то ещё, источник там никто не проверял.
    const known = new Set([...DERIVED_SOURCE_FILES, ...LITERAL_SOURCE_FILES.map((x) => x.file)]);
    const found = new Set<string>();
    for (const rel of known) {
      if (resolverCalls(read(rel)).length > 0) found.add(rel);
    }
    expect(found.size).toBe(known.size);
  });
});
