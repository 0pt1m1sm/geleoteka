"use client";

/**
 * Shared client-side draft for visitor contact info.
 *
 * Any public-facing form that asks for name/phone/email should use this store
 * so a user who fills the rental form, navigates away, and returns to the
 * parts cart sees their info pre-filled (and vice versa). The booking flow
 * has its own dedicated `booking-data` store which also writes through here
 * via `setContactDraft` after Step 3 submit.
 *
 * Stored as plain object in localStorage. Cleared by pages on successful
 * submission of the actual order — drafts are never persistent post-checkout.
 */

import { createLocalStorageStore } from "@/lib/local-storage-store";

export interface ContactDraft {
  name: string;
  phone: string;
  email: string;
  notes: string;
}

const INITIAL: ContactDraft = { name: "", phone: "", email: "", notes: "" };

function isContactDraft(p: unknown): p is ContactDraft {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return typeof o.name === "string"
    && typeof o.phone === "string"
    && typeof o.email === "string"
    && typeof o.notes === "string";
}

export const contactDraftStore = createLocalStorageStore<ContactDraft>(
  "contact-draft",
  INITIAL,
  (parsed) => (isContactDraft(parsed) ? { ok: parsed } : null),
);

export function clearContactDraft(): void {
  contactDraftStore.setStore(INITIAL);
}
