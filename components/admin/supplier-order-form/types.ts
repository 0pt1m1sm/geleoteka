export interface SupplierOption {
  id: string;
  name: string;
}

export interface PartOption {
  id: string;
  name: string;
  article: string;
  price: number;
}

export interface ItemRow {
  type: "PART" | "CUSTOM" | "FEE" | "SERVICE";
  partId: string | null;
  description: string;
  quantity: number;
  unitCost: number;
}

export const TYPE_LABELS: Record<string, string> = {
  PART: "Запчасть",
  CUSTOM: "Другое",
  FEE: "Комиссия",
  SERVICE: "Услуга",
};
