import type { FuelType } from "@/lib/vehicle-catalog-types";

export interface TrimRow {
  id: string;
  code: string;
  bodyStyle: string | null;
  drivetrain: string | null;
  fuelType: FuelType | null;
  engineCode: string | null;
  displacementL: string | null;
  horsepower: number | null;
  notes: string | null;
  isActive: boolean;
}

export interface DraftRow {
  code: string;
  bodyStyle: string;
  drivetrain: string;
  fuelType: "" | FuelType;
  engineCode: string;
  displacementL: string;
  horsepower: string;
  notes: string;
}

export const EMPTY_DRAFT: DraftRow = {
  code: "",
  bodyStyle: "",
  drivetrain: "",
  fuelType: "",
  engineCode: "",
  displacementL: "",
  horsepower: "",
  notes: "",
};

export const FUEL_OPTIONS: Array<{ value: "" | FuelType; label: string }> = [
  { value: "", label: "—" },
  { value: "PETROL", label: "Бензин" },
  { value: "DIESEL", label: "Дизель" },
  { value: "ELECTRIC", label: "Электро" },
  { value: "HYBRID", label: "Гибрид" },
];
