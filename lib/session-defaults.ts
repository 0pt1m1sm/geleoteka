import { getSession } from "./auth";

export interface DefaultContact {
  name: string;
  phone: string;
  email: string;
}

/**
 * Returns the contact-form prefill object for an authenticated user, or null
 * for anonymous visitors. Used by `/parts/cart` and `/booking/step-3` to
 * pre-fill the checkout/contact form. Add fields here when the contact form
 * grows (company name, loyalty tier, etc.).
 */
export async function getDefaultContact(): Promise<DefaultContact | null> {
  const session = await getSession();
  if (!session) return null;
  return {
    name: session.name,
    phone: session.phone,
    email: session.email,
  };
}
