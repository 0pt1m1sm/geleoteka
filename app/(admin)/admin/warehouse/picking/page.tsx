import { redirect } from "next/navigation";

/** The standalone picking list merged into the unified «Выдача» queue —
 *  deep links keep working via this redirect. Detail stays at ./[id]. */
export default function PickingListRedirect(): never {
  redirect("/admin/warehouse/fulfill");
}
