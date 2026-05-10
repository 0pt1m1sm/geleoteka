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
export type {
  CreateDealInput,
  CreateDealLineInput,
  DealSummary,
  CustomerSummary,
  DealChannel,
  DealStage,
  DealLineType,
} from "./types";
