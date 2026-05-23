"use client";

import { Card, CardTitle, Input } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import type { CustomsMode } from "@/lib/suppliers/landed-cost";

export interface LandedCostState {
  shippingRateUsdCents: number;
  usdRateKopecks: number;
  customsMode: CustomsMode;
  customsPercentBps: number;
  cargoRateUsdCents: number;
  manualWeightOverrideGrams: number | null;
}

export interface LandedCostPreview {
  itemsCost: number;
  autoWeightGrams: number;
  effectiveWeightGrams: number;
  shippingCost: number;
  customsCost: number;
  totalCost: number;
}

interface OrderTotalsProps {
  state: LandedCostState;
  onChange: (patch: Partial<LandedCostState>) => void;
  preview: LandedCostPreview;
}

/** Parse a human number field into a scaled int (×scale), 0 when blank/invalid. */
function scaled(value: string, scale: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * scale) : 0;
}

export function OrderTotals({ state, onChange, preview }: OrderTotalsProps): React.ReactElement {
  return (
    <Card className="space-y-4">
      <CardTitle>Финансы</CardTitle>

      {/* Shipping: weight × $/kg × USD rate */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          label="Курс $ (₽)"
          type="number"
          min={0}
          step="0.01"
          value={state.usdRateKopecks ? state.usdRateKopecks / 100 : ""}
          onChange={(e) => onChange({ usdRateKopecks: scaled(e.target.value, 100) })}
        />
        <Input
          label="Доставка ($/кг)"
          type="number"
          min={0}
          step="0.01"
          value={state.shippingRateUsdCents ? state.shippingRateUsdCents / 100 : ""}
          onChange={(e) => onChange({ shippingRateUsdCents: scaled(e.target.value, 100) })}
        />
        <Input
          label="Вес, кг (авто — переопределить)"
          type="number"
          min={0}
          step="0.001"
          placeholder={(preview.autoWeightGrams / 1000).toString()}
          value={state.manualWeightOverrideGrams != null ? state.manualWeightOverrideGrams / 1000 : ""}
          onChange={(e) =>
            onChange({
              manualWeightOverrideGrams: e.target.value.trim() === "" ? null : scaled(e.target.value, 1000),
            })
          }
        />
      </div>

      {/* Customs: % of CIF | cargo $/kg */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
          <label htmlFor="customsMode" className="block text-sm font-medium mb-2">Таможня</label>
          <select
            id="customsMode"
            className="input"
            value={state.customsMode}
            onChange={(e) => onChange({ customsMode: e.target.value as CustomsMode })}
          >
            <option value="PERCENT_CIF">% от CIF</option>
            <option value="CARGO_PER_KG">Карго ($/кг)</option>
          </select>
        </div>
        {state.customsMode === "PERCENT_CIF" ? (
          <Input
            label="Ставка, %"
            type="number"
            min={0}
            step="0.1"
            value={state.customsPercentBps ? state.customsPercentBps / 100 : ""}
            onChange={(e) => onChange({ customsPercentBps: scaled(e.target.value, 100) })}
          />
        ) : (
          <Input
            label="Карго ($/кг)"
            type="number"
            min={0}
            step="0.01"
            value={state.cargoRateUsdCents ? state.cargoRateUsdCents / 100 : ""}
            onChange={(e) => onChange({ cargoRateUsdCents: scaled(e.target.value, 100) })}
          />
        )}
      </div>

      <div className="bg-[var(--background-secondary)] rounded-lg p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--foreground-muted)]">Стоимость позиций:</span>
          <span className="font-medium">{formatPrice(preview.itemsCost)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--foreground-muted)]">
            + Доставка <span className="text-xs">({(preview.effectiveWeightGrams / 1000).toLocaleString("ru-RU")} кг)</span>:
          </span>
          <span className="font-medium">{formatPrice(preview.shippingCost)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--foreground-muted)]">
            + Таможня <span className="text-xs">({state.customsMode === "PERCENT_CIF" ? `${state.customsPercentBps / 100}% CIF` : "карго"})</span>:
          </span>
          <span className="font-medium">{formatPrice(preview.customsCost)}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-[var(--border)]">
          <span className="font-semibold">Итого:</span>
          <span className="font-bold text-[var(--color-accent)] text-base">{formatPrice(preview.totalCost)}</span>
        </div>
      </div>
    </Card>
  );
}
