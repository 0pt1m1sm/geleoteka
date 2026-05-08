import { Header } from "@/components/shared/Header";
import { Sidebar } from "@/components/shared/Sidebar";
import { portalNav } from "@/lib/portal-nav";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[var(--background)]">
      <aside className="w-64 border-r border-[var(--border)] bg-[var(--card)] hidden md:flex flex-col shrink-0">
        <Sidebar nav={portalNav} brandLabel="Личный кабинет" showSiteLink={false} />
      </aside>
      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        <Header variant="portal" brandLabel="Личный кабинет" nav={portalNav} />
        <main className="flex-1 p-4 md:p-6 min-w-0 max-w-full">{children}</main>
      </div>
    </div>
  );
}
