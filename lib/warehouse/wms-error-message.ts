import { WmsError } from "@/lib/wms/public";

/**
 * Map a user-actionable WmsError to a Russian message. Returns null for
 * non-WmsErrors AND for WmsError codes that indicate a programming error
 * (e.g. NULL_SOURCE) — callers re-throw on null so those surface for
 * observability instead of being masked as a generic "failed" message.
 */
export function wmsErrorMessage(e: unknown): string | null {
  if (!(e instanceof WmsError)) return null;
  switch (e.code) {
    case "INSUFFICIENT_UNPLACED":
      return "Недостаточно нераспределённого остатка";
    case "INSUFFICIENT_BIN":
      return "В ячейке недостаточно остатка";
    case "SAME_LOCATION":
      return "Ячейки отправления и назначения совпадают";
    case "INVALID_QTY":
      return "Количество должно быть положительным";
    case "LOCATION_BLOCKED":
      return "Ячейка заблокирована или неактивна";
    case "DUPLICATE_OPERATION":
      return "Операция уже была выполнена (повторный запрос)";
    case "IDEMPOTENCY_KEY_REUSED":
      return "Ключ операции уже использован для другого действия";
    case "COUNT_DRIFT":
      return "Остаток в ячейках изменился с момента создания пересчёта — обновите подсчёт";
    case "RECONCILE_BLOCKED":
      return "Остаток позиции рассогласован — устраните расхождение перед проводкой";
    default:
      // Unmapped code (e.g. NULL_SOURCE) = programming error → re-throw upstream.
      return null;
  }
}
