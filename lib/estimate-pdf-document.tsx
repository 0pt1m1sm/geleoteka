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

// formatPrice uses ₽ which isn't in the shipped Manrope Cyrillic
// subset; fallback to "руб." inside the PDF only.
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
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
}

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
const INK_2 = "#444";
const INK_MUTED = "#6b6b64";
const RULE = "#d4d3cd";
const RULE_SOFT = "#e8e7e2";

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
    paddingBottom: GUTTER,
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
  contactsRow: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    fontSize: 8.5,
    color: INK_MUTED,
  },
  topRule: {
    height: 0.6,
    backgroundColor: RULE,
    marginTop: 14,
  },

  // ---- Title block ----
  titleRow: {
    marginTop: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  titleCol: { flex: 1 },
  docTitle: {
    fontSize: 26,
    fontWeight: 800,
    color: INK,
    letterSpacing: -0.3,
  },
  docMeta: {
    marginTop: 4,
    fontSize: 10,
    color: INK_2,
  },
  titleRight: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 9.5,
    color: INK_2,
  },
  titleRightStrong: { color: INK, fontWeight: 700 },

  // ---- Parties — clean two-column without heavy backgrounds ----
  parties: {
    marginTop: 22,
    flexDirection: "row",
    gap: 24,
  },
  partyCol: { flex: 1, minWidth: 0 },
  partyLabel: {
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  partyName: { fontSize: 11, fontWeight: 700 },
  partyDetail: { marginTop: 1.5, fontSize: 9, color: INK_2 },

  // ---- Vehicle facts row ----
  facts: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    fontSize: 8.5,
    color: INK_MUTED,
  },
  factLabel: { color: INK_MUTED, marginRight: 4 },
  factValue: { color: INK },

  // ---- Table ----
  tableHeader: {
    marginTop: 22,
    flexDirection: "row",
    borderBottomWidth: 0.6,
    borderBottomColor: INK,
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: RULE_SOFT,
    paddingVertical: 8,
  },
  th: {
    fontSize: 8,
    color: INK_2,
    letterSpacing: 0.8,
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

  // ---- Totals — strong final row ----
  totals: {
    marginTop: 12,
    marginLeft: "auto",
    width: 260,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.5,
    fontSize: 9.5,
    color: INK_2,
  },
  totalsValue: { color: INK },
  grandRow: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: INK,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  grandLabel: { fontSize: 12, fontWeight: 700, color: INK },
  grandValue: { fontSize: 20, fontWeight: 800, color: INK },

  // ---- Payment + manager block ----
  blockHeader: {
    marginTop: 26,
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  reqsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    fontSize: 9,
  },
  reqsCell: {
    width: "50%",
    paddingVertical: 1.5,
    paddingRight: 8,
  },
  reqsCellWide: {
    width: "100%",
    paddingVertical: 1.5,
    paddingRight: 8,
  },
  reqsLabel: { color: INK_MUTED },
  twoCol: {
    marginTop: 8,
    flexDirection: "row",
    gap: 24,
  },
  twoColItem: { flex: 1, fontSize: 9, color: INK },

  footerNote: {
    marginTop: 18,
    fontSize: 8.5,
    color: INK_MUTED,
    lineHeight: 1.45,
  },

  // ---- Signatures pinned to bottom of page via fixed footer ----
  signatures: {
    position: "absolute",
    left: GUTTER,
    right: GUTTER,
    bottom: GUTTER,
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
    marginTop: 28,
    paddingTop: 4,
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
  const vehicleLine = estimate.vehicle
    ? `${estimate.vehicle.make} ${estimate.vehicle.model} ${estimate.vehicle.year}`
    : null;

  return (
    <Document
      title={`Смета ${docNumber}`}
      author={requisites.shortName || "Geleoteka"}
    >
      <Page size="A4" style={styles.page} wrap>
        {/* Brand watermark — same gold-outline-square + G monogram as
            the header. Positioned in the lower-left empty area above
            the pinned signatures so it never overlaps the table,
            totals, or requisites block. Opacity tuned low so it reads
            as paper texture, not content. */}
        <View
          fixed
          style={{
            position: "absolute",
            right: GUTTER,
            bottom: GUTTER + 4,
            opacity: 0.025,
          }}
        >
          <Svg width={60} height={60} viewBox="0 0 64 64">
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
        </View>

        {/* ---- Brand strip ---- */}
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
        <View style={styles.contactsRow}>
          {requisites.contactAddress ? (
            <Text>{requisites.contactAddress}</Text>
          ) : null}
          {requisites.contactPhone ? (
            <Text>тел. {requisites.contactPhone}</Text>
          ) : null}
          {requisites.contactEmail ? <Text>{requisites.contactEmail}</Text> : null}
        </View>
        <View style={styles.topRule} />

        {/* ---- Title — single dominant element ---- */}
        <View style={styles.titleRow}>
          <View style={styles.titleCol}>
            <Text style={styles.docTitle}>Смета № {docNumber}</Text>
            <Text style={styles.docMeta}>от {formatDateRu(issueDate)}</Text>
          </View>
          {vehicleLine ? (
            <View>
              <Text style={styles.titleRight}>
                <Text style={styles.titleRightStrong}>{vehicleLine}</Text>
              </Text>
              {estimate.validUntil ? (
                <Text style={styles.titleRight}>
                  действительна до {formatDateRu(estimate.validUntil)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* ---- Parties ---- */}
        <View style={styles.parties}>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Заказчик</Text>
            <Text style={styles.partyName}>{estimate.customer.name}</Text>
            {estimate.customer.phone ? (
              <Text style={styles.partyDetail}>{estimate.customer.phone}</Text>
            ) : null}
            {estimate.customer.email ? (
              <Text style={styles.partyDetail}>{estimate.customer.email}</Text>
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
              <Text style={styles.partyDetail}>{requisites.contactPhone}</Text>
            ) : null}
          </View>
        </View>

        {/* ---- Vehicle facts row ---- */}
        {estimate.vehicle ? (
          <View style={styles.facts}>
            {estimate.vehicle.vin ? (
              <Text>
                <Text style={styles.factLabel}>VIN:</Text>
                <Text style={styles.factValue}>{estimate.vehicle.vin}</Text>
              </Text>
            ) : null}
            {estimate.vehicle.plate ? (
              <Text>
                <Text style={styles.factLabel}>Госномер:</Text>
                <Text style={styles.factValue}>{estimate.vehicle.plate}</Text>
              </Text>
            ) : null}
            {estimate.mileage !== null && estimate.mileage > 0 ? (
              <Text>
                <Text style={styles.factLabel}>Пробег: </Text>
                <Text style={styles.factValue}>{formatMileage(estimate.mileage)}</Text>
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ---- Table ---- */}
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

        {/* ---- Totals ---- */}
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

        {/* ---- Payment requisites ---- */}
        {hasReqs ? (
          <>
            <Text style={styles.blockHeader}>Реквизиты для оплаты</Text>
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

        {/* ---- Manager / contact for questions ---- */}
        {estimate.manager ? (
          <>
            <Text style={styles.blockHeader}>Ответственный менеджер</Text>
            <View style={styles.twoCol}>
              <Text style={styles.twoColItem}>{estimate.manager.name}</Text>
              {estimate.manager.phone ? (
                <Text style={styles.twoColItem}>{estimate.manager.phone}</Text>
              ) : null}
              {estimate.manager.email ? (
                <Text style={styles.twoColItem}>{estimate.manager.email}</Text>
              ) : null}
            </View>
          </>
        ) : null}

        {/* ---- Footer note — concrete validity date instead of the
            generic "during the specified term" CMS placeholder. */}
        <Text style={styles.footerNote}>
          {estimate.validUntil
            ? `Смета действительна до ${formatDateRu(estimate.validUntil)}. `
            : ""}
          По вопросам согласования — отдел сервиса.
        </Text>

        {/* ---- Signatures pinned to bottom of last page ---- */}
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
