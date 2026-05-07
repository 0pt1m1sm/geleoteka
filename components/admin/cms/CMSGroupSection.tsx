import { CMS_SCHEMA, type CMSGroup, type CMSKey, GROUP_LABELS, keysByGroup } from "@/lib/cms-schema";
import { CMSTextEditor } from "./CMSTextEditor";
import { CMSRichtextEditor } from "./CMSRichtextEditor";
import { CMSListEditor } from "./CMSListEditor";

export interface CMSCurrentValues {
  /** Map of key → current `content` payload from the DB. Missing rows fall back to schema defaults. */
  byKey: Map<string, { type: string; content: Record<string, unknown> }>;
}

interface Props {
  group: CMSGroup;
  values: CMSCurrentValues;
  /** Render this group's accordion as expanded by default. */
  defaultOpen?: boolean;
}

function readText(values: CMSCurrentValues, key: CMSKey): string {
  const def = CMS_SCHEMA[key];
  // Should never be called for list keys — guard returns empty rather than
  // attempt to coerce an array to a string.
  if (def.type !== "text" && def.type !== "richtext") return "";
  const row = values.byKey.get(key);
  if (!row) return def.defaultValue;
  const c = row.content;
  if (def.type === "text") {
    if (typeof c.value === "string") return c.value;
    if (typeof c.text === "string") return c.text;
  } else {
    if (typeof c.markdown === "string") return c.markdown;
    if (typeof c.value === "string") return c.value;
    if (typeof c.text === "string") return c.text;
  }
  return def.defaultValue;
}

// Russian noun pluralization for "ключ": 1 → ключ, 2–4 → ключа, 0 / 5–20 / etc → ключей.
function pluralizeKeys(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "ключей";
  if (last === 1) return "ключ";
  if (last >= 2 && last <= 4) return "ключа";
  return "ключей";
}

function readList(values: CMSCurrentValues, key: CMSKey): Array<Record<string, string>> {
  const def = CMS_SCHEMA[key];
  if (def.type !== "list") return [];
  const row = values.byKey.get(key);
  if (row && Array.isArray(row.content.items)) {
    return row.content.items as Array<Record<string, string>>;
  }
  return def.defaultValue as Array<Record<string, string>>;
}

export function CMSGroupSection({
  group,
  values,
  defaultOpen = false,
}: Props): React.ReactElement {
  const keys = keysByGroup(group);
  return (
    <details
      open={defaultOpen}
      className="card group"
      data-cms-group={group}
    >
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 select-none">
        <span className="text-lg font-semibold">{GROUP_LABELS[group]}</span>
        <span className="text-xs text-[var(--foreground-muted)]">
          {keys.length} {pluralizeKeys(keys.length)}
        </span>
      </summary>
      <div className="mt-6 flex flex-col gap-6">
        {keys.map((key) => {
          const def = CMS_SCHEMA[key];
          if (def.type === "text") {
            return (
              <CMSTextEditor
                key={key}
                schemaKey={key}
                label={def.label}
                initial={readText(values, key)}
              />
            );
          }
          if (def.type === "richtext") {
            return (
              <CMSRichtextEditor
                key={key}
                schemaKey={key}
                label={def.label}
                initial={readText(values, key)}
              />
            );
          }
          return (
            <CMSListEditor
              key={key}
              schemaKey={key}
              label={def.label}
              fields={def.fields}
              initial={readList(values, key)}
            />
          );
        })}
      </div>
    </details>
  );
}
