import { Header } from "@/components/shared/Header";
import { Sidebar } from "@/components/shared/Sidebar";
import { adminNav } from "@/lib/admin-nav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <aside className="w-64 border-r border-[var(--border)] bg-[var(--card)] hidden md:flex flex-col">
        <Sidebar nav={adminNav} brandLabel="Админ-панель" />
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <Header variant="admin" brandLabel="Админ-панель" nav={adminNav} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
