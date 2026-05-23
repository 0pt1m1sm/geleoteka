"use client";

import Link from "next/link";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import { useEffect, useRef, useState } from "react";
import {
  serializeCustomerListFilter,
  type BlacklistFilter,
  type CustomerListFilter,
  type CustomerSort,
} from "@/lib/customer-filters";

interface TagOption {
  id: string;
  name: string;
}

interface Props {
  initial: CustomerListFilter;
  availableTags: TagOption[];
}

const DEBOUNCE_MS = 250;

export function CustomerListFilters({ initial, availableTags }: Props): React.ReactElement {
  const nav = useProgressRouter();
  const [q, setQ] = useState(initial.q);
  const [tagId, setTagId] = useState<string | null>(initial.tagId);
  const [blacklist, setBlacklist] = useState<BlacklistFilter>(initial.blacklist);
  const [sort, setSort] = useState<CustomerSort>(initial.sort);

  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function navigate(next: CustomerListFilter): void {
    const qs = serializeCustomerListFilter(next).toString();
    const url = qs ? `/admin/customers?${qs}` : "/admin/customers";
    nav.replace(url);
  }

  function commitDebounced(next: CustomerListFilter): void {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => navigate(next), DEBOUNCE_MS);
  }

  function handleQChange(value: string): void {
    setQ(value);
    commitDebounced({ q: value, tagId, blacklist, sort });
  }

  function handleTagChange(value: string): void {
    const next = value === "" ? null : value;
    setTagId(next);
    navigate({ q, tagId: next, blacklist, sort });
  }

  function handleBlacklistChange(value: string): void {
    const next = (value as BlacklistFilter) ?? "all";
    setBlacklist(next);
    navigate({ q, tagId, blacklist: next, sort });
  }

  function handleSortChange(value: string): void {
    const next = value as CustomerSort;
    setSort(next);
    navigate({ q, tagId, blacklist, sort: next });
  }

  const isFiltered =
    q !== "" || tagId !== null || blacklist !== "all" || sort !== "lastVisit";

  return (
    <div className="card flex flex-col gap-3 mb-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex-1 min-w-[200px]">
        <label htmlFor="customer-search" className="block text-xs uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
          Поиск
        </label>
        <input
          id="customer-search"
          type="search"
          value={q}
          onChange={(e) => handleQChange(e.target.value)}
          placeholder="Имя, телефон, email"
          className="input"
        />
      </div>

      <div className="min-w-[160px]">
        <label htmlFor="customer-tag" className="block text-xs uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
          Тэг
        </label>
        <select
          id="customer-tag"
          value={tagId ?? ""}
          onChange={(e) => handleTagChange(e.target.value)}
          className="input"
        >
          <option value="">Все тэги</option>
          {availableTags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-[160px]">
        <label htmlFor="customer-blacklist" className="block text-xs uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
          Чёрный список
        </label>
        <select
          id="customer-blacklist"
          value={blacklist}
          onChange={(e) => handleBlacklistChange(e.target.value)}
          className="input"
        >
          <option value="all">Все клиенты</option>
          <option value="hide">Скрыть ЧС</option>
          <option value="only">Только ЧС</option>
        </select>
      </div>

      <div className="min-w-[180px]">
        <label htmlFor="customer-sort" className="block text-xs uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
          Сортировка
        </label>
        <select
          id="customer-sort"
          value={sort}
          onChange={(e) => handleSortChange(e.target.value)}
          className="input"
        >
          <option value="lastVisit">Последний визит</option>
          <option value="points">Баллы</option>
          <option value="createdAt">Дата создания</option>
        </select>
      </div>

      {isFiltered ? (
        <Link
          href="/admin/customers"
          className="btn btn-secondary text-sm self-end"
        >
          Сбросить
        </Link>
      ) : null}
    </div>
  );
}
