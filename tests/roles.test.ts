import { describe, expect, it } from "vitest";
import { entityFlags } from "@/lib/roles";

describe("entityFlags", () => {
  // The duplicate that prompted this: the badge already said "Клиент".
  it("drops the flag the access-role badge already shows", () => {
    expect(entityFlags({ isCustomer: true, isMaster: false }, "CLIENT")).toEqual([]);
  });

  it("keeps a flag the badge cannot express", () => {
    expect(entityFlags({ isCustomer: false, isMaster: true }, "NONE")).toEqual(["Мастер"]);
    expect(entityFlags({ isCustomer: false, isMaster: true }, "MANAGER")).toEqual(["Мастер"]);
  });

  it("drops only the duplicate when someone is both", () => {
    expect(entityFlags({ isCustomer: true, isMaster: true }, "CLIENT")).toEqual(["Мастер"]);
  });

  it("keeps both when neither matches the role", () => {
    expect(entityFlags({ isCustomer: true, isMaster: true }, "ADMIN")).toEqual([
      "Клиент",
      "Мастер",
    ]);
  });

  it("shows nothing for a plain staff account", () => {
    expect(entityFlags({ isCustomer: false, isMaster: false }, "MANAGER")).toEqual([]);
  });
});
