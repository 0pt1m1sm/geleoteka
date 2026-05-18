import { formatPrice } from "@/lib/utils";
import { wrapEmail, type WrapEmailResult } from "./_layout";

export interface PartOrderItem {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface PartOrderConfirmationInput {
  customerName: string;
  orderId: string;
  items: PartOrderItem[];
  total: number;
  contactPhone: string;
  /** Only present for logged-in customers; guests can't reach the cabinet via a deep link in this iteration. */
  cabinetUrl?: string;
}

export interface PartOrderConfirmationOutput extends WrapEmailResult {
  subject: string;
}

const MAX_VISIBLE_ITEMS = 20;

function renderItemRow(item: PartOrderItem): string {
  return `<tr>
    <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;font-size:14px">${item.name}</td>
    <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;font-size:14px;text-align:right;white-space:nowrap">${item.qty}</td>
    <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;font-size:14px;text-align:right;white-space:nowrap">${formatPrice(item.unitPrice)}</td>
    <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;font-size:14px;text-align:right;white-space:nowrap;font-weight:600">${formatPrice(item.total)}</td>
  </tr>`;
}

export function renderPartOrderConfirmation(
  input: PartOrderConfirmationInput,
): PartOrderConfirmationOutput {
  const shortId = input.orderId.slice(-6).toUpperCase();
  const subject = `Geleoteka — заказ запчастей №${shortId} принят`;
  const visible = input.items.slice(0, MAX_VISIBLE_ITEMS);
  const overflow = input.items.length - visible.length;

  const tableRows = visible.map(renderItemRow).join("");
  const overflowRow = overflow > 0
    ? `<tr><td colspan="4" style="padding:12px 4px;font-size:13px;color:#6b6b6b;font-style:italic">и ещё ${overflow} ${overflowPluralRu(overflow)}${input.cabinetUrl ? ` — <a href="${input.cabinetUrl}" style="color:#1a1a1a;text-decoration:underline">см. в личном кабинете</a>` : " — см. в личном кабинете"}</td></tr>`
    : "";

  const tableHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <thead>
      <tr>
        <th style="padding:8px 4px;border-bottom:2px solid #e6e6e6;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b6b6b">Наименование</th>
        <th style="padding:8px 4px;border-bottom:2px solid #e6e6e6;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b6b6b">Кол-во</th>
        <th style="padding:8px 4px;border-bottom:2px solid #e6e6e6;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b6b6b">Цена</th>
        <th style="padding:8px 4px;border-bottom:2px solid #e6e6e6;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b6b6b">Сумма</th>
      </tr>
    </thead>
    <tbody>${tableRows}${overflowRow}</tbody>
  </table>`;

  const cta = input.cabinetUrl
    ? { label: "Смотреть в личном кабинете", href: input.cabinetUrl }
    : undefined;

  const { html, text } = wrapEmail({
    previewText: `Заказ запчастей №${shortId} на ${formatPrice(input.total)} принят.`,
    sections: [
      {
        body: `Здравствуйте, ${input.customerName}!<br><br>Заказ запчастей <b>№${shortId}</b> принят. Мы свяжемся для уточнения сроков и оплаты по телефону <b>${input.contactPhone}</b>.`,
      },
      {
        heading: "Состав заказа",
        body: tableHtml,
      },
      {
        body: `<div style="text-align:right;font-size:18px;font-weight:700">Итого: <span style="color:#d4af37">${formatPrice(input.total)}</span></div>`,
        cta,
      },
    ],
  });

  return { subject, html, text };
}

function overflowPluralRu(n: number): string {
  const lastTwo = n % 100;
  const lastOne = n % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "позиций";
  if (lastOne === 1) return "позиция";
  if (lastOne >= 2 && lastOne <= 4) return "позиции";
  return "позиций";
}
