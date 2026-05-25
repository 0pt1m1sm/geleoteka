/**
 * Verifies the BUSINESS_TZ (Europe/Moscow, UTC+3) datetime-local round-trip used
 * for promisedAt: a stored UTC instant renders as the correct Moscow wall-clock,
 * and a Moscow wall-clock string parses back to the right UTC instant. Pure
 * functions — no DB.
 */
import { formatForDatetimeLocalInput, parseDatetimeLocalInput } from "../lib/timezone";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

console.log("[verify-timezone-promisedat] starting");

// 00:07Z → Moscow 03:07 (the bug was: server formatted in UTC → showed 00:07).
const utc = new Date("2026-05-26T00:07:00.000Z");
const shown = formatForDatetimeLocalInput(utc);
assert(shown === "2026-05-26T03:07", `UTC 00:07Z should render as Moscow 2026-05-26T03:07 (got ${shown})`);
console.log("  ✓ UTC instant → Moscow wall-clock (00:07Z → 03:07)");

// Moscow 03:07 entered in the form → stored as 00:07Z.
const back = parseDatetimeLocalInput("2026-05-26T03:07");
assert(back?.toISOString() === "2026-05-26T00:07:00.000Z", `Moscow 03:07 should store as 00:07Z (got ${back?.toISOString()})`);
console.log("  ✓ Moscow wall-clock → UTC instant (03:07 → 00:07Z)");

// Round-trip is lossless to the minute.
const rt = parseDatetimeLocalInput(formatForDatetimeLocalInput(utc));
assert(rt?.getTime() === utc.getTime(), "round-trip parse(format(d)) must equal d");
console.log("  ✓ round-trip is lossless");

// Edge cases.
assert(formatForDatetimeLocalInput(null) === "", "null → empty string");
assert(parseDatetimeLocalInput("garbage") === null, "invalid input → null");
console.log("  ✓ null/invalid handled");

console.log("[verify-timezone-promisedat] PASS");
