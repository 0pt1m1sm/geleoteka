import { describe, expect, it } from "vitest";
import { isSolelyTheirs } from "@/lib/email/erasure";

const CUSTOMER = ["ivan@mail.ru", "ivan.work@corp.ru"];
const SHOP = "sales@geleoteka.ru";

function msg(p: Partial<{ fromEmail: string; toEmails: string[]; ccEmails: string[] }>) {
  return { fromEmail: SHOP, toEmails: [], ccEmails: [], ...p };
}

describe("isSolelyTheirs", () => {
  it("takes mail the person wrote", () => {
    expect(isSolelyTheirs(msg({ fromEmail: "ivan@mail.ru", toEmails: [SHOP] }), CUSTOMER)).toBe(true);
  });

  it("takes mail written to them and nobody else", () => {
    expect(isSolelyTheirs(msg({ toEmails: ["ivan@mail.ru"] }), CUSTOMER)).toBe(true);
  });

  it("takes mail spanning several of their own addresses", () => {
    expect(
      isSolelyTheirs(msg({ toEmails: ["ivan@mail.ru"], ccEmails: ["ivan.work@corp.ru"] }), CUSTOMER),
    ).toBe(true);
  });

  it("matches addresses case-insensitively", () => {
    expect(isSolelyTheirs(msg({ toEmails: ["Ivan@Mail.RU"] }), CUSTOMER)).toBe(true);
    expect(isSolelyTheirs(msg({ fromEmail: " IVAN@mail.ru " }), CUSTOMER)).toBe(true);
  });

  // The reason this predicate exists: an address is a shared key, so a thread
  // with other people on it is their correspondence too and must survive.
  it("keeps a thread that has another recipient", () => {
    expect(
      isSolelyTheirs(msg({ toEmails: ["ivan@mail.ru", "supplier@parts.ru"] }), CUSTOMER),
    ).toBe(false);
  });

  it("keeps a thread where they were only CC'd by someone else", () => {
    expect(
      isSolelyTheirs(
        msg({ fromEmail: "supplier@parts.ru", toEmails: [SHOP], ccEmails: ["ivan@mail.ru"] }),
        CUSTOMER,
      ),
    ).toBe(false);
  });

  it("keeps mail with no recipients at all", () => {
    expect(isSolelyTheirs(msg({ fromEmail: "someone@else.ru" }), CUSTOMER)).toBe(false);
  });

  it("keeps everything when no addresses are known", () => {
    expect(isSolelyTheirs(msg({ toEmails: ["ivan@mail.ru"] }), [])).toBe(false);
  });
});
