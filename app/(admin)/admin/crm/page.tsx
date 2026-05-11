import { redirect } from "next/navigation";

// Single dashboard at /admin. CRM widgets live there alongside ops.
// This route stays as a redirect for any external links / bookmarks.
export const dynamic = "force-dynamic";

export default function CrmRootRedirectPage(): never {
  redirect("/admin");
}
