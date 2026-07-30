import { NOINDEX } from "@/lib/seo";

/**
 * The page itself is a Client Component and cannot export metadata, so the
 * noindex for this private route lives on its layout.
 */
export const metadata = NOINDEX;

export default function Layout({ children }: { children: React.ReactNode }): React.ReactNode {
  return children;
}
