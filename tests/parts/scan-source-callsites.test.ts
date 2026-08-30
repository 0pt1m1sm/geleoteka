import { readFileSync, readdirSync } from "node:fs";
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

/**
 * Инварианты, которые обязаны присутствовать в конкретных местах вызова.
 * Каждый добавлен после того, как независимая верификация показала мутацией:
 * дефект возвращается, а весь гейт остаётся зелёным. Тесты вокруг чистых
 * функций такие подмены не видят — они живут не в правиле, а в его вызове.
 */
const CALLSITE_INVARIANTS: ReadonlyArray<{
  file: string;
  must: RegExp;
  why: string;
}> = [
  {
    file: "app/actions/parts.ts",
    must: /sku:\s*\{\s*startsWith:/,
    why:
      "серия sku для б/у ищется по НОРМАЛИЗОВАННОМУ префиксу; поиск по " +
      "where:{article} возвращает блокер — второй экземпляр при другой записи " +
      "номера не завести никогда, при ложном сообщении «повторите сохранение»",
  },
  {
    file: "app/actions/parts.ts",
    must: /validateUsedPartFields\(/,
    why: "без вызова б/у создаётся с нулём фотографий — доказательства состояния при возврате",
  },
  {
    file: "app/actions/part-references.ts",
    must: /condition:\s*"NEW"/,
    why:
      "без фильтра первый же б/у экземпляр помечает номенклатуру занятой и " +
      "блокирует создание нового товара — фича ломает саму себя",
  },
  {
    file: "app/(admin)/admin/parts/refs/page.tsx",
    must: /condition:\s*"NEW"/,
    why: "тот же запрос во втором файле: список справочника прячет «Создать товар»",
  },
  {
    file: "app/sitemap.ts",
    must: /condition:\s*"NEW"/,
    why:
      "до Story 5 у б/у нет ни canonical, ни noindex — из карты сайта их " +
      "адреса уходят прямо поисковику, минуя витрину",
  },
  {
    file: "app/(public)/parts/page.tsx",
    must: /condition:\s*"NEW"/,
    why: "витрина показала бы неподписанные дубли карточек до Story 3",
  },
];

describe("инварианты в местах вызова", () => {
  it.each(CALLSITE_INVARIANTS)("$file: $why", ({ file, must }) => {
    expect(read(file)).toMatch(must);
  });
});

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
    // Обходим репозиторий, а не перечитываем известные файлы: иначе тест
    // проверял бы лишь то, что вызовы никуда не делись, и седьмое место
    // осталось бы невидимым — название обещало бы больше, чем делает.
    const known = new Set([...DERIVED_SOURCE_FILES, ...LITERAL_SOURCE_FILES.map((x) => x.file)]);
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === "generated") continue;
          walk(rel);
        } else if (/\.(ts|tsx)$/.test(e.name) && resolverCalls(read(rel)).length > 0) {
          found.push(rel);
        }
      }
    };
    walk("app");
    walk("lib");
    const unknown = found.filter((f) => !known.has(f) && !f.includes("resolve-part-code"));
    expect(unknown, "резолвер подключён там, где источник никто не проверяет").toEqual([]);
    for (const k of known) expect(found).toContain(k);
  });
});
