import { getSession } from "@/lib/auth";
import { parseCustomerListFilter } from "@/lib/customer-filters";
import { loadCustomersForList } from "@/lib/customer-queries";
import { buildCustomersCsv, toCsvRow } from "@/lib/customer-csv";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const filter = parseCustomerListFilter(sp);
  const rows = await loadCustomersForList(filter);
  const csv = buildCustomersCsv(rows.map(toCsvRow));

  const datePart = formatDate(new Date(), { dateStyle: "short" }).replace(/\./g, "-");
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${datePart}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
