/** Error taxonomy for the WMS core. */
export class WmsError extends Error {
  constructor(
    public readonly code: "NULL_SOURCE" | "INVALID_QTY",
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
}
