import { redirect } from "next/navigation";

/** The standalone packing list merged into the unified «Выдача» queue —
 *  deep links keep working via this redirect. Detail stays at ./[id]. */
export default function PackingListRedirect(): never {
  redirect("/admin/warehouse/fulfill");
}
