export interface EmailSection {
  /** Optional uppercase heading rendered above the body. */
  heading?: string;
  /** Body HTML — already-safe markup (templates control their own output). */
  body: string;
  /** Optional primary CTA rendered as a gold button below the body. */
  cta?: { label: string; href: string };
}

export interface WrapEmailInput {
  /** Short preview text shown in inbox listings (Gmail / iOS). */
  previewText: string;
  sections: EmailSection[];
}

export interface WrapEmailResult {
  html: string;
  text: string;
}

const BRAND_GOLD = "#d4af37";
const INK = "#1a1a1a";
const INK_MUTED = "#6b6b6b";
const BORDER = "#e6e6e6";
// Footer keeps brand identity + legal note only. Per-template body sections
// already include the operator-configured address + phone where the user
// needs them (booking, rental). Avoiding hardcoded address here prevents
// stale info from leaking to every email.
const FOOTER_TEXT = "Geleoteka · специализированный сервис Mercedes-Benz G-Class";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds the outer HTML + plain-text envelope for every transactional
 * email. Pure string templating — no JSX, no inline images, no external
 * stylesheets. Table-based layout for Outlook compatibility.
 */
export function wrapEmail(input: WrapEmailInput): WrapEmailResult {
  const sectionsHtml = input.sections
    .map((section) => {
      const headingHtml = section.heading
        ? `<div style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:${INK_MUTED};margin-bottom:8px">${escapeHtml(section.heading)}</div>`
        : "";
      const ctaHtml = section.cta
        ? `<div style="margin-top:16px"><a href="${encodeURI(section.cta.href)}" style="display:inline-block;background:${BRAND_GOLD};color:${INK};padding:12px 24px;border-radius:2px;text-decoration:none;font-weight:600;font-size:14px">${escapeHtml(section.cta.label)}</a></div>`
        : "";
      return `<div style="margin-bottom:24px">${headingHtml}<div style="font-size:15px;line-height:1.55;color:${INK}">${section.body}</div>${ctaHtml}</div>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Geleoteka</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4">
  <tr>
    <td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:4px;overflow:hidden">
        <tr>
          <td style="background:${INK};padding:20px 32px">
            <div style="color:${BRAND_GOLD};font-size:22px;font-weight:700;letter-spacing:6px">GELEOTEKA</div>
            <div style="color:#bdbdbd;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">специализированный сервис Mercedes-Benz G-Class</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">${sectionsHtml}</td>
        </tr>
        <tr>
          <td style="background:#fafafa;border-top:1px solid ${BORDER};padding:20px 32px;color:${INK_MUTED};font-size:12px;line-height:1.5">
            Geleoteka · специализированный сервис Mercedes-Benz G-Class
            <div style="margin-top:8px">Это автоматическое уведомление по вашему обращению в Geleoteka.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = buildPlainText(input);
  return { html, text };
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildPlainText(input: WrapEmailInput): string {
  const lines: string[] = ["GELEOTEKA", ""];
  for (const section of input.sections) {
    if (section.heading) {
      lines.push(section.heading.toUpperCase());
      lines.push("");
    }
    lines.push(stripHtml(section.body));
    if (section.cta) {
      lines.push("");
      lines.push(`${section.cta.label}: ${section.cta.href}`);
    }
    lines.push("", "");
  }
  lines.push("—");
  lines.push(FOOTER_TEXT);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
