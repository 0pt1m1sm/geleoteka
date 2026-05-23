import { Header } from "@/components/shared/Header";
import { Sidebar } from "@/components/shared/Sidebar";
import { adminNav, filterNavForRole } from "@/lib/admin-nav";
import { getSession } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const nav = filterNavForRole(adminNav, session?.permissionRole ?? "");
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
