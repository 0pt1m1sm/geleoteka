/**
 * Public surface of the CRM module.
 *
 * Other modules import from `@/lib/crm/public` only. Reaching into
 * `@/lib/crm/internal` from outside the CRM module is forbidden by
 * ESLint module-boundary rules (see
 * docs/prd/2026-04-13-module-boundaries-refactor.md).
 */
export { createDeal } from "./create-deal";
export { bumpLastTouch } from "./bump-last-touch";

// Curated re-exports of internal helpers that host code legitimately needs.
// Implementations stay in lib/crm/internal; exposing them here preserves the
// module boundary (consumers import from public only).
export {
  nextDealNumber,
  nextEstimateNumber,
  nextRepairOrderNumber,
  nextPartOrderNumber,
  nextRentalBookingNumber,
} from "../internal/next-number";
export { recomputeEstimateTotals } from "../internal/recompute-estimate-totals";
export { recomputeDealTotals } from "../internal/recompute-deal-totals";
export { computeEstimateMoney } from "../internal/compute-estimate-money";
export type { EstimateMoney } from "../internal/compute-estimate-money";
export { signedLineTotal } from "../internal/signed-line-total";
export { dispatchFulfillment } from "../internal/dispatch-fulfillment";
export type {
  DispatchFulfillmentInput,
  DispatchFulfillmentResult,
} from "../internal/dispatch-fulfillment";

export type {
  CreateDealInput,
  CreateDealLineInput,
  DealSummary,
  CustomerSummary,
  DealChannel,
  DealStage,
  DealLineType,
} from "./types";
