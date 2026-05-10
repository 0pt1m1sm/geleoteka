import { redirect } from "next/navigation";

export default function AdminEstimatesRedirectPage(): never {
  redirect("/admin/crm/deals?stage=open&channel=SERVICE");
}
