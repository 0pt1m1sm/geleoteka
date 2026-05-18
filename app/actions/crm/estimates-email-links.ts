/**
 * Build the customer-facing view + PDF URLs we send in the estimate email.
 *
 * Strategy (post-2026-05-19 fix):
 *   - If the deal has a `claimToken` → token-scoped guest URLs (preferred —
 *     no auth required to open).
 *   - Else → cabinet URLs. The customer logs in (or resets a temp password)
 *     to view. We do NOT gate on `isTempPassword` — refusing to email a
 *     customer their own estimate because they have a temp password caused
 *     the silent-skip bug this helper exists to prevent.
 *
 * Pure function — no DB, no I/O. The action layer (`sendEstimate`) feeds
 * it primitives and consumes the URLs.
 */
export interface BuildEstimateEmailLinksInput {
  appUrl: string;
  estimateId: string;
  dealClaimToken: string | null;
}

export interface EstimateEmailLinks {
  viewUrl: string;
  pdfUrl: string;
}

export function buildEstimateEmailLinks(
  input: BuildEstimateEmailLinksInput,
): EstimateEmailLinks {
  const { appUrl, estimateId, dealClaimToken } = input;
  if (dealClaimToken) {
    return {
      viewUrl: `${appUrl}/estimate/${dealClaimToken}?id=${estimateId}`,
      pdfUrl: `${appUrl}/api/estimates/${estimateId}/pdf?token=${dealClaimToken}`,
    };
  }
  return {
    viewUrl: `${appUrl}/cabinet/estimates/${estimateId}`,
    pdfUrl: `${appUrl}/api/estimates/${estimateId}/pdf`,
  };
}
