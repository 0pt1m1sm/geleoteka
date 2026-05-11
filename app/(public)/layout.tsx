import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { FloatingButtons, type FloatingChannel } from "@/components/shared/FloatingButtons";
import { CookieConsent } from "@/components/shared/CookieConsent";
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
] as const;

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

  return (
    <>
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
