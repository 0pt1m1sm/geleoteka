import "server-only";

import { getSetting } from "@/lib/settings";
import { normalizeTransportName } from "@/lib/email/transport";

/**
 * Проверка исходящей почты БЕЗ отправки письма.
 *
 * Зачем отдельно от кнопки в админке: та отправляет реальное письмо и требует
 * живого админа в браузере. Здесь нужен другой ответ — «выпускает ли сеть
 * приложения исходящий SMTP и принимает ли сервер наши доступы», и его надо
 * получать машинно: после смены конфига, после переезда, после правки
 * файрвола. Соединение, поднятое с чужой машины, на этот вопрос не отвечает —
 * отвечает только соединение из самого приложения.
 *
 * Ничего не отправляет: `verify()` доходит до авторизации и кладёт трубку.
 * Поэтому вызов безопасно повторять сколько угодно.
 */

const DEFAULT_SMTP_HOST = "smtp.timeweb.ru";
const DEFAULT_SMTP_PORT = 465;
const VERIFY_TIMEOUT_MS = 15_000;

/** Классы исхода. Сырой текст ошибки наружу не отдаётся. */
export type ReachabilityCode =
  | "ok"
  | "not_configured"
  | "auth_failed"
  | "connect_failed"
  | "timeout"
  | "tls_failed"
  | "unknown_error"
  | "not_applicable";

export interface OutboundReachability {
  transport: "smtp" | "resend";
  /** Хост и порт — не секрет: это публичные имена инфраструктуры. */
  host: string | null;
  port: number | null;
  code: ReachabilityCode;
  ok: boolean;
}

interface VerifiableTransporter {
  verify(): Promise<unknown>;
}

export interface ReachabilityDeps {
  /** Подменяется в тестах; по умолчанию — nodemailer. */
  createTransporter?: (options: Record<string, unknown>) => Promise<VerifiableTransporter> | VerifiableTransporter;
}

/** Ошибку приводим к классу по коду nodemailer/сокета, а не по тексту. */
export function classifyVerifyError(err: unknown): ReachabilityCode {
  const e = err as { code?: string; responseCode?: number } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  if (code === "EAUTH" || e?.responseCode === 535 || e?.responseCode === 534) return "auth_failed";
  if (code === "ETIMEDOUT" || code === "ETIMEOUT") return "timeout";
  if (code === "ECONNECTION" || code === "ECONNREFUSED" || code === "EHOSTUNREACH" || code === "ENOTFOUND") {
    return "connect_failed";
  }
  if (code === "ESOCKET") return "tls_failed";
  if (code === "EDNS") return "connect_failed";
  return "unknown_error";
}

function parsePort(raw: string | null | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n > 0 && n < 65_536 ? n : DEFAULT_SMTP_PORT;
}

function parseBool(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === null || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return fallback;
}

async function defaultCreateTransporter(options: Record<string, unknown>): Promise<VerifiableTransporter> {
  const nodemailer = (await import("nodemailer")).default;
  return (nodemailer.createTransport as unknown as (o: Record<string, unknown>) => VerifiableTransporter)(options);
}

export async function checkOutboundReachability(deps: ReachabilityDeps = {}): Promise<OutboundReachability> {
  const transport = normalizeTransportName(await getSetting("EMAIL_TRANSPORT"));

  // Для Resend проверять нечего: это HTTPS-запрос к чужому API, и его
  // доступность не говорит о нашем SMTP. Отвечаем честным «не применимо».
  if (transport === "resend") {
    return { transport, host: null, port: null, code: "not_applicable", ok: false };
  }

  const [hostRaw, portRaw, secureRaw, userRaw] = await Promise.all([
    getSetting("SMTP_HOST"),
    getSetting("SMTP_PORT"),
    getSetting("SMTP_SECURE"),
    getSetting("SMTP_USER"),
  ]);
  const user = userRaw?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  if (!user || !pass) {
    return { transport, host: null, port: null, code: "not_configured", ok: false };
  }

  const host = hostRaw?.trim() || DEFAULT_SMTP_HOST;
  const port = parsePort(portRaw);
  const secure = secureRaw === undefined || secureRaw === null ? port === 465 : parseBool(secureRaw, port === 465);

  const make = deps.createTransporter ?? defaultCreateTransporter;
  try {
    const transporter = await make({
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: { user, pass },
      connectionTimeout: VERIFY_TIMEOUT_MS,
      greetingTimeout: VERIFY_TIMEOUT_MS,
      socketTimeout: VERIFY_TIMEOUT_MS,
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2", servername: host },
    });
    await transporter.verify();
    return { transport, host, port, code: "ok", ok: true };
  } catch (err) {
    return { transport, host, port, code: classifyVerifyError(err), ok: false };
  }
}
