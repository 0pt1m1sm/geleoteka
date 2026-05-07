import Link from "next/link";
import type { ReactNode } from "react";

interface NarrowFormPageProps {
  /** Page title shown above the form card. */
  title: string;
  /** Optional muted-text caption below the title (links, hints, etc.). */
  description?: ReactNode;
  /** Form contents — typically <form> with fields and submit button. */
  children: ReactNode;
}

/**
 * Centered narrow-form layout used by public auth pages (login, register,
 * password reset). Provides full-screen centered wrapper, brand link header,
 * heading + optional description, and slot for the form below.
 *
 * NOT used by admin pages — admin pages render inside the admin sidebar
 * layout and use a different wrapper. Admin "create entity" pages use
 * <AdminFormShell/> instead.
 */
export function NarrowFormPage({ title, description, children }: NarrowFormPageProps): React.ReactElement {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-display text-2xl font-bold">
            <span className="text-[var(--color-accent)]">Geleoteka</span>
          </Link>
          <h1 className="text-2xl font-bold mt-6 mb-2">{title}</h1>
          {description && (
            <p className="text-[var(--foreground-muted)]">{description}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
