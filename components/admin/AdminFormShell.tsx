import type { ReactNode } from "react";

interface AdminFormShellProps {
  /** Server-action error from useActionState's state.error. Null/undefined = no banner. */
  error?: string | null;
  /** Form contents — typically the fields and submit button. */
  children: ReactNode;
}

/**
 * Wraps admin form content with a server-action error banner above the
 * children. Used by 4 admin form components (PartForm, PartEditForm,
 * RentalEditForm, SupplierEditForm) and the admin/suppliers/new page.
 *
 * The shell does NOT own useActionState — each consumer keeps its own. The
 * shell does NOT render a title — admin pages already have a page-level <h1>
 * outside the form (different visual hierarchy than a shell <h2> would
 * produce).
 *
 * Renders as a Fragment so the consumer's existing <form className="card ...">
 * remains the visual card container.
 */
export function AdminFormShell({ error, children }: AdminFormShellProps): React.ReactElement {
  return (
    <>
      {error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {children}
    </>
  );
}
