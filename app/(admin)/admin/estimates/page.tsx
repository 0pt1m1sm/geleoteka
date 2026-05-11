import { redirect } from "next/navigation";

// Dynamic so Next.js doesn't try to prerender this redirect — the
// shared admin layout uses useSearchParams() which bails out of static
// generation. See https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout
export const dynamic = "force-dynamic";

export default function AdminEstimatesRedirectPage(): never {
  redirect("/admin/crm/deals?stage=open&channel=SERVICE");
}
