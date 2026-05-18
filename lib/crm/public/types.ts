/**
 * Public types of the CRM module.
 *
 * Other modules (Service / Parts / Rentals) import from this file when
 * they need to talk to CRM. The internal layout of the CRM module
 * (lib/crm/internal/**, components/crm/**, app/(crm)/**) is intentionally
 * not exported.
 *
 * Treat additions here as a deliberate widening of the cross-module
 * contract — if another module's flow can be expressed without a new
 * type here, prefer that.
 */

import type { DealChannel, DealLineType, DealStage } from "@/app/generated/prisma/client";

export type { DealChannel, DealLineType, DealStage };

export interface CreateDealInput {
  customerUserId: string;
  vehicleId?: string | null;
  ownerUserId?: string | null;
  channel: DealChannel;
  source: string;
  /**
   * Initial commercial stage. Defaults to NEW — flows that are
   * point-of-sale (retail parts checkout, walk-in rental) should pass
   * IN_PROGRESS so the deal is marked accepted on creation.
   */
  initialStage?: DealStage;
  /**
   * Pre-populated line items. Written into the deal's initial DRAFT
   * Estimate (every deal gets one — see `lib/crm/public/create-deal`).
   * Used by single-shot creates (booking, cart checkout, rental) that
   * already know the full scope at creation time.
   */
  lines?: CreateDealLineInput[];
  /**
   * Mirrors RepairOrder/PartOrder/RentalBooking.claimToken — passed in
   * from the originating fulfillment so the post-checkout guest auth
   * panel can resolve the deal.
   */
  claimToken?: string | null;
  notes?: string | null;
}

export interface CreateDealLineInput {
  type: DealLineType;
  description: string;
  qty: number;
  unitPrice: number;
  partId?: string | null;
  /** Optional explicit sortOrder; defaults to append. */
  sortOrder?: number;
}

export interface DealSummary {
  id: string;
  number: string | null;
  customerUserId: string;
  vehicleId: string | null;
  ownerUserId: string | null;
  stage: DealStage;
  channel: DealChannel;
  total: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerSummary {
  id: string;
  name: string;
  phone: string;
  email: string;
}
