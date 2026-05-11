import { Header } from "@/components/shared/Header";
import { Sidebar } from "@/components/shared/Sidebar";
import { adminNav } from "@/lib/admin-nav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[var(--background)]">
      <aside className="w-64 border-r border-[var(--border)] bg-[var(--card)] hidden md:flex flex-col shrink-0 print:hidden">
        <Sidebar nav={adminNav} brandLabel="Админ-панель" />
      </aside>
      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        <div className="print:hidden">
          <Header variant="admin" brandLabel="Админ-панель" nav={adminNav} />
        </div>
        <main className="flex-1 p-4 md:p-6 min-w-0 max-w-full print:p-0">{children}</main>
      </div>
    </div>
  );
}
