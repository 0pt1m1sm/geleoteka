export interface SupplierOption {
  id: string;
  name: string;
}

export interface PartOption {
  id: string;
  name: string;
  article: string;
  price: number;
  weightGrams: number | null;
}

export interface ItemRow {
  // UI-only stable identity for React keys (not sent to the server) — keeps a
  // row's picker/input state attached to that row when another row above it
  // is removed, instead of shifting onto whatever row now sits at its index.
  id: string;
  // NEW_PART is a UI-only marker: on submit the action creates a draft Part and
  // stores the line as a normal PART with the new partId. The DB enum never sees it.
  type: "PART" | "NEW_PART" | "CUSTOM" | "FEE" | "SERVICE";
  partId: string | null;
  description: string;
  /** Article for a NEW_PART row (the new product's catalog article). */
  article?: string;
  quantity: number;
  unitCost: number;
}

export const TYPE_LABELS: Record<string, string> = {
  PART: "Запчасть",
  NEW_PART: "Новый товар",
  CUSTOM: "Другое",
  FEE: "Комиссия",
  SERVICE: "Услуга",
};
