export type WmsErrorCode =
  | "NULL_SOURCE"
  | "INVALID_QTY"
  | "INSUFFICIENT_UNPLACED"
  | "INSUFFICIENT_BIN"
  | "SAME_LOCATION"
  | "LOCATION_BLOCKED"
  | "DUPLICATE_OPERATION"
  | "IDEMPOTENCY_KEY_REUSED"
  | "COUNT_DRIFT"
  | "RECONCILE_BLOCKED";

/** Structured payload carried by guard errors so the action layer can tell the
 *  UI which cells drifted / which part blocked, without parsing the message. */
export interface WmsErrorDetails {
  /** COUNT_DRIFT: the cells whose live qty no longer matches the snapshot. */
  drift?: Array<{ location: string; itemId: string | null }>;
  /** RECONCILE_BLOCKED: the part that cannot be posted on top of. */
  partId?: string;
  /** LOCATION_BLOCKED (stocktake post): the cell that is blocked/inactive. */
  location?: string;
}

/** Error taxonomy for the WMS core. */
export class WmsError extends Error {
  constructor(
    public readonly code: WmsErrorCode,
    message: string,
    public readonly details?: WmsErrorDetails,
  ) {
    super(message);
    this.name = "WmsError";
  }

  static nullSource(reason: string): WmsError {
    return new WmsError(
      "NULL_SOURCE",
      `source.id is required for reason ${reason} — only ADJUSTMENT may carry a null source.`,
    );
  }

  static invalidQty(reason: string): WmsError {
    return new WmsError(
      "INVALID_QTY",
      reason === "ADJUSTMENT"
        ? "ADJUSTMENT qty must be a non-zero signed delta."
        : `qty must be > 0 for ${reason}.`,
    );
  }

  /** Placement: tried to place more than the item's unplaced on-hand. */
  static insufficientUnplaced(): WmsError {
    return new WmsError("INSUFFICIENT_UNPLACED", "Not enough unplaced on-hand to put away.");
  }

  /** Placement: a bin holds less than the requested transfer/remove qty. */
  static insufficientBin(): WmsError {
    return new WmsError("INSUFFICIENT_BIN", "The bin does not hold enough to move that quantity.");
  }

  /** Placement: transfer source and destination are the same location. */
  static sameLocation(): WmsError {
    return new WmsError("SAME_LOCATION", "Transfer source and destination must differ.");
  }

  /** Placement: destination location is inactive or blocked for putaway/transfer-in. */
  static locationBlocked(): WmsError {
    return new WmsError("LOCATION_BLOCKED", "The destination location is blocked or inactive.");
  }

  /** A write with this idempotency key already ran (same payload) — no-op duplicate. */
  static duplicateOperation(): WmsError {
    return new WmsError("DUPLICATE_OPERATION", "This operation was already applied (duplicate idempotency key).");
  }

  /** The idempotency key was reused for a DIFFERENT operation — reject, do not mask. */
  static idempotencyKeyReused(): WmsError {
    return new WmsError(
      "IDEMPOTENCY_KEY_REUSED",
      "This idempotency key was already used for a different operation.",
    );
  }

  /** Stocktake: an in-scope cell's live stock changed since the count sheet was
   *  generated (changed, removed, or newly created) — block the post, re-count. */
  static countDrift(drift: Array<{ location: string; itemId: string | null }>): WmsError {
    return new WmsError(
      "COUNT_DRIFT",
      "Stock in one or more counted cells changed since the count was generated.",
      { drift },
    );
  }

  /** Stocktake: refuses to post on top of a part whose placed already exceeds
   *  on-hand, or whose variance would drive on-hand below reserved/0. */
  static reconcileBlocked(partId: string): WmsError {
    return new WmsError(
      "RECONCILE_BLOCKED",
      "This part's stock is inconsistent (placed exceeds on-hand, or the count would drive it negative) — reconcile before posting.",
      { partId },
    );
  }
}
