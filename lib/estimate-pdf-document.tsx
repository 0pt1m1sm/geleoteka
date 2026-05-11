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
import { formatPrice } from "@/lib/utils";
import { DEAL_LINE_TYPE_LABELS } from "@/lib/deal-stage-labels";

// formatPrice uses the ₽ sign which isn't in the Manrope Cyrillic
// subset we ship — `fontkit` renders missing glyphs as a fallback.
// Swap to the textual "руб." for the PDF only; on screen the symbol
// stays because the browser font has the glyph.
function formatPricePdf(n: number): string {
  return formatPrice(n).replace("₽", "руб.").trim();
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
  vehicle: { make: string; model: string; year: number; vin: string | null } | null;
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
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
}

// Register Manrope from local TTFs in public/fonts/. @react-pdf's
// FontSource accepts an absolute filesystem path (it routes through
// fontkit.open when the src isn't a data URL or http(s) URL).
const fontsDir = join(process.cwd(), "public", "fonts");
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
const INK_MUTED = "#6b6b64";
const RULE = "#e0dfd8";
const CREAM_DEEP = "#f0efe9";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Manrope",
    fontSize: 9,
    color: INK,
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 40,
    backgroundColor: "#fff",
  },
  goldRail: {
    height: 3,
    backgroundColor: GOLD,
    marginBottom: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  brand: {
    fontSize: 22,
    fontWeight: 800,
    color: GOLD,
    letterSpacing: 2.5,
  },
  tagline: {
    marginTop: 4,
    fontSize: 8,
    color: INK_MUTED,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  legalLine: {
    marginTop: 2,
    fontSize: 9,
    color: INK_MUTED,
  },
  contactsRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    fontSize: 8.5,
    color: INK_MUTED,
  },
  hr: {
    height: 1,
    backgroundColor: RULE,
    marginTop: 14,
  },
  docTitleRow: {
    marginTop: 18,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  eyebrow: {
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  docTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginTop: 3,
  },
  dateCol: {
    fontSize: 9,
    color: INK_MUTED,
    textAlign: "right",
  },
  dateValue: {
    color: INK,
    fontWeight: 700,
  },
  partiesRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  partyCard: {
    flex: 1,
    backgroundColor: CREAM_DEEP,
    borderWidth: 1,
    borderColor: RULE,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  partyLabel: {
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  partyName: {
    fontSize: 10,
    fontWeight: 700,
  },
  partyDetail: {
    marginTop: 2,
    fontSize: 9,
    color: INK_MUTED,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: GOLD,
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    paddingVertical: 7,
  },
  th: {
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontWeight: 700,
  },
  td: {
    fontSize: 9,
  },
  colNo: { width: 24, paddingHorizontal: 2 },
  colDescr: { flex: 1, paddingHorizontal: 4 },
  colQty: { width: 50, paddingHorizontal: 2, textAlign: "center" },
  colPrice: { width: 70, paddingHorizontal: 2, textAlign: "right" },
  colSum: { width: 80, paddingHorizontal: 2, textAlign: "right" },
  rowMeta: {
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 2,
  },
  totalsBox: {
    marginLeft: "auto",
    width: 280,
    marginTop: 14,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    fontSize: 9,
    color: INK_MUTED,
  },
  totalsValue: { color: INK },
  grandRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: GOLD,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  grandLabel: {
    fontSize: 10,
    color: INK,
    fontWeight: 700,
  },
  grandValue: {
    fontSize: 16,
    fontWeight: 800,
    color: INK,
  },
  sectionHeader: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: RULE,
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  reqsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    fontSize: 8.5,
  },
  reqsCell: {
    width: "50%",
    paddingVertical: 1.5,
    paddingRight: 6,
  },
  reqsCellWide: {
    width: "100%",
    paddingVertical: 1.5,
    paddingRight: 6,
  },
  reqsLabel: { color: INK_MUTED },
  footerNote: {
    marginTop: 14,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: GOLD,
    fontSize: 8.5,
    color: INK_MUTED,
    lineHeight: 1.4,
  },
  signatures: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: RULE,
    flexDirection: "row",
    gap: 30,
  },
  sigCol: { flex: 1 },
  sigLabel: {
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sigName: { fontSize: 9 },
  sigLine: {
    marginTop: 36,
    paddingTop: 4,
    borderTopWidth: 0.7,
    borderTopColor: INK_MUTED,
    fontSize: 7.5,
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

  return (
    <Document
      title={`Смета ${estimate.number ?? estimate.id}`}
      author={requisites.shortName || "Geleoteka"}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.goldRail} fixed />

        {/* Header */}
        <View style={styles.headerRow}>
          <Svg width={42} height={42} viewBox="0 0 64 64">
            <Rect x={4} y={4} width={56} height={56} rx={6} stroke={GOLD} strokeWidth={5} fill="none" />
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
          <Text style={styles.brand}>
            {(requisites.shortName || "GELEOTEKA").toUpperCase()}
          </Text>
        </View>
        <Text style={styles.tagline}>
          Специализированный сервис Mercedes-Benz G-Class
        </Text>
        {requisites.legalName ? (
          <Text style={styles.legalLine}>{requisites.legalName}</Text>
        ) : null}
        <View style={styles.contactsRow}>
          {requisites.contactAddress ? (
            <Text>{requisites.contactAddress}</Text>
          ) : null}
          {requisites.contactPhone ? (
            <Text>тел. {requisites.contactPhone}</Text>
          ) : null}
          {requisites.contactEmail ? <Text>{requisites.contactEmail}</Text> : null}
        </View>
        <View style={styles.hr} />

        {/* Document title */}
        <View style={styles.docTitleRow}>
          <View>
            <Text style={styles.eyebrow}>Коммерческое предложение</Text>
            <Text style={styles.docTitle}>
              Смета №{estimate.number ?? estimate.id.slice(-6).toUpperCase()}
            </Text>
          </View>
          <View style={styles.dateCol}>
            <Text>
              Дата выпуска:{" "}
              <Text style={styles.dateValue}>{formatDateRu(issueDate)}</Text>
            </Text>
            {estimate.validUntil ? (
              <Text>
                Действительна до:{" "}
                <Text style={styles.dateValue}>
                  {formatDateRu(estimate.validUntil)}
                </Text>
              </Text>
            ) : null}
          </View>
        </View>

        {/* Parties */}
        <View style={styles.partiesRow}>
          <View style={styles.partyCard}>
            <Text style={styles.partyLabel}>Заказчик</Text>
            <Text style={styles.partyName}>{estimate.customer.name}</Text>
            {estimate.customer.phone ? (
              <Text style={styles.partyDetail}>{estimate.customer.phone}</Text>
            ) : null}
            {estimate.customer.email ? (
              <Text style={styles.partyDetail}>{estimate.customer.email}</Text>
            ) : null}
          </View>
          {estimate.vehicle ? (
            <View style={styles.partyCard}>
              <Text style={styles.partyLabel}>Транспортное средство</Text>
              <Text style={styles.partyName}>
                {estimate.vehicle.make} {estimate.vehicle.model}{" "}
                {estimate.vehicle.year}
              </Text>
              {estimate.vehicle.vin ? (
                <Text style={styles.partyDetail}>VIN: {estimate.vehicle.vin}</Text>
              ) : null}
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
        </View>

        {/* Lines table */}
        <View style={styles.tableHeader} fixed>
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
              <Text style={styles.rowMeta}>
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

        {/* Totals */}
        <View style={styles.totalsBox}>
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
          {estimate.tax ? (
            <View style={styles.totalsRow}>
              <Text>Налог</Text>
              <Text style={styles.totalsValue}>
                {formatPricePdf(estimate.tax)}
              </Text>
            </View>
          ) : null}
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Итого к оплате</Text>
            <Text style={styles.grandValue}>{formatPricePdf(estimate.total)}</Text>
          </View>
        </View>

        {/* Requisites */}
        {hasReqs ? (
          <>
            <Text style={styles.sectionHeader}>Реквизиты для оплаты</Text>
            <View style={styles.reqsGrid}>
              {requisites.legalName ? (
                <Req wide label="Получатель" value={requisites.legalName} />
              ) : null}
              {requisites.inn ? <Req label="ИНН" value={requisites.inn} /> : null}
              {requisites.kpp ? <Req label="КПП" value={requisites.kpp} /> : null}
              {requisites.ogrn ? (
                <Req label="ОГРН" value={requisites.ogrn} />
              ) : null}
              {requisites.legalAddress ? (
                <Req wide label="Юр. адрес" value={requisites.legalAddress} />
              ) : null}
              {requisites.bankName ? (
                <Req wide label="Банк" value={requisites.bankName} />
              ) : null}
              {requisites.bankBik ? (
                <Req label="БИК" value={requisites.bankBik} />
              ) : null}
              {requisites.account ? (
                <Req label="Р/счёт" value={requisites.account} />
              ) : null}
              {requisites.corrAccount ? (
                <Req wide label="К/счёт" value={requisites.corrAccount} />
              ) : null}
            </View>
          </>
        ) : null}

        {/* Footer note */}
        {requisites.estimateFooter ? (
          <Text style={styles.footerNote}>{requisites.estimateFooter}</Text>
        ) : null}

        {/* Signatures */}
        <View style={styles.signatures} wrap={false}>
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

      </Page>
    </Document>
  );
}

function Req({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <View style={wide ? styles.reqsCellWide : styles.reqsCell}>
      <Text>
        <Text style={styles.reqsLabel}>{label}: </Text>
        {value}
      </Text>
    </View>
  );
}
