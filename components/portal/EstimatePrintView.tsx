"use client";

import { useEffect } from "react";
import Image from "next/image";
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

const GOLD = "#b8860b";

/**
 * Print-ready estimate document. Branded letterhead with logo + gold
 * accent rail, two-column corporate header, line table with subtle
 * zebra rows, prominent total panel, requisites footer, and signature
 * area for both parties. Designed for A4 — looks the same on paper
 * and on screen, monochrome-safe.
 */
export function EstimatePrintView({
  estimate,
  requisites,
  autoPrint,
}: Props): React.ReactElement {
  useEffect(() => {
    if (autoPrint) {
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
    <div className="estimate-print bg-white text-black mx-auto max-w-[820px] print:max-w-none">
      <div className="flex justify-end gap-2 px-8 pt-6 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="btn btn-primary text-sm"
        >
          Распечатать
        </button>
      </div>

      <article className="px-8 sm:px-12 py-10 print:px-0 print:py-0">
        {/* ---- Header ---- */}
        <header className="relative">
          <div
            aria-hidden
            className="absolute -top-2 left-0 right-0 h-[3px]"
            style={{ backgroundColor: GOLD }}
          />
          <div className="pt-6 pb-6 grid grid-cols-[auto_1fr_auto] gap-6 items-start border-b border-black/15">
            <div className="flex items-center gap-3">
              <Image
                src="/images/logo.svg"
                alt=""
                width={56}
                height={56}
                priority
              />
            </div>
            <div>
              <div
                className="text-3xl font-black tracking-[0.14em] uppercase"
                style={{ color: GOLD, fontFamily: "var(--font-display)" }}
              >
                {requisites.shortName || "Geleoteka"}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-black/60">
                Специализированный сервис Mercedes-Benz G-Class
              </div>
              {requisites.legalName ? (
                <div className="mt-2 text-xs text-black/70">{requisites.legalName}</div>
              ) : null}
            </div>
            <div className="text-right text-[11px] text-black/70 leading-relaxed">
              {requisites.contactAddress ? (
                <div className="max-w-[200px] ml-auto">{requisites.contactAddress}</div>
              ) : null}
              {requisites.contactPhone ? (
                <div className="mt-1 font-mono">тел. {requisites.contactPhone}</div>
              ) : null}
              {requisites.contactEmail ? (
                <div className="font-mono">{requisites.contactEmail}</div>
              ) : null}
            </div>
          </div>
        </header>

        {/* ---- Document title ---- */}
        <section className="mt-8 mb-8 flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-black/50">
              Коммерческое предложение
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Смета №{estimate.number ?? estimate.id.slice(-6).toUpperCase()}
            </h1>
          </div>
          <div className="text-xs text-black/70 text-right leading-relaxed">
            <div>
              <span className="text-black/50">Дата выпуска: </span>
              <span className="font-medium">{formatDate(issueDate)}</span>
            </div>
            {estimate.validUntil ? (
              <div>
                <span className="text-black/50">Действительна до: </span>
                <span className="font-medium">{formatDate(estimate.validUntil)}</span>
              </div>
            ) : null}
          </div>
        </section>

        {/* ---- Parties ---- */}
        <section className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PartyCard
            title="Заказчик"
            name={estimate.customer.name}
            details={[
              estimate.customer.phone,
              estimate.customer.email,
            ].filter(Boolean)}
          />
          {estimate.vehicle ? (
            <PartyCard
              title="Транспортное средство"
              name={`${estimate.vehicle.make} ${estimate.vehicle.model} ${estimate.vehicle.year}`}
              details={estimate.vehicle.vin ? [`VIN ${estimate.vehicle.vin}`] : []}
              mono
            />
          ) : (
            <div />
          )}
        </section>

        {/* ---- Lines ---- */}
        <section className="mb-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr
                className="text-[10px] uppercase tracking-[0.15em] text-white"
                style={{ backgroundColor: "#111" }}
              >
                <th className="text-left px-3 py-2.5 font-medium w-8">№</th>
                <th className="text-left px-3 py-2.5 font-medium w-32">Тип</th>
                <th className="text-left px-3 py-2.5 font-medium">Описание</th>
                <th className="text-right px-3 py-2.5 font-medium w-16">Кол-во</th>
                <th className="text-right px-3 py-2.5 font-medium w-24">Цена</th>
                <th className="text-right px-3 py-2.5 font-medium w-28">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {estimate.estimateLines.map((line, i) => (
                <tr
                  key={line.id}
                  className={i % 2 === 0 ? "bg-white" : "bg-black/[0.025]"}
                >
                  <td className="px-3 py-2.5 align-top tabular-nums text-black/60">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2.5 align-top text-[11px] uppercase tracking-wider text-black/60">
                    {DEAL_LINE_TYPE_LABELS[line.type] ?? line.type}
                  </td>
                  <td className="px-3 py-2.5 align-top">{line.description}</td>
                  <td className="px-3 py-2.5 align-top text-right tabular-nums">
                    {line.qty}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right tabular-nums">
                    {formatPrice(line.unitPrice)}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right tabular-nums font-medium">
                    {formatPrice(line.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ---- Subtotals + total panel ---- */}
        <section className="ml-auto w-full sm:w-80 mb-10">
          <div className="space-y-1 text-sm">
            {estimate.subtotalLabor ? (
              <Row label="Работы" value={estimate.subtotalLabor} />
            ) : null}
            {estimate.subtotalParts ? (
              <Row label="Запчасти" value={estimate.subtotalParts} />
            ) : null}
            {estimate.subtotalRental ? (
              <Row label="Аренда" value={estimate.subtotalRental} />
            ) : null}
            {estimate.discount ? (
              <Row label="Скидки" value={estimate.discount} />
            ) : null}
            {estimate.tax ? <Row label="Налог" value={estimate.tax} /> : null}
          </div>
          <div
            className="mt-3 flex items-baseline justify-between px-4 py-3 rounded-sm"
            style={{ backgroundColor: "#111", color: "#fff" }}
          >
            <span className="text-[11px] uppercase tracking-[0.2em]" style={{ color: GOLD }}>
              Итого к оплате
            </span>
            <span className="text-2xl font-bold tabular-nums">
              {formatPrice(estimate.total)}
            </span>
          </div>
        </section>

        {/* ---- Requisites for payment ---- */}
        {hasAnyRequisite ? (
          <section className="mb-8 border-t border-black/15 pt-6">
            <h3 className="text-[10px] uppercase tracking-[0.25em] text-black/50 mb-3">
              Реквизиты для оплаты
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-8 text-xs leading-snug">
              {requisites.legalName ? (
                <Req label="Получатель" value={requisites.legalName} wide />
              ) : null}
              {requisites.inn ? <Req label="ИНН" value={requisites.inn} /> : null}
              {requisites.kpp ? <Req label="КПП" value={requisites.kpp} /> : null}
              {requisites.ogrn ? <Req label="ОГРН" value={requisites.ogrn} /> : null}
              {requisites.legalAddress ? (
                <Req label="Юр. адрес" value={requisites.legalAddress} wide />
              ) : null}
              {requisites.bankName ? (
                <Req label="Банк" value={requisites.bankName} wide />
              ) : null}
              {requisites.bankBik ? <Req label="БИК" value={requisites.bankBik} /> : null}
              {requisites.account ? (
                <Req label="Р/счёт" value={requisites.account} mono />
              ) : null}
              {requisites.corrAccount ? (
                <Req label="К/счёт" value={requisites.corrAccount} wide mono />
              ) : null}
            </dl>
          </section>
        ) : null}

        {/* ---- Footer note ---- */}
        {requisites.estimateFooter ? (
          <section className="mb-10 text-xs text-black/70 leading-relaxed border-l-2 pl-4" style={{ borderColor: GOLD }}>
            <Markdown source={requisites.estimateFooter} />
          </section>
        ) : null}

        {/* ---- Signatures ---- */}
        <footer className="grid grid-cols-1 sm:grid-cols-2 gap-12 pt-6 border-t border-black/15 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-black/50 mb-1">
              Исполнитель
            </div>
            <div className="text-black/80">
              {requisites.directorName || requisites.legalName || requisites.shortName}
            </div>
            <div className="mt-10 border-t border-black/40 pt-1.5 text-black/60">
              Подпись · М.П.
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-black/50 mb-1">
              Заказчик
            </div>
            <div className="text-black/80">{estimate.customer.name}</div>
            <div className="mt-10 border-t border-black/40 pt-1.5 text-black/60">
              Подпись
            </div>
          </div>
        </footer>
      </article>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm;
          }
          html,
          body {
            background: #fff !important;
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .estimate-print thead {
            display: table-header-group;
          }
          .estimate-print tr {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

function PartyCard({
  title,
  name,
  details,
  mono,
}: {
  title: string;
  name: string;
  details: string[];
  mono?: boolean;
}): React.ReactElement {
  return (
    <div className="border border-black/15 rounded-sm px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-black/50 mb-1">
        {title}
      </div>
      <div className="font-medium text-sm">{name}</div>
      {details.length > 0 ? (
        <div
          className={
            "mt-0.5 text-xs text-black/70 " + (mono ? "font-mono" : "")
          }
        >
          {details.map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="flex justify-between text-black/70">
      <span>{label}</span>
      <span className="tabular-nums">{formatPrice(value)}</span>
    </div>
  );
}

function Req({
  label,
  value,
  wide,
  mono,
}: {
  label: string;
  value: string;
  wide?: boolean;
  mono?: boolean;
}): React.ReactElement {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <span className="text-black/50">{label}:</span>{" "}
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}
