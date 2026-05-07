import { CMS_SCHEMA, type CMSKey, type CMSBlockType } from "@/lib/cms-schema";

export type CMSValidationResult =
  | {
      ok: true;
      type: CMSBlockType;
      /** Normalised content — only the keys defined in the schema are kept. */
      normalized: Record<string, unknown>;
    }
  | { ok: false; error: string };

/**
 * Pure validator. No I/O, no `next/cache`, no Prisma — safe to call from
 * a verify script without a DB connection. The server action wraps this
 * and persists `{ type, content: normalized }` on success.
 */
export function validateCMSContent(
  key: string,
  content: unknown,
): CMSValidationResult {
  if (!(key in CMS_SCHEMA)) return { ok: false, error: "Unknown key" };
  const def = CMS_SCHEMA[key as CMSKey];

  if (typeof content !== "object" || content === null) {
    return { ok: false, error: "Content must be an object" };
  }
  const c = content as Record<string, unknown>;

  switch (def.type) {
    case "text": {
      if (typeof c.value !== "string") {
        return { ok: false, error: "Expected { value: string }" };
      }
      return { ok: true, type: "text", normalized: { value: c.value } };
    }
    case "richtext": {
      if (typeof c.markdown !== "string") {
        return { ok: false, error: "Expected { markdown: string }" };
      }
      return {
        ok: true,
        type: "richtext",
        normalized: { markdown: c.markdown },
      };
    }
    case "list": {
      if (!Array.isArray(c.items)) {
        return { ok: false, error: "Expected { items: array }" };
      }
      const fields = def.fields;
      const validatedRows: Array<Record<string, string>> = [];
      for (let i = 0; i < c.items.length; i++) {
        const row = c.items[i];
        if (typeof row !== "object" || row === null) {
          return { ok: false, error: `Row ${i}: must be an object` };
        }
        const r = row as Record<string, unknown>;
        if (Object.keys(r).length !== fields.length) {
          return {
            ok: false,
            error: `Row ${i}: expected exactly ${fields.length} field(s) (${fields.map((f) => f.key).join(", ")})`,
          };
        }
        const normRow: Record<string, string> = {};
        for (const f of fields) {
          if (typeof r[f.key] !== "string") {
            return {
              ok: false,
              error: `Row ${i}.${f.key}: expected string`,
            };
          }
          normRow[f.key] = r[f.key] as string;
        }
        validatedRows.push(normRow);
      }
      return { ok: true, type: "list", normalized: { items: validatedRows } };
    }
  }
}
