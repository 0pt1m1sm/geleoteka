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

// Document palette. White paper (the actual print medium) with
// cream accents on cards / totals + gold for headings, dividers,
// and brand wordmark. Browser preview and PDF render identically.
const GOLD = "#b8860b";
const PAPER = "#ffffff";
const CREAM_DEEP = "#f0efe9"; // soft surface for accent cards & totals
const INK = "#1a1a1a";
const INK_MUTED = "#6b6b64";
const RULE = "#e0dfd8";

/**
 * Print-ready estimate document in Geleoteka's light brand palette.
 * Cream paper with gold accents, no foreign black panels. Mobile-safe
 * (no horizontal overflow) and A4-safe in print.
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
    <div
      className="estimate-print mx-auto max-w-[820px] print:max-w-none"
      style={{ background: PAPER, color: INK }}
    >
      <div className="flex justify-end gap-2 px-4 sm:px-8 pt-4 sm:pt-6 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="btn btn-primary text-sm"
        >
          Распечатать
        </button>
      </div>

      <article className="relative px-3 sm:px-8 lg:px-10 py-6 sm:py-10 print:px-0 print:py-0">
        {/* Watermark — large translucent gold "G" behind content.
            Light enough to print without darkening the paper but
            visible enough to brand the document. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
          style={{ zIndex: 0 }}
        >
          <span
            className="font-black select-none"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "min(60vw, 520px)",
              lineHeight: 1,
              color: GOLD,
              opacity: 0.045,
              letterSpacing: "-0.04em",
              transform: "translateY(-4%)",
            }}
          >
            G
          </span>
        </div>
        <div className="relative" style={{ zIndex: 1 }}>
        {/* ---- Header ---- */}
        <header className="relative">
          <div
            aria-hidden
            className="absolute -top-2 left-0 right-0 h-[3px]"
            style={{ background: GOLD }}
          />
          <div
            className="pt-6 pb-6 grid gap-4 sm:gap-6 sm:grid-cols-[auto_1fr_auto] items-start border-b"
            style={{ borderColor: RULE }}
          >
            <div className="flex items-center gap-3">
              <Image
                src="/images/logo.svg"
                alt=""
                width={44}
                height={44}
                priority
              />
              <div className="sm:hidden">
                <div
                  className="text-xl font-black tracking-[0.12em] uppercase leading-tight"
                  style={{ color: GOLD, fontFamily: "var(--font-display)" }}
                >
                  {requisites.shortName || "Geleoteka"}
                </div>
              </div>
            </div>
            <div className="min-w-0">
              <div
                className="hidden sm:block text-2xl md:text-3xl font-black tracking-[0.14em] uppercase leading-tight"
                style={{ color: GOLD, fontFamily: "var(--font-display)" }}
              >
                {requisites.shortName || "Geleoteka"}
              </div>
              <div
                className="mt-1 text-[10px] uppercase tracking-[0.2em] leading-snug"
                style={{ color: INK_MUTED }}
              >
                Специализированный сервис Mercedes-Benz G-Class
              </div>
              {requisites.legalName ? (
                <div className="mt-2 text-xs" style={{ color: INK_MUTED }}>
                  {requisites.legalName}
                </div>
              ) : null}
            </div>
            <div
              className="sm:text-right text-[11px] leading-relaxed sm:max-w-[220px] min-w-0"
              style={{ color: INK_MUTED }}
            >
              {requisites.contactAddress ? (
                <div className="break-words">{requisites.contactAddress}</div>
              ) : null}
              {requisites.contactPhone ? (
                <div className="mt-1 font-mono break-all">
                  тел. {requisites.contactPhone}
                </div>
              ) : null}
              {requisites.contactEmail ? (
                <div className="font-mono break-all">{requisites.contactEmail}</div>
              ) : null}
            </div>
          </div>
        </header>

        {/* ---- Document title ---- */}
        <section className="mt-7 mb-7 flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <div
              className="text-[10px] uppercase tracking-[0.25em]"
              style={{ color: INK_MUTED }}
            >
              Коммерческое предложение
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
              Смета №{estimate.number ?? estimate.id.slice(-6).toUpperCase()}
            </h1>
          </div>
          <div
            className="text-xs leading-relaxed sm:text-right"
            style={{ color: INK_MUTED }}
          >
            <div>
              Дата выпуска:{" "}
              <span className="font-medium" style={{ color: INK }}>
                {formatDate(issueDate)}
              </span>
            </div>
            {estimate.validUntil ? (
              <div>
                Действительна до:{" "}
                <span className="font-medium" style={{ color: INK }}>
                  {formatDate(estimate.validUntil)}
                </span>
              </div>
            ) : null}
          </div>
        </section>

        {/* ---- Parties ---- */}
        <section className="mb-7 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <PartyCard
            title="Заказчик"
            name={estimate.customer.name}
            details={[estimate.customer.phone, estimate.customer.email].filter(
              Boolean,
            )}
          />
          {estimate.vehicle ? (
            <PartyCard
              title="Транспортное средство"
              name={`${estimate.vehicle.make} ${estimate.vehicle.model} ${estimate.vehicle.year}`}
              details={estimate.vehicle.vin ? [`VIN ${estimate.vehicle.vin}`] : []}
              mono
            />
          ) : null}
        </section>

        {/* ---- Lines: borderless rows with gold underline header.
            table-auto + whitespace-nowrap on number columns prevents
            header wraps like "КОЛ-/ВО" and keeps prices on one line.
            Description column absorbs remaining width and wraps. */}
        <section className="mb-7">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: `1.5px solid ${GOLD}` }}>
                <th
                  className="text-left px-1 sm:px-2 py-2 font-medium text-[10px] uppercase tracking-[0.15em] whitespace-nowrap"
                  style={{ color: INK_MUTED, width: "1.75rem" }}
                >
                  №
                </th>
                <th
                  className="text-left px-1 sm:px-2 py-2 font-medium text-[10px] uppercase tracking-[0.15em]"
                  style={{ color: INK_MUTED }}
                >
                  Описание
                </th>
                <th
                  className="text-center px-1 sm:px-2 py-2 font-medium text-[10px] uppercase tracking-[0.15em] whitespace-nowrap"
                  style={{ color: INK_MUTED }}
                >
                  Кол-во
                </th>
                <th
                  className="text-right px-1 sm:px-2 py-2 font-medium text-[10px] uppercase tracking-[0.15em] whitespace-nowrap"
                  style={{ color: INK_MUTED }}
                >
                  Цена
                </th>
                <th
                  className="text-right px-1 sm:px-2 py-2 font-medium text-[10px] uppercase tracking-[0.15em] whitespace-nowrap"
                  style={{ color: INK_MUTED }}
                >
                  Сумма
                </th>
              </tr>
            </thead>
            <tbody>
              {estimate.estimateLines.map((line, i) => (
                <tr
                  key={line.id}
                  style={{
                    borderBottom: `1px solid ${RULE}`,
                  }}
                >
                  <td
                    className="px-1 sm:px-2 py-2.5 align-top tabular-nums"
                    style={{ color: INK_MUTED }}
                  >
                    {i + 1}
                  </td>
                  <td className="px-1 sm:px-2 py-2.5 align-top break-words">
                    <div>{line.description}</div>
                    <div
                      className="mt-0.5 text-[10px] uppercase tracking-[0.12em]"
                      style={{ color: INK_MUTED }}
                    >
                      {DEAL_LINE_TYPE_LABELS[line.type] ?? line.type}
                    </div>
                  </td>
                  <td className="px-1 sm:px-2 py-2.5 align-top text-center tabular-nums whitespace-nowrap">
                    {line.qty}
                  </td>
                  <td className="px-1 sm:px-2 py-2.5 align-top text-right tabular-nums whitespace-nowrap">
                    {formatPrice(line.unitPrice)}
                  </td>
                  <td className="px-1 sm:px-2 py-2.5 align-top text-right tabular-nums font-medium whitespace-nowrap">
                    {formatPrice(line.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ---- Totals — gold-rule card on cream ---- */}
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
            className="mt-3 flex items-baseline justify-between gap-3 px-4 py-3 rounded-sm"
            style={{
              background: CREAM_DEEP,
              borderLeft: `3px solid ${GOLD}`,
            }}
          >
            <span
              className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] shrink-0"
              style={{ color: INK_MUTED }}
            >
              Итого к оплате
            </span>
            <span
              className="text-xl sm:text-2xl font-bold tabular-nums whitespace-nowrap"
              style={{ color: GOLD }}
            >
              {formatPrice(estimate.total)}
            </span>
          </div>
        </section>

        {/* ---- Requisites for payment ---- */}
        {hasAnyRequisite ? (
          <section
            className="mb-8 pt-6 border-t"
            style={{ borderColor: RULE }}
          >
            <h3
              className="text-[10px] uppercase tracking-[0.25em] mb-3"
              style={{ color: INK_MUTED }}
            >
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
              {requisites.bankBik ? (
                <Req label="БИК" value={requisites.bankBik} />
              ) : null}
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
          <section
            className="mb-10 text-xs leading-relaxed pl-4 border-l-2"
            style={{ color: INK_MUTED, borderColor: GOLD }}
          >
            <Markdown source={requisites.estimateFooter} />
          </section>
        ) : null}

        {/* ---- Signatures ---- */}
        <footer
          className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12 pt-6 border-t text-xs"
          style={{ borderColor: RULE }}
        >
          <div>
            <div
              className="text-[10px] uppercase tracking-[0.2em] mb-1"
              style={{ color: INK_MUTED }}
            >
              Исполнитель
            </div>
            <div style={{ color: INK }}>
              {requisites.directorName || requisites.legalName || requisites.shortName}
            </div>
            <div
              className="mt-10 pt-1.5 border-t"
              style={{ borderColor: INK_MUTED, color: INK_MUTED }}
            >
              Подпись · М.П.
            </div>
          </div>
          <div>
            <div
              className="text-[10px] uppercase tracking-[0.2em] mb-1"
              style={{ color: INK_MUTED }}
            >
              Заказчик
            </div>
            <div style={{ color: INK }}>{estimate.customer.name}</div>
            <div
              className="mt-10 pt-1.5 border-t"
              style={{ borderColor: INK_MUTED, color: INK_MUTED }}
            >
              Подпись
            </div>
          </div>
        </footer>
        </div>
      </article>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          html,
          body {
            background: ${PAPER} !important;
            color: ${INK} !important;
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
    <div
      className="rounded-sm px-4 py-3 min-w-0"
      style={{ background: CREAM_DEEP, border: `1px solid ${RULE}` }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.2em] mb-1"
        style={{ color: INK_MUTED }}
      >
        {title}
      </div>
      <div className="font-medium text-sm break-words">{name}</div>
      {details.length > 0 ? (
        <div
          className={"mt-0.5 text-xs " + (mono ? "font-mono break-all" : "break-words")}
          style={{ color: INK_MUTED }}
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
    <div className="flex justify-between" style={{ color: INK_MUTED }}>
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
      <span style={{ color: INK_MUTED }}>{label}:</span>{" "}
      <span className={(mono ? "font-mono " : "") + "break-words"}>{value}</span>
    </div>
  );
}
