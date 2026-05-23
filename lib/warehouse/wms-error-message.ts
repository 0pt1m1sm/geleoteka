import { WmsError } from "@/lib/wms/public";

/** Map a WmsError to a Russian message; returns null for non-WmsErrors. */
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
    default:
      return "Не удалось выполнить операцию";
  }
}
