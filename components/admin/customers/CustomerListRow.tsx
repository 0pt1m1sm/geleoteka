import Link from "next/link";
import { getTagBadgeClass } from "@/lib/customer-tags";
import type { CustomerListViewModel } from "@/lib/customer-csv";

interface Props {
  customer: CustomerListViewModel;
}

/** Presentational row used by the /admin/customers list. Server-rendered. */
export function CustomerListRow({ customer }: Props): React.ReactElement {
  const vehicleSummary = customer.vehicles.map((v) => v.model).join(", ");
  return (
    <Link
      href={`/admin/customers/${customer.id}`}
      className="card card-hover flex items-center justify-between gap-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium">{customer.name}</p>
          {customer.blacklisted ? (
            <span className="badge customer-blacklist-badge text-[10px]">ЧС</span>
          ) : null}
          {customer.tags.map((tag) => (
            <span
              key={tag.id}
              className={`badge text-[10px] ${getTagBadgeClass(tag.colorSlug)}`}
            >
              {tag.name}
            </span>
          ))}
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          {customer.phone} · {customer.email}
        </p>
        {vehicleSummary ? (
          <p className="text-xs text-[var(--foreground-muted)] mt-1">{vehicleSummary}</p>
        ) : null}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-medium">{customer.visitCount} визитов</p>
        {customer.points > 0 ? (
          <span className="badge text-[10px] badge-gold">{customer.points} б.</span>
        ) : null}
      </div>
    </Link>
  );
}
