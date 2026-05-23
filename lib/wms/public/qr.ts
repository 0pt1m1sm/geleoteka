/**
 * Typed WMS QR format + parser. Pure and host-agnostic (no DB, no host imports)
 * so it extracts with the core. A QR payload carries ONLY an object identifier:
 *   WMS:PART:<code> · WMS:LOC:<code> · WMS:ORDER:<number> · WMS:BOX:<code>
 * An un-prefixed payload is treated as a legacy raw code (backward-compat for
 * already-printed barcode/article labels). A malformed `WMS:` payload is UNKNOWN.
 */

export type ScanObjectType = "PART" | "LOC" | "ORDER" | "BOX";

export type ParsedScanCode =
  | { type: ScanObjectType; id: string; raw: string }
  | { type: "RAW"; id: string; raw: string }
  | { type: "UNKNOWN"; raw: string };

const TYPED_RE = /^WMS:(PART|LOC|ORDER|BOX):(.+)$/i;

/** Parse a scanned payload into a typed object reference. LOC ids are normalized
 *  upper/trimmed to match placement location normalization; other ids are
 *  trimmed but case-preserved (barcodes/articles can be case-sensitive). */
export function parseScanCode(raw: string): ParsedScanCode {
  const trimmed = raw.trim();
  const match = TYPED_RE.exec(trimmed);
  if (match) {
    const type = match[1].toUpperCase() as ScanObjectType;
    const id = type === "LOC" ? match[2].trim().toUpperCase() : match[2].trim();
    if (!id) return { type: "UNKNOWN", raw: trimmed };
    return { type, id, raw: trimmed };
  }
  if (/^WMS:/i.test(trimmed)) return { type: "UNKNOWN", raw: trimmed };
  if (!trimmed) return { type: "UNKNOWN", raw: trimmed };
  return { type: "RAW", id: trimmed, raw: trimmed };
}

/** Build a typed QR payload string for a label. */
export function formatScanCode(type: ScanObjectType, id: string): string {
  return `WMS:${type}:${id}`;
}
