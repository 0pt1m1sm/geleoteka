export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { parseCustomerListFilter, serializeCustomerListFilter } from "@/lib/customer-filters";
import { getAllCustomerTags, loadCustomersForList } from "@/lib/customer-queries";
import { CustomerListFilters } from "@/components/admin/customers/CustomerListFilters";
import { CustomerListRow } from "@/components/admin/customers/CustomerListRow";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CustomersPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const sp = await searchParams;
  const filter = parseCustomerListFilter(sp);

  const [customers, availableTags] = await Promise.all([
    loadCustomersForList(filter),
    getAllCustomerTags(),
  ]);

  const exportQs = serializeCustomerListFilter(filter).toString();
  const exportHref = exportQs
    ? `/api/admin/customers/export?${exportQs}`
    : "/api/admin/customers/export";

  const isFiltered =
    filter.q !== "" || filter.tagId !== null || filter.blacklist !== "all";

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Клиенты"
        actions={
          <>
            <Link href="/admin/customers/new" className="btn btn-primary">
              Создать клиента
            </Link>
            <a href={exportHref} className="btn btn-secondary">
              Скачать CSV
            </a>
          </>
        }
      />

      <CustomerListFilters initial={filter} availableTags={availableTags} />

      <div className="space-y-3">
        {customers.map((c) => (
          <CustomerListRow key={c.id} customer={c} />
        ))}

        {customers.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--foreground-muted)]">
              {isFiltered ? "Клиенты не найдены" : "Клиентов пока нет"}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
