import { Header } from "@/components/shared/Header";
import { Sidebar } from "@/components/shared/Sidebar";
import { adminNav, filterNavForPermissions } from "@/lib/admin-nav";
import { rolePermissions } from "@/lib/authz";
import { getSession } from "@/lib/auth";
import { NOINDEX } from "@/lib/seo";

// Одна точка на все страницы админки: без этого они наследовали
// robots:index из корневого layout, и URL, узнанный Яндексом из Метрики,
// формально был индексируем (контент за редиректом, но зачем рисковать).
export const metadata = NOINDEX;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const role = session?.permissionRole ?? "";
  // ADMIN is answered without a lookup — it opens everything by definition, and
  // most admin traffic is the admin, so the common path stays query-free.
  const granted = role === "ADMIN" ? null : await rolePermissions(role);
  const nav = filterNavForPermissions(adminNav, granted);
  return (
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[var(--background)]">
      <aside className="w-64 border-r border-[var(--border)] bg-[var(--card)] hidden md:flex flex-col shrink-0 print:hidden">
        <Sidebar nav={nav} brandLabel="Админ-панель" />
      </aside>
      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        <div className="print:hidden">
          <Header variant="admin" brandLabel="Админ-панель" nav={nav} />
        </div>
        <main className="flex-1 p-4 md:p-6 min-w-0 max-w-full print:p-0">{children}</main>
      </div>
    </div>
  );
}
