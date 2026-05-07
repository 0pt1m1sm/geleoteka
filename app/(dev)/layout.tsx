import { notFound } from "next/navigation";

/**
 * Dev-only route group. Returns 404 in production builds so the gallery never
 * leaks to end users. The 14 primitives showcased under /dev/ui need only a
 * thin wrapper — the root layout provides fonts, theme, and providers.
 */
export default function DevLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <>{children}</>;
}
