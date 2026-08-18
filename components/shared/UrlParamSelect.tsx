"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";

export interface UrlParamOption {
  value: string;
  label: string;
}

/**
 * Селект-фильтр, живущий в query-параметре страницы: смена значения обновляет
 * URL (пустое значение убирает параметр), состояние остаётся пересылаемой
 * ссылкой. Замена «облакам» чипсов-ссылок, которые не масштабируются по числу
 * вариантов (фидбек владельца: справочник, журнал действий).
 */
export function UrlParamSelect({
  param,
  value,
  options,
  ariaLabel,
  resetParams = [],
}: {
  param: string;
  value: string;
  options: UrlParamOption[];
  ariaLabel: string;
  /** Зависимые параметры, сбрасываемые при смене этого (например, страница). */
  resetParams?: string[];
}): React.ReactElement {
  const nav = useProgressRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  return (
    <select
      value={value}
      onChange={(e) => {
        const sp = new URLSearchParams(search.toString());
        if (e.target.value) {
          sp.set(param, e.target.value);
        } else {
          sp.delete(param);
        }
        for (const p of resetParams) sp.delete(p);
        const qs = sp.toString();
        nav.push(qs ? `${pathname}?${qs}` : pathname);
      }}
      aria-label={ariaLabel}
      className="input w-auto max-w-full"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
