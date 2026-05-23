export type WmsErrorCode =
  | "NULL_SOURCE"
  | "INVALID_QTY"
  | "INSUFFICIENT_UNPLACED"
  | "INSUFFICIENT_BIN"
  | "SAME_LOCATION"
  | "LOCATION_BLOCKED"
  | "DUPLICATE_OPERATION"
  | "IDEMPOTENCY_KEY_REUSED";

/** Error taxonomy for the WMS core. */
export class WmsError extends Error {
  constructor(
    public readonly code: WmsErrorCode,
    message: string,
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
}
