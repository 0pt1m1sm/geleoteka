/**
 * Verifies expandCellSpec + CELL_RE behaviour from lib/warehouse/codes.
 *
 * expandCellSpec is a pure function (no Prisma, no DB, no env) — this verifier
 * locks in its documented inputs/outputs so future refactors (notably the
 * deferred `lib/warehouse/` rename) have a regression baseline. The
 * `dotenv/config` import is kept only for consistency with sibling verifiers.
 */
import "dotenv/config";
import { CELL_RE, expandCellSpec } from "../lib/warehouse/codes";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function expectArray(r: string[] | { error: string }, msg: string): string[] {
  assert(
    Array.isArray(r),
    `${msg} — expected array, got error: ${(r as { error: string }).error}`,
  );
  return r as string[];
}

function expectError(
  r: string[] | { error: string },
  expected: string,
  msg: string,
): void {
  assert(!Array.isArray(r), `${msg} — expected error, got array`);
  const got = (r as { error: string }).error;
  assert(got === expected, `${msg} — error text mismatch: got "${got}"`);
}

function arrEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function main(): Promise<void> {
  // ---- positive: single code ----
  const single = expectArray(expandCellSpec("A-1-1"), "single code");
  assert(arrEq(single, ["A-1-1"]), "single code body");

  // ---- positive: 1-D range ----
  const oneD = expectArray(expandCellSpec("A-1-1..A-1-3"), "1-D range");
  assert(arrEq(oneD, ["A-1-1", "A-1-2", "A-1-3"]), "1-D range body");

  // ---- positive: case + whitespace normalisation ----
  const norm = expectArray(expandCellSpec(" a-1-1 .. A-1-2 "), "case+whitespace");
  assert(arrEq(norm, ["A-1-1", "A-1-2"]), "case+whitespace body");

  // ---- positive: 2-D cartesian product ----
  const twoD = expectArray(expandCellSpec("A-1-1..A-2-2"), "2-D range");
  assert(
    arrEq(twoD, ["A-1-1", "A-1-2", "A-2-1", "A-2-2"]),
    "2-D range body",
  );

  // ---- negative: empty spec ----
  expectError(
    expandCellSpec(""),
    "Укажите код или диапазон ячеек",
    "empty spec",
  );

  // ---- negative: mismatched segment count ----
  expectError(
    expandCellSpec("A-1..A-1-2"),
    "Диапазон: коды должны иметь одинаковую структуру",
    "mismatched segment count",
  );

  // ---- negative: oversized numeric range (hi-lo > 500) ----
  expectError(
    expandCellSpec("A-0..A-501"),
    "Слишком большой диапазон",
    "oversized numeric range",
  );

  // ---- negative: oversized cartesian product (>1000) ----
  // 30 * 40 = 1200 codes; each per-dim diff stays under 500.
  expectError(
    expandCellSpec("A-1-1..A-30-40"),
    "Слишком много ячеек (макс. 1000)",
    "oversized cartesian product",
  );

  // ---- negative: non-numeric range segment (1-indexed) ----
  expectError(
    expandCellSpec("A-1..B-1"),
    "Сегмент 1: перебор возможен только по числам",
    "non-numeric range segment",
  );

  // ---- CELL_RE smoke tests ----
  assert(CELL_RE.test("A-1-1"), "CELL_RE matches A-1-1");
  assert(!CELL_RE.test("a-1"), "CELL_RE rejects lowercase a-1");
  assert(!CELL_RE.test("A".repeat(33)), "CELL_RE rejects 33-char string");

  console.log("OK: verify-cell-codes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
