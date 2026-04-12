import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminMobileNav } from "@/components/admin/AdminMobileNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminMobileNav />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
