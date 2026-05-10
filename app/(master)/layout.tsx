import { redirect } from "next/navigation";
import { Header } from "@/components/shared/Header";
import { Sidebar } from "@/components/shared/Sidebar";
import { masterNav } from "@/lib/master-nav";
import { getSession } from "@/lib/auth";

export default async function MasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Admins/managers can also enter the master portal (e.g. to inspect a
  // tech's queue). Plain CLIENTs are bounced to their cabinet.
  const role = session.permissionRole;
  if (role !== "MASTER" && role !== "MANAGER" && role !== "ADMIN") {
    redirect("/cabinet");
  }

  return (
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[var(--background)]">
      <aside className="w-64 border-r border-[var(--border)] bg-[var(--card)] hidden md:flex flex-col shrink-0">
        <Sidebar nav={masterNav} brandLabel="Кабинет мастера" showSiteLink={false} />
      </aside>
      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        <Header variant="portal" brandLabel="Кабинет мастера" nav={masterNav} />
        <main className="flex-1 p-4 md:p-6 min-w-0 max-w-full">{children}</main>
      </div>
    </div>
  );
}
