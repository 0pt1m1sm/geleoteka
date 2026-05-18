/**
 * Constants shared between server-only `lib/settings.ts` / `app/actions/settings.ts`
 * and client-side `components/admin/settings/SettingGroupForm.tsx`.
 *
 * Kept in a separate file because `lib/settings.ts` is server-only (uses the
 * DB client) and "use server" action files can only export async functions —
 * neither can be imported from a client component.
 */

/**
 * Placeholder rendered in secret inputs when a value is already set, so the
 * operator can see "filled, but hidden". Submitting it unchanged is a no-op
 * (the upsertSettings action recognises this exact string).
 */
export const SECRET_PLACEHOLDER = "••••••";
