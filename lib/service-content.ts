/**
 * Контент страницы услуги: FAQ хранится в Service.faq как [{ q, a }], а в
 * админке редактируется простым текстовым форматом «блоками»:
 *
 *   Сколько идёт замена масла?
 *   Час-полтора вместе с проверкой по чек-листу.
 *
 *   Нужна ли запись?
 *   Да, свободные окна видны в онлайн-записи.
 *
 * Пустая строка разделяет вопросы; первая строка блока — вопрос, остальные —
 * ответ. Формат выбран вместо JSON-поля, чтобы менеджер не мог сломать
 * страницу пропущенной кавычкой.
 */

export interface ServiceFaqItem {
  q: string;
  a: string;
}

export function parseFaqBlocks(raw: string): ServiceFaqItem[] {
  const out: ServiceFaqItem[] = [];
  for (const block of raw.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;
    out.push({ q: lines[0], a: lines.slice(1).join(" ") });
  }
  return out;
}

export function faqToBlocks(faq: ServiceFaqItem[]): string {
  return faq.map((item) => `${item.q}\n${item.a}`).join("\n\n");
}

/** Валидация значения из БД: Json-поле могло быть заполнено чем угодно. */
export function normalizeFaq(value: unknown): ServiceFaqItem[] {
  if (!Array.isArray(value)) return [];
  const out: ServiceFaqItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.q === "string" && typeof e.a === "string" && e.q.trim() && e.a.trim()) {
      out.push({ q: e.q.trim(), a: e.a.trim() });
    }
  }
  return out;
}
