import { join } from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Svg,
  Rect,
} from "@react-pdf/renderer";
import { DEAL_LINE_TYPE_LABELS } from "@/lib/deal-stage-labels";

// formatPrice uses ₽ which isn't in the shipped Manrope Cyrillic
// subset; fallback to "руб." inside the PDF only. Also enforces
// non-breaking thin-space thousands separators so prices read as
// "32 000 руб." not "32000 руб." inside the table.
function formatPricePdf(n: number): string {
  const formatted = new Intl.NumberFormat("ru-RU").format(n);
  return `${formatted} руб.`;
}

// Russian-style phone formatting: +79991234567 → +7 999 123-45-67.
// Idempotent — already-formatted numbers are normalised then re-formatted.
function formatPhonePdf(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Canonical RU mobile: 11 digits starting with 7 or 8.
  const ru =
    digits.length === 11 && (digits[0] === "7" || digits[0] === "8")
      ? "7" + digits.slice(1)
      : digits.length === 10
        ? "7" + digits
        : null;
  if (!ru) return raw;
  return `+${ru[0]} ${ru.slice(1, 4)} ${ru.slice(4, 7)}-${ru.slice(7, 9)}-${ru.slice(9, 11)}`;
}

export interface EstimatePdfData {
  number: string | null;
  id: string;
  sentAt: Date | null;
  createdAt: Date;
  validUntil: Date | null;
  subtotalLabor: number;
  subtotalParts: number;
  subtotalRental: number;
  discount: number;
  tax: number;
  total: number;
  customer: { name: string; phone: string; email: string };
  vehicle: {
    make: string;
    model: string;
    year: number;
    vin: string | null;
    plate: string | null;
    mileage: number | null;
  } | null;
  mileage: number | null;
  manager: { name: string; phone: string; email: string } | null;
  estimateLines: Array<{
    id: string;
    type: string;
    description: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
}

export interface EstimatePdfRequisites {
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
  warranty: string;
  partsWarranty: string;
  paymentTerms: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
}

const fontsDir = join(process.cwd(), "public", "fonts");
// NOTE: @react-pdf/renderer does not expose OpenType feature toggles
// on Font.register (no fontFeatureSettings on FontSource), so we can't
// turn on `tnum` for Manrope at registration time. Tabular alignment
// in the PDF is achieved via fixed column widths + right-aligned cells.
Font.register({
  family: "Manrope",
  fonts: [
    { src: join(fontsDir, "Manrope-Regular.woff"), fontWeight: 400 },
    { src: join(fontsDir, "Manrope-Bold.woff"), fontWeight: 700 },
    { src: join(fontsDir, "Manrope-ExtraBold.woff"), fontWeight: 800 },
  ],
});

const GOLD = "#b8860b";
const INK = "#1a1a1a";
const INK_2 = "#444";
const INK_MUTED = "#6b6b64";
const RULE = "#d4d3cd";

// 22mm A4 margin via @page padding inside the document. Single grid:
// header / title / parties / table / totals / payment block / signatures
// all share the same left/right inset of 0.
const GUTTER = 60; // 22mm at 72dpi-ish — react-pdf uses 1pt = 1/72in

const styles = StyleSheet.create({
  page: {
    fontFamily: "Manrope",
    fontSize: 9.5,
    color: INK,
    paddingTop: GUTTER,
    // Reserve room for the fixed SignatureFooter. Footer is positioned
    // at `bottom: 28` and is ~50pt tall, so we need paddingBottom >=
    // bottom + footer_height to keep flow content above signatures.
    paddingBottom: GUTTER + 24,
    paddingHorizontal: GUTTER,
    backgroundColor: "#fff",
  },

  // ---- Header ----
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoBox: {
    width: 34,
    height: 34,
  },
  brand: {
    fontSize: 15,
    fontWeight: 800,
    color: GOLD,
    letterSpacing: 1.4,
  },
  brandTag: {
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 1,
  },
  // Contacts row — single inline Text with bullet separators. Forcing
  // one Text element guarantees a single text baseline (no flex-child
  // cross-axis drift between separate Text nodes, which differ in
  // intrinsic line metrics across PDF rendering engines).
  contactsLine: {
    marginTop: 6,
    fontSize: 8.5,
    color: INK_MUTED,
    lineHeight: 1.3,
  },
  topRule: {
    height: 0.6,
    backgroundColor: RULE,
    marginTop: 10,
  },

  // ---- Title block ----
  // Title row is top-aligned so the right block's vehicle line lines
  // up with the doc title's baseline. Title size dialed back so the
  // header reads like a document, not a landing hero.
  // Doc identification — number top-left, dates top-right. Invoice-
  // standard convention: doc number + issue date + validity all live
  // together as a single header block.
  docIdRow: {
    marginTop: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  docDates: {
    alignItems: "flex-end",
  },
  titleRow: {
    marginTop: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  titleCol: { flex: 1 },
  // Document title — dialed down so it reads as a doc header, not a
  // landing-page hero. 14pt + 700 sits clearly above the table headers
  // (10pt 700) without dominating the page.
  docTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: INK,
    letterSpacing: -0.1,
  },
  docMeta: {
    marginTop: 2,
    fontSize: 9.5,
    color: INK_2,
  },
  titleRightCol: {
    minWidth: 180,
    alignItems: "flex-end",
  },
  // Matches docTitle (14pt 700) so both halves of the title row read as
  // one balanced bar across the page.
  titleRightTop: {
    fontSize: 14,
    fontWeight: 700,
    color: INK,
    letterSpacing: -0.1,
    textAlign: "right",
  },
  titleRight: {
    marginTop: 2,
    textAlign: "right",
    fontSize: 9.5,
    color: INK_2,
  },

  // ---- Parties — two equal cards with a subtle outline so the blocks
  // don't read as free-floating text on the wide page. Padding and
  // border weight matched to the rest of the document's minimal look. ----
  parties: {
    marginTop: 12,
    flexDirection: "row",
    gap: 16,
  },
  partyCol: {
    flex: 1,
    minWidth: 0,
    borderWidth: 0.6,
    borderColor: RULE,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  partyLabel: {
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  partyName: { fontSize: 11, fontWeight: 700 },
  partyDetail: { marginTop: 1.5, fontSize: 9, color: INK_2 },
  // Email shares the same fontSize/leading as other party details so
  // baselines align across the card. wrap={false} on the Text element
  // prevents mid-`@` line breaks for long addresses.
  partyEmail: { marginTop: 1.5, fontSize: 9, color: INK_2 },

  // Subject bar: labeled "Объект работ" + inline vehicle details. Sits
  // between the parties block and the line-items table to make clear
  // what work the estimate is about (the vehicle), not who the parties
  // are (already covered above).
  subjectBar: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    borderTopWidth: 0.6,
    borderBottomWidth: 0.6,
    borderColor: RULE,
  },
  subjectLabel: {
    fontSize: 8,
    color: INK_MUTED,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontWeight: 700,
  },
  subjectValue: {
    flex: 1,
    fontSize: 10,
    color: INK,
    fontWeight: 700,
  },

  // ---- Vehicle details — full-width card with two-column rows ----
  vehicleCard: {
    borderWidth: 0.6,
    borderColor: RULE,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  vehicleRow: {
    flexDirection: "row",
    paddingVertical: 1,
  },
  vehicleLabel: {
    width: 130,
    color: INK_MUTED,
    fontSize: 9,
  },
  vehicleValue: {
    flex: 1,
    color: INK,
    fontSize: 9,
  },

  // ---- Table ----
  tableHeader: {
    marginTop: 14,
    flexDirection: "row",
    borderBottomWidth: 0.6,
    borderBottomColor: INK,
    paddingVertical: 5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    paddingVertical: 6,
  },
  th: {
    fontSize: 8.5,
    color: INK_2,
    textTransform: "uppercase",
    fontWeight: 700,
  },
  td: { fontSize: 10, color: INK },
  // Column widths sum to 100%. Wider Кол-во so the header doesn't wrap.
  colNo: { width: "5%", paddingHorizontal: 2, textAlign: "left" },
  colDescr: { width: "49%", paddingHorizontal: 4 },
  colQty: { width: "12%", paddingHorizontal: 4, textAlign: "right" },
  colPrice: { width: "16%", paddingHorizontal: 2, textAlign: "right" },
  colSum: { width: "18%", paddingHorizontal: 2, textAlign: "right" },
  cellSecondary: { marginTop: 1, fontSize: 8, color: INK_MUTED },

  // ---- Totals — compact right-aligned block. Top breathing room
  // separates it from the table; grand row sits on a hair-line rule and
  // carries the largest type, anchored by the gold accent. ----
  totals: {
    marginTop: 14,
    marginLeft: "auto",
    width: 240,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    fontSize: 9.5,
    color: INK_2,
  },
  totalsValue: { color: INK },
  // Grand-row baseline alignment is fragile with mismatched font sizes
  // (12pt label vs 22pt value). Wrapping both children in matched
  // line-heights via explicit `lineHeight: 1` on each Text removes the
  // implicit half-leading offset that pushed the label above the value.
  grandRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.6,
    borderTopColor: INK_MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  grandLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: INK,
    letterSpacing: -0.1,
    lineHeight: 1,
  },
  grandValue: {
    fontSize: 22,
    fontWeight: 800,
    color: INK,
    lineHeight: 1,
  },

  // ---- Section header for in-flow blocks (Автомобиль, Реквизиты, etc) ----
  blockHeader: {
    marginTop: 14,
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  // Requisites — single-column definition list. Fixed-width label
  // keeps every value on the same vertical edge.
  reqsList: {
    fontSize: 9.5,
  },
  defRow: {
    flexDirection: "row",
    marginVertical: 2,
  },
  defLabel: {
    width: 110,
    color: INK_MUTED,
    fontSize: 9.5,
  },
  defValue: {
    flex: 1,
    color: INK,
    fontSize: 9.5,
  },
  // Manager card — stacked, single column. Replaces the prior 3-column
  // row that pushed phone and email to opposite ends of the page.
  managerCard: {
    marginTop: 6,
  },
  managerName: { fontSize: 10.5, fontWeight: 700, color: INK },
  managerDetail: { marginTop: 2, fontSize: 9.5, color: INK_2 },

  // Block-label microheader reused for terms and other page-2 sections.
  termsHeader: {
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  termsBody: { fontSize: 9, color: INK_2, lineHeight: 1.45 },

  footerNote: {
    marginTop: 18,
    fontSize: 8.5,
    color: INK_MUTED,
    lineHeight: 1.45,
  },

  // ---- Page-2 specific ----
  // Compact brand strip — same logo, no tagline, no contacts row.
  brandStripCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  brandStripCompactLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandWordmarkCompact: {
    fontSize: 12,
    fontWeight: 800,
    color: GOLD,
    letterSpacing: 1.2,
  },
  brandReference: {
    fontSize: 9,
    color: INK_MUTED,
    letterSpacing: 0.3,
  },
  page2Heading: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: 800,
    color: INK,
    letterSpacing: -0.3,
  },
  page2Subtitle: {
    marginTop: 4,
    fontSize: 10,
    color: INK_2,
    lineHeight: 1.45,
  },
  page2TermsColumn: {
    marginTop: 22,
  },
  page2TermsBlock: {
    marginBottom: 10,
  },

  // ---- Signatures — in-flow at end of page 1, so they land once on the
  // final page-1 instance (after the table + totals) instead of being
  // repeated on every table-overflow continuation. ----
  // Signatures pinned to the bottom of every page (both estimate and
  // conditions). `position: absolute` + low `bottom` keeps them tight
  // against the page edge so the reserved paddingBottom on `styles.page`
  // can be smaller, leaving more vertical room for content like totals.
  signatures: {
    position: "absolute",
    left: GUTTER,
    right: GUTTER,
    bottom: 28,
    flexDirection: "row",
    gap: 30,
  },
  sigCol: { flex: 1 },
  sigLabel: {
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sigName: { fontSize: 10, color: INK },
  sigLine: {
    marginTop: 16,
    paddingTop: 3,
    borderTopWidth: 0.6,
    borderTopColor: INK_MUTED,
    fontSize: 8,
    color: INK_MUTED,
  },
});

function formatDateRu(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatMileage(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " км";
}

/**
 * Brand strip used at the top of both pages. Compact variant drops the
 * tagline and contacts row so page 2's header doesn't compete with the
 * page heading; the right-aligned `reference` slot identifies which
 * estimate page 2 belongs to (e.g. "К смете № СМ-000142").
 */
function BrandStrip({
  requisites,
  compact,
  reference,
}: {
  requisites: EstimatePdfRequisites;
  compact?: boolean;
  reference?: string;
}) {
  if (compact) {
    return (
      <View style={styles.brandStripCompact}>
        <View style={styles.brandStripCompactLeft}>
          <Svg width={22} height={22} viewBox="0 0 64 64">
            <Rect
              x={4}
              y={4}
              width={56}
              height={56}
              rx={6}
              stroke={GOLD}
              strokeWidth={5}
              fill="none"
            />
            <Text
              x={32}
              y={46}
              fill={GOLD}
              style={{ fontSize: 38, fontWeight: 800 }}
              textAnchor="middle"
            >
              G
            </Text>
          </Svg>
          <Text style={styles.brandWordmarkCompact}>
            {(requisites.shortName || "GELEOTEKA").toUpperCase()}
          </Text>
        </View>
        {reference ? (
          <Text style={styles.brandReference}>{reference}</Text>
        ) : null}
      </View>
    );
  }
  return (
    <>
      <View style={styles.headerRow}>
        <Svg width={34} height={34} viewBox="0 0 64 64">
          <Rect
            x={4}
            y={4}
            width={56}
            height={56}
            rx={6}
            stroke={GOLD}
            strokeWidth={5}
            fill="none"
          />
          <Text
            x={32}
            y={46}
            fill={GOLD}
            style={{ fontSize: 38, fontWeight: 800 }}
            textAnchor="middle"
          >
            G
          </Text>
        </Svg>
        <View>
          <Text style={styles.brand}>
            {(requisites.shortName || "GELEOTEKA").toUpperCase()}
          </Text>
          <Text style={styles.brandTag}>
            Специализированный сервис Mercedes-Benz G-Class
          </Text>
        </View>
      </View>
      {(() => {
        const parts: string[] = [];
        if (requisites.contactAddress) parts.push(requisites.contactAddress);
        if (requisites.contactPhone)
          parts.push(`тел. ${formatPhonePdf(requisites.contactPhone)}`);
        if (requisites.contactEmail) parts.push(requisites.contactEmail);
        return parts.length > 0 ? (
          <Text style={styles.contactsLine}>{parts.join("  ·  ")}</Text>
        ) : null;
      })()}
      <View style={styles.topRule} />
    </>
  );
}

export function EstimatePdfDocument({
  estimate,
  requisites,
}: {
  estimate: EstimatePdfData;
  requisites: EstimatePdfRequisites;
}) {
  const issueDate = estimate.sentAt ?? estimate.createdAt;
  const hasReqs =
    requisites.inn ||
    requisites.kpp ||
    requisites.ogrn ||
    requisites.account ||
    requisites.bankName;
  const docNumber =
    estimate.number ?? estimate.id.slice(-6).toUpperCase();

  return (
    <Document
      title={`Смета ${docNumber}`}
      author={requisites.shortName || "Geleoteka"}
    >
      <Page size="A4" style={styles.page} wrap>
        <BrandStrip requisites={requisites} />

        {/* ---- Document identification — all dates and the number live
            together (industry-standard invoice convention). Vehicle is
            NOT here — it's the subject of the work, shown below in its
            own labeled bar. ---- */}
        <View style={styles.docIdRow}>
          <Text style={styles.docTitle}>Смета № {docNumber}</Text>
          <View style={styles.docDates}>
            <Text style={styles.docMeta}>
              Дата: {formatDateRu(issueDate)}
            </Text>
            {estimate.validUntil ? (
              <Text style={styles.docMeta}>
                Действительна до: {formatDateRu(estimate.validUntil)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ---- Parties: Заказчик / Исполнитель ---- */}
        <View style={styles.parties}>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Заказчик</Text>
            <Text style={styles.partyName}>{estimate.customer.name}</Text>
            {estimate.customer.phone ? (
              <Text style={styles.partyDetail}>
                {formatPhonePdf(estimate.customer.phone)}
              </Text>
            ) : null}
            {estimate.customer.email ? (
              <Text style={styles.partyEmail} wrap={false}>{estimate.customer.email}</Text>
            ) : null}
          </View>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Исполнитель</Text>
            <Text style={styles.partyName}>
              {requisites.legalName || requisites.shortName}
            </Text>
            {requisites.inn ? (
              <Text style={styles.partyDetail}>ИНН {requisites.inn}</Text>
            ) : null}
            {requisites.contactPhone ? (
              <Text style={styles.partyDetail}>
                {formatPhonePdf(requisites.contactPhone)}
              </Text>
            ) : null}
            {requisites.contactEmail ? (
              <Text style={styles.partyEmail} wrap={false}>{requisites.contactEmail}</Text>
            ) : null}
          </View>
        </View>

        {/* ---- Subject of work: the vehicle this estimate applies to.
            Invoice-standard "Subject" / "Re:" line — labeled, distinct
            from parties. Inline so it reads as one fact, not a stack. ---- */}
        <View style={styles.subjectBar}>
          <Text style={styles.subjectLabel}>Объект работ:</Text>
          <Text style={styles.subjectValue}>
            {estimate.vehicle
              ? `${estimate.vehicle.make} ${estimate.vehicle.model} ${estimate.vehicle.year} г.`
              : "Н/Д"}
            {estimate.vehicle?.plate ? ` · ${estimate.vehicle.plate}` : ""}
            {estimate.vehicle?.vin ? ` · VIN ${estimate.vehicle.vin}` : ""}
            {estimate.mileage !== null && estimate.mileage > 0
              ? ` · пробег ${formatMileage(estimate.mileage)}`
              : ""}
          </Text>
        </View>

        {/* ---- Table ---- header is in-flow (not `fixed`) so it doesn't
            render as an empty band above the totals on a page-1 overflow
            continuation. Long tables still get a clean break — the
            secondary type label keeps each row identifiable. */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colNo]}>№</Text>
          <Text style={[styles.th, styles.colDescr]}>Описание</Text>
          <Text style={[styles.th, styles.colQty]}>Кол-во</Text>
          <Text style={[styles.th, styles.colPrice]}>Цена</Text>
          <Text style={[styles.th, styles.colSum]}>Сумма</Text>
        </View>
        {estimate.estimateLines.map((line, i) => (
          <View key={line.id} style={styles.tableRow} wrap={false}>
            <Text style={[styles.td, styles.colNo, { color: INK_MUTED }]}>
              {i + 1}
            </Text>
            <View style={styles.colDescr}>
              <Text style={styles.td}>{line.description}</Text>
              <Text style={styles.cellSecondary}>
                {DEAL_LINE_TYPE_LABELS[line.type] ?? line.type}
              </Text>
            </View>
            <Text style={[styles.td, styles.colQty]}>{line.qty}</Text>
            <Text style={[styles.td, styles.colPrice]}>
              {formatPricePdf(line.unitPrice)}
            </Text>
            <Text style={[styles.td, styles.colSum, { fontWeight: 700 }]}>
              {formatPricePdf(line.total)}
            </Text>
          </View>
        ))}

        {/* ---- Totals — right-aligned final row, page 1 only. ---- */}
        <View style={styles.totals}>
          {estimate.subtotalLabor ? (
            <View style={styles.totalsRow}>
              <Text>Работы</Text>
              <Text style={styles.totalsValue}>
                {formatPricePdf(estimate.subtotalLabor)}
              </Text>
            </View>
          ) : null}
          {estimate.subtotalParts ? (
            <View style={styles.totalsRow}>
              <Text>Запчасти</Text>
              <Text style={styles.totalsValue}>
                {formatPricePdf(estimate.subtotalParts)}
              </Text>
            </View>
          ) : null}
          {estimate.subtotalRental ? (
            <View style={styles.totalsRow}>
              <Text>Аренда</Text>
              <Text style={styles.totalsValue}>
                {formatPricePdf(estimate.subtotalRental)}
              </Text>
            </View>
          ) : null}
          {estimate.discount ? (
            <View style={styles.totalsRow}>
              <Text>Скидки</Text>
              <Text style={styles.totalsValue}>
                {formatPricePdf(estimate.discount)}
              </Text>
            </View>
          ) : null}
          <View style={styles.totalsRow}>
            <Text>НДС</Text>
            <Text style={styles.totalsValue}>не облагается</Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Итого к оплате</Text>
            <Text style={styles.grandValue}>{formatPricePdf(estimate.total)}</Text>
          </View>
        </View>

        <SignatureFooter estimate={estimate} requisites={requisites} />
      </Page>

      {/* ============= Page 2 — Conditions & Warranty =============
          Payment terms, warranty on labor and parts, plus banking
          requisites for bank-transfer payment. Approval of the estimate
          lives in the customer cabinet. */}
      <Page size="A4" style={styles.page}>
        <BrandStrip
          requisites={requisites}
          compact
          reference={`К смете № ${docNumber}`}
        />
        <Text style={styles.page2Heading}>Условия и гарантия</Text>
        <Text style={styles.page2Subtitle}>
          Ниже — условия оплаты, гарантия на работы и запчасти, а также банковские реквизиты для перевода.
        </Text>

        <View style={styles.page2TermsColumn}>
          {requisites.paymentTerms ? (
            <View style={styles.page2TermsBlock}>
              <Text style={styles.termsHeader}>Условия оплаты</Text>
              <Text style={styles.termsBody}>{requisites.paymentTerms}</Text>
            </View>
          ) : null}
          {requisites.warranty ? (
            <View style={styles.page2TermsBlock}>
              <Text style={styles.termsHeader}>Гарантия на работы</Text>
              <Text style={styles.termsBody}>{requisites.warranty}</Text>
            </View>
          ) : null}
          {requisites.partsWarranty ? (
            <View style={styles.page2TermsBlock}>
              <Text style={styles.termsHeader}>Гарантия на запчасти</Text>
              <Text style={styles.termsBody}>
                {requisites.partsWarranty}
              </Text>
            </View>
          ) : null}
        </View>

        {hasReqs ? (
          <>
            <Text style={styles.blockHeader}>Реквизиты для оплаты</Text>
            <View style={styles.reqsList}>
              {requisites.legalName ? (
                <DefRow label="Получатель" value={requisites.legalName} />
              ) : null}
              {requisites.inn || requisites.kpp ? (
                <DefRow
                  label="ИНН / КПП"
                  value={[requisites.inn, requisites.kpp]
                    .filter(Boolean)
                    .join(" / ")}
                />
              ) : null}
              {requisites.ogrn ? (
                <DefRow label="ОГРН" value={requisites.ogrn} />
              ) : null}
              {requisites.legalAddress ? (
                <DefRow label="Юр. адрес" value={requisites.legalAddress} />
              ) : null}
              {requisites.bankName ? (
                <DefRow label="Банк" value={requisites.bankName} />
              ) : null}
              {requisites.bankBik ? (
                <DefRow label="БИК" value={requisites.bankBik} />
              ) : null}
              {requisites.account ? (
                <DefRow label="Р/счёт" value={requisites.account} />
              ) : null}
              {requisites.corrAccount ? (
                <DefRow label="К/счёт" value={requisites.corrAccount} />
              ) : null}
            </View>
          </>
        ) : null}

        {estimate.manager ? (
          <>
            <Text style={styles.blockHeader}>Ответственный менеджер</Text>
            <View style={styles.managerCard}>
              <Text style={styles.managerName}>{estimate.manager.name}</Text>
              {estimate.manager.phone ? (
                <Text style={styles.managerDetail}>
                  {formatPhonePdf(estimate.manager.phone)}
                </Text>
              ) : null}
              {estimate.manager.email ? (
                <Text style={styles.managerDetail}>
                  {estimate.manager.email}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}

        <Text style={styles.footerNote}>
          {estimate.validUntil
            ? `Смета действительна до ${formatDateRu(estimate.validUntil)} По вопросам согласования — отдел сервиса.`
            : "По вопросам согласования — отдел сервиса."}
        </Text>
        <SignatureFooter estimate={estimate} requisites={requisites} />
      </Page>
    </Document>
  );
}

/**
 * Pinned-to-bottom signature row, used on every page via `fixed`. The page
 * itself reserves `paddingBottom: GUTTER` so flowing content never overlaps
 * the footer. `wrap={false}` keeps each side's three lines together when
 * an overflow continuation re-renders the footer.
 */
function SignatureFooter({
  estimate,
  requisites,
}: {
  estimate: EstimatePdfData;
  requisites: EstimatePdfRequisites;
}) {
  return (
    <View style={styles.signatures} fixed>
      <View style={styles.sigCol}>
        <Text style={styles.sigLabel}>Исполнитель</Text>
        <Text style={styles.sigName}>
          {requisites.directorName ||
            requisites.legalName ||
            requisites.shortName}
        </Text>
        <Text style={styles.sigLine}>Подпись · М.П.</Text>
      </View>
      <View style={styles.sigCol}>
        <Text style={styles.sigLabel}>Заказчик</Text>
        <Text style={styles.sigName}>{estimate.customer.name}</Text>
        <Text style={styles.sigLine}>Подпись</Text>
      </View>
    </View>
  );
}

function DefRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.defRow} wrap={false}>
      <Text style={styles.defLabel}>{label}:</Text>
      <Text style={styles.defValue}>{value}</Text>
    </View>
  );
}
