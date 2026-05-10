import { redirect } from "next/navigation";

export default function AdminEstimatesRedirectPage(): never {
  redirect("/admin/repair-orders?status=ESTIMATE");
}
