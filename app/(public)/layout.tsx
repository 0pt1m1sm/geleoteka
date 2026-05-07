import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { FloatingButtons } from "@/components/shared/FloatingButtons";
import { CookieConsent } from "@/components/shared/CookieConsent";
import { getSession } from "@/lib/auth";
import { getCMSMany } from "@/lib/cms";

const FOOTER_CMS_KEYS = [
  "contacts.phone.service",
  "contacts.email",
  "contacts.address",
] as const;

const FOOTER_CMS_FALLBACKS: Record<string, string> = {
  "contacts.phone.service": "+7 (495) 123-45-67",
  "contacts.email": "info@geleoteka.ru",
  "contacts.address": "Москва, ул. Примерная, 15",
};

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, cms] = await Promise.all([
    getSession(),
    getCMSMany(FOOTER_CMS_KEYS, FOOTER_CMS_FALLBACKS),
  ]);
  const isStaff = session?.permissionRole === "ADMIN" || session?.permissionRole === "MANAGER";
  const cabinetHref = isStaff ? "/admin" : "/cabinet";
  const cabinetLabel = isStaff ? "Админ" : "Кабинет";

  return (
    <>
      <Header variant="public" cabinetHref={cabinetHref} cabinetLabel={cabinetLabel} />
      <main className="flex-1">{children}</main>
      <Footer
        servicePhone={cms["contacts.phone.service"]}
        email={cms["contacts.email"]}
        address={cms["contacts.address"]}
      />
      <FloatingButtons />
      <CookieConsent />
    </>
  );
}
