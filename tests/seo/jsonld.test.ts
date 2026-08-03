import { describe, expect, it } from "vitest";

import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildOrganizationJsonLd,
  buildProductJsonLd,
  buildRentalJsonLd,
  buildServiceJsonLd,
  parseRussianSchedule,
  toJsonLdScript,
} from "@/lib/seo-jsonld";

function parse(markup: string): Record<string, unknown> {
  return JSON.parse(markup.replace(/\\u003c/g, "<"));
}

describe("parseRussianSchedule", () => {
  it("converts ranges and single days, skipping выходной", () => {
    expect(
      parseRussianSchedule("Пн–Пт: 10:00–20:00, Сб: 10:00–16:00, Вс: выходной"),
    ).toEqual(["Mo-Fr 10:00-20:00", "Sa 10:00-16:00"]);
  });

  it("accepts plain hyphens and mixed case", () => {
    expect(parseRussianSchedule("пн-вс: 9:00-21:00")).toEqual(["Mo-Su 9:00-21:00"]);
  });

  it("returns empty for garbage instead of guessing", () => {
    expect(parseRussianSchedule("круглосуточно")).toEqual([]);
  });
});

describe("toJsonLdScript", () => {
  it("escapes < so </script> cannot break out", () => {
    const out = toJsonLdScript({ name: "</script><b>x" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });
});

describe("buildOrganizationJsonLd", () => {
  it("builds AutoRepair with verbatim address, parsed hours and https-only sameAs", () => {
    const org = parse(
      buildOrganizationJsonLd({
        phone: "+7 495 000-00-00",
        address: "Московская область, Химки, ул. Примерная, 1",
        hours: "Пн–Пт: 10:00–20:00",
        sameAs: ["https://t.me/geleoteka", "#", "http://insecure.example"],
      }),
    );
    expect(org["@type"]).toBe("AutoRepair");
    const address = org.address as Record<string, string>;
    expect(address.streetAddress).toBe("Московская область, Химки, ул. Примерная, 1");
    // Города-выдумки в addressLocality нет: NAP должен совпадать с карточкой
    // Яндекс Бизнеса дословно.
    expect(address).not.toHaveProperty("addressLocality");
    expect(org.openingHours).toEqual(["Mo-Fr 10:00-20:00"]);
    expect(org.sameAs).toEqual(["https://t.me/geleoteka"]);
    expect(org.priceRange).toBeTruthy();
  });

  it("omits empty branches entirely", () => {
    const org = parse(buildOrganizationJsonLd({}));
    expect(org).not.toHaveProperty("telephone");
    expect(org).not.toHaveProperty("address");
    expect(org).not.toHaveProperty("openingHours");
    expect(org).not.toHaveProperty("sameAs");
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("numbers positions and drops item on the last crumb", () => {
    const bc = parse(
      buildBreadcrumbJsonLd([
        { name: "Главная", href: "/" },
        { name: "Услуги", href: "/services" },
        { name: "АКПП" },
      ]),
    );
    const items = bc.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0].position).toBe(1);
    expect(items[1].item).toMatch(/\/services$/);
    expect(items[2]).not.toHaveProperty("item");
  });
});

describe("buildServiceJsonLd", () => {
  it("uses AggregateOffer for a price range", () => {
    const s = parse(
      buildServiceJsonLd({ name: "АКПП", slug: "transmission", priceMin: 5000, priceMax: 250000 }),
    );
    const offers = s.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice).toBe(5000);
    expect(offers.highPrice).toBe(250000);
  });

  it("uses a plain Offer for a single price and none when priceless", () => {
    const one = parse(buildServiceJsonLd({ name: "x", slug: "x", priceMin: 3000, priceMax: null }));
    expect((one.offers as Record<string, unknown>)["@type"]).toBe("Offer");
    const free = parse(buildServiceJsonLd({ name: "x", slug: "x" }));
    expect(free).not.toHaveProperty("offers");
  });
});

describe("buildProductJsonLd", () => {
  it("maps stock to schema availability", () => {
    const inStock = parse(
      buildProductJsonLd({
        name: "Тормозной диск",
        slug: "disc",
        article: "A463",
        price: 12000,
        inStock: true,
      }),
    );
    expect((inStock.offers as Record<string, unknown>).availability).toBe(
      "https://schema.org/InStock",
    );
    const out = parse(
      buildProductJsonLd({ name: "x", slug: "x", article: "a", price: 1, inStock: false }),
    );
    expect((out.offers as Record<string, unknown>).availability).toBe(
      "https://schema.org/OutOfStock",
    );
  });
});

describe("buildRentalJsonLd", () => {
  it("marks the daily price with a unit specification", () => {
    const rental = parse(
      buildRentalJsonLd({
        name: "Mercedes-Benz G 63 AMG",
        path: "/rentals/abc",
        dailyPrice: 45000,
      }),
    );
    expect(rental.name).toBe("Аренда Mercedes-Benz G 63 AMG в Москве");
    const offers = rental.offers as Record<string, unknown>;
    expect(offers.price).toBe(45000);
    const spec = offers.priceSpecification as Record<string, unknown>;
    expect(spec.unitText).toBe("сутки");
    expect((rental.url as string).endsWith("/rentals/abc")).toBe(true);
  });
});

describe("buildFaqJsonLd", () => {
  it("builds FAQPage with question/answer pairs", () => {
    const faq = parse(
      buildFaqJsonLd([{ question: "Сколько стоит ТО?", answer: "От 25 000 ₽." }]),
    );
    expect(faq["@type"]).toBe("FAQPage");
    const q = (faq.mainEntity as Array<Record<string, unknown>>)[0];
    expect(q.name).toBe("Сколько стоит ТО?");
    expect((q.acceptedAnswer as Record<string, string>).text).toBe("От 25 000 ₽.");
  });
});
