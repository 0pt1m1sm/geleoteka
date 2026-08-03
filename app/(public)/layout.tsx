import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { FloatingButtons, type FloatingChannel } from "@/components/shared/FloatingButtons";
import { CookieConsent } from "@/components/shared/CookieConsent";
import { YandexMetrika } from "@/components/shared/YandexMetrika";
import { getSession } from "@/lib/auth";
import {
  getCMSMany,
  getCMSText,
  getCMSRichtext,
  getCMSList,
} from "@/lib/cms";

const FOOTER_CONTACT_KEYS = [
  "contacts.phone.service",
  "contacts.email",
  "contacts.address",
  "contacts.hours.service",
] as const;

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";

/**
 * Organization + AutoRepair structured data for the whole public site.
 *
 * `AutoRepair` is the schema.org type search engines use for a garage, and it
 * inherits LocalBusiness — so one node covers both the brand and the local
 * listing (name, address, phone, hours) that drives the map/knowledge panel.
 * Values come from the CMS rows the footer already renders, so the markup can
 * never drift from what a visitor reads on the page.
 */
function buildOrganizationJsonLd(contacts: {
  phone?: string;
  email?: string;
  address?: string;
  hours?: string;
}): string {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoRepair",
    "@id": `${SITE_URL}#organization`,
    name: "Geleoteka",
    description:
      "Специализированный сервис Mercedes-Benz G-Class (Гелендваген): ремонт, ТО, запчасти и аренда.",
    url: SITE_URL,
    image: `${SITE_URL}/images/hero/g-class-hero.jpg`,
    ...(contacts.phone ? { telephone: contacts.phone } : {}),
    ...(contacts.email ? { email: contacts.email } : {}),
    ...(contacts.address
      ? { address: { "@type": "PostalAddress", streetAddress: contacts.address, addressCountry: "RU" } }
      : {}),
    ...(contacts.hours ? { openingHours: contacts.hours } : {}),
    areaServed: "RU",
    brand: { "@type": "Brand", name: "Mercedes-Benz G-Class" },
    makesOffer: {
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: "Ремонт и обслуживание Mercedes-Benz G-Class",
      },
    },
  };

  // Escape `<` so a value containing "</script>" cannot break out of the tag —
  // the sanitisation Next's own JSON-LD guidance prescribes.
  return JSON.stringify(jsonLd).replace(/</g, "\\u003c");
}

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const [
    session,
    contacts,
    description,
    servicesTitle,
    servicesItems,
    contactsTitle,
    copyright,
    cookieText,
    cookieButton,
    fabChannels,
  ] = await Promise.all([
    getSession(),
    getCMSMany(FOOTER_CONTACT_KEYS),
    getCMSRichtext("footer.description"),
    getCMSText("footer.services.title"),
    getCMSList("footer.services.items"),
    getCMSText("footer.contacts.title"),
    getCMSText("footer.copyright"),
    getCMSRichtext("cookie.banner.text"),
    getCMSText("cookie.banner.button"),
    getCMSList("fab.channels"),
  ]);

  const isStaff = session?.permissionRole === "ADMIN" || session?.permissionRole === "MANAGER";
  const cabinetHref = isStaff ? "/admin" : "/cabinet";
  const cabinetLabel = isStaff ? "Админ" : "Кабинет";

  const channels: FloatingChannel[] = fabChannels.map((c) => ({
    name: c.name ?? "",
    href: c.href ?? "#",
    color: c.color ?? "#229ED9",
    iconKey: c.iconKey ?? "",
  }));

  const organizationJsonLd = buildOrganizationJsonLd({
    phone: contacts["contacts.phone.service"],
    email: contacts["contacts.email"],
    address: contacts["contacts.address"],
    hours: contacts["contacts.hours.service"],
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: organizationJsonLd }}
      />
      <YandexMetrika />
      <div className="print:hidden">
        <Header variant="public" cabinetHref={cabinetHref} cabinetLabel={cabinetLabel} />
      </div>
      <main className="flex-1">{children}</main>
      <div className="print:hidden">
        <Footer
          servicePhone={contacts["contacts.phone.service"]}
          email={contacts["contacts.email"]}
          address={contacts["contacts.address"]}
          description={description}
          servicesTitle={servicesTitle}
          servicesItems={servicesItems.map((i) => ({ label: i.label ?? "", href: i.href ?? "#" }))}
          contactsTitle={contactsTitle}
          copyright={copyright}
        />
        <FloatingButtons channels={channels} />
        <CookieConsent text={cookieText} buttonLabel={cookieButton} />
      </div>
    </>
  );
}
