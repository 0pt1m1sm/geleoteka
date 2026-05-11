"use client";

import { useEffect } from "react";
import { Markdown } from "@/components/shared/Markdown";
import { DEAL_LINE_TYPE_LABELS } from "@/lib/deal-stage-labels";
import { formatDate, formatPrice } from "@/lib/utils";

interface EstimateLine {
  id: string;
  type: string;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface PrintEstimate {
  id: string;
  number: string | null;
  stage: string;
  validUntil: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  subtotalLabor: number;
  subtotalParts: number;
  subtotalRental: number;
  discount: number;
  tax: number;
  total: number;
  estimateLines: EstimateLine[];
  vehicle: { make: string; model: string; year: number; vin: string | null } | null;
  customer: { name: string; phone: string; email: string };
}

interface Requisites {
  legalName: string;
  shortName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legalAddress: string;
  bankName: string;
  bankBik: string;
  account: string;
  corrAccount: string;
  directorName: string;
  estimateFooter: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
}

interface Props {
  estimate: PrintEstimate;
  requisites: Requisites;
  /** When true, calls window.print() on mount. */
  autoPrint?: boolean;
}

/**
 * Print-ready estimate document. Designed for A4 with the org header,
 * customer block, line table, totals, requisite block, and signature
 * area. Tailwind print: utilities hide chrome; the page is plain
 * black on white so it prints legibly even in monochrome.
 */
export function EstimatePrintView({
  estimate,
  requisites,
  autoPrint,
}: Props): React.ReactElement {
  useEffect(() => {
    if (autoPrint) {
      // Wait a tick so layout settles before opening the dialog.
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

  const issueDate = estimate.sentAt ?? estimate.createdAt;
  const hasAnyRequisite =
    requisites.inn ||
    requisites.kpp ||
    requisites.ogrn ||
    requisites.account ||
    requisites.bankName;

  return (
    <div className="estimate-print bg-white text-black mx-auto max-w-[800px] p-8 print:p-0 print:max-w-none">
      <div className="flex justify-end mb-4 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="btn btn-primary text-sm"
        >
          Распечатать
        </button>
      </div>

      <header className="border-b border-black/30 pb-4 mb-6">
        <div className="flex justify-between items-baseline gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">{requisites.shortName || "Geleoteka"}</h1>
            {requisites.legalName ? (
              <p className="text-xs text-black/60 mt-1">{requisites.legalName}</p>
            ) : null}
          </div>
          <div className="text-right text-xs text-black/70 leading-snug">
            {requisites.contactAddress ? <div>{requisites.contactAddress}</div> : null}
            {requisites.contactPhone ? <div>тел. {requisites.contactPhone}</div> : null}
            {requisites.contactEmail ? <div>{requisites.contactEmail}</div> : null}
          </div>
        </div>
      </header>

      <section className="mb-6">
        <h2 className="text-xl font-bold">
          Смета №{estimate.number ?? estimate.id.slice(-6).toUpperCase()}
        </h2>
        <div className="mt-1 text-xs text-black/70">
          от {formatDate(issueDate)}
          {estimate.validUntil ? (
            <> · действительна до {formatDate(estimate.validUntil)}</>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-black/50 mb-1">
            Заказчик
          </div>
          <div className="font-medium">{estimate.customer.name}</div>
          <div className="text-xs text-black/70 mt-0.5">
            {estimate.customer.phone}
            {estimate.customer.email ? <> · {estimate.customer.email}</> : null}
          </div>
        </div>
        {estimate.vehicle ? (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-black/50 mb-1">
              Транспортное средство
            </div>
            <div className="font-medium">
              {estimate.vehicle.make} {estimate.vehicle.model} {estimate.vehicle.year}
            </div>
            {estimate.vehicle.vin ? (
              <div className="text-xs text-black/70 mt-0.5 font-mono">
                VIN: {estimate.vehicle.vin}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <table className="w-full text-sm border border-black/40 mb-4">
        <thead>
          <tr className="border-b border-black/40 bg-black/[0.04] text-[11px] uppercase tracking-wider">
            <th className="text-left px-3 py-2 font-medium w-10">№</th>
            <th className="text-left px-3 py-2 font-medium w-32">Тип</th>
            <th className="text-left px-3 py-2 font-medium">Описание</th>
            <th className="text-right px-3 py-2 font-medium w-16">Кол-во</th>
            <th className="text-right px-3 py-2 font-medium w-24">Цена</th>
            <th className="text-right px-3 py-2 font-medium w-28">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {estimate.estimateLines.map((line, i) => (
            <tr key={line.id} className="border-b border-black/15 last:border-b-0">
              <td className="px-3 py-2 align-top tabular-nums">{i + 1}</td>
              <td className="px-3 py-2 align-top text-xs text-black/70">
                {DEAL_LINE_TYPE_LABELS[line.type] ?? line.type}
              </td>
              <td className="px-3 py-2 align-top">{line.description}</td>
              <td className="px-3 py-2 align-top text-right tabular-nums">{line.qty}</td>
              <td className="px-3 py-2 align-top text-right tabular-nums">
                {formatPrice(line.unitPrice)}
              </td>
              <td className="px-3 py-2 align-top text-right tabular-nums font-medium">
                {formatPrice(line.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="ml-auto w-full sm:w-72 text-sm mb-8">
        {estimate.subtotalLabor ? (
          <div className="flex justify-between py-1">
            <span className="text-black/70">Работы</span>
            <span className="tabular-nums">{formatPrice(estimate.subtotalLabor)}</span>
          </div>
        ) : null}
        {estimate.subtotalParts ? (
          <div className="flex justify-between py-1">
            <span className="text-black/70">Запчасти</span>
            <span className="tabular-nums">{formatPrice(estimate.subtotalParts)}</span>
          </div>
        ) : null}
        {estimate.subtotalRental ? (
          <div className="flex justify-between py-1">
            <span className="text-black/70">Аренда</span>
            <span className="tabular-nums">{formatPrice(estimate.subtotalRental)}</span>
          </div>
        ) : null}
        {estimate.discount ? (
          <div className="flex justify-between py-1">
            <span className="text-black/70">Скидки</span>
            <span className="tabular-nums">{formatPrice(estimate.discount)}</span>
          </div>
        ) : null}
        {estimate.tax ? (
          <div className="flex justify-between py-1">
            <span className="text-black/70">Налог</span>
            <span className="tabular-nums">{formatPrice(estimate.tax)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-black/40 pt-2 mt-2 font-bold text-base">
          <span>Итого к оплате</span>
          <span className="tabular-nums">{formatPrice(estimate.total)}</span>
        </div>
      </section>

      {hasAnyRequisite ? (
        <section className="border-t border-black/30 pt-4 mb-4 text-xs leading-snug">
          <div className="text-[10px] uppercase tracking-wider text-black/50 mb-2">
            Реквизиты для оплаты
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-6">
            {requisites.legalName ? (
              <div>
                <span className="text-black/60">Получатель:</span> {requisites.legalName}
              </div>
            ) : null}
            {requisites.inn ? (
              <div>
                <span className="text-black/60">ИНН:</span> {requisites.inn}
              </div>
            ) : null}
            {requisites.kpp ? (
              <div>
                <span className="text-black/60">КПП:</span> {requisites.kpp}
              </div>
            ) : null}
            {requisites.ogrn ? (
              <div>
                <span className="text-black/60">ОГРН:</span> {requisites.ogrn}
              </div>
            ) : null}
            {requisites.legalAddress ? (
              <div className="sm:col-span-2">
                <span className="text-black/60">Юр. адрес:</span> {requisites.legalAddress}
              </div>
            ) : null}
            {requisites.bankName ? (
              <div className="sm:col-span-2">
                <span className="text-black/60">Банк:</span> {requisites.bankName}
              </div>
            ) : null}
            {requisites.bankBik ? (
              <div>
                <span className="text-black/60">БИК:</span> {requisites.bankBik}
              </div>
            ) : null}
            {requisites.account ? (
              <div>
                <span className="text-black/60">Р/счёт:</span> {requisites.account}
              </div>
            ) : null}
            {requisites.corrAccount ? (
              <div className="sm:col-span-2">
                <span className="text-black/60">К/счёт:</span> {requisites.corrAccount}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {requisites.estimateFooter ? (
        <section className="text-xs text-black/70 mb-8">
          <Markdown source={requisites.estimateFooter} />
        </section>
      ) : null}

      <footer className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-4 border-t border-black/30 text-xs">
        <div>
          <div className="text-black/60 mb-6">
            Исполнитель{requisites.directorName ? ` — ${requisites.directorName}` : ""}
          </div>
          <div className="border-t border-black/40 pt-1">Подпись · М.П.</div>
        </div>
        <div>
          <div className="text-black/60 mb-6">
            Заказчик — {estimate.customer.name}
          </div>
          <div className="border-t border-black/40 pt-1">Подпись</div>
        </div>
      </footer>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }
          html,
          body {
            background: #fff !important;
            color: #000 !important;
          }
        }
      `}</style>
    </div>
  );
}
