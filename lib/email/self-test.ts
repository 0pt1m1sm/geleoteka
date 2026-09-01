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

export interface SelfSendResult {
  /** Приняло ли отправку соединение с сервером. */
  accepted: boolean;
  /** Кому ушло — всегда свой же ящик, см. `sendSelfTestLetter`. */
  to: string | null;
  /** Идентификатор письма от сервера, если он его вернул. */
  messageId: string | null;
  /** Класс исхода: ok | not_configured | rejected | unknown. */
  code: string;
}

export interface OutboundReachability {
  transport: "smtp" | "resend";
  /** Хост и порт — не секрет: это публичные имена инфраструктуры. */
  host: string | null;
  port: number | null;
  code: ReachabilityCode;
  ok: boolean;
  /**
   * Проверялась ли авторизация. Для СВОЕГО сервера — да. Для чужого — нет и
   * быть не может: авторизация означала бы отправку нашего пароля на чужой
   * сервер, то есть утечку доступов ради диагностики. У чужого хоста успех
   * означает ровно «сеть выпускает SMTP на этот порт», не более.
   */
  authenticated: boolean;
}

interface VerifiableTransporter {
  verify(): Promise<unknown>;
}

export interface ReachabilityDeps {
  /** Подменяется в тестах; по умолчанию — nodemailer. */
  createTransporter?: (options: Record<string, unknown>) => Promise<VerifiableTransporter> | VerifiableTransporter;
  /**
   * Проверить другой порт вместо настроенного. Нужно, когда провайдер режет
   * один порт и пропускает другой: 465 может молчать, а 587 работать, и это
   * выясняется пробой, а не догадкой.
   *
   * ХОСТ подменить нельзя намеренно: иначе внутренняя ручка превратилась бы в
   * сканер чужих портов нашими руками. Порт — только из списка почтовых.
   */
  portOverride?: number;
  /**
   * Проверить достижимость чужого почтового сервера из `FOREIGN_PROBE_HOSTS`.
   * Соединение идёт БЕЗ авторизации — см. поле `authenticated` в ответе.
   */
  hostOverride?: string;
}

/** Порты, на которые вообще имеет смысл стучаться почтой. */
export const PROBE_PORTS: readonly number[] = [465, 587, 2525, 25];

/**
 * Чужие почтовые хосты, до которых разрешено проверять достижимость.
 *
 * Нужно, чтобы различить два разных диагноза: «хостинг режет исходящий SMTP
 * вообще» и «не проходит только до нашего почтового сервера». Лечатся они
 * по-разному, а по одному своему хосту их не отличить.
 *
 * Список закрытый и короткий: это диагностика, а не сканер чужих портов.
 */
export const FOREIGN_PROBE_HOSTS: readonly string[] = [
  "smtp.gmail.com",
  "smtp.yandex.ru",
  "smtp.mail.ru",
];

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
  //
  // НО только когда проба не запрошена явно. Вопрос «выпускает ли сеть
  // исходящий SMTP» от выбранного транспорта не зависит: именно его и надо
  // выяснять, СИДЯ на Resend, — чтобы понять, есть ли куда уходить. Первая
  // версия замыкалась здесь всегда и на любую пробу отвечала «не применимо»,
  // то есть молчала ровно в том случае, ради которого делалась.
  const probeRequested = deps.hostOverride !== undefined || deps.portOverride !== undefined;
  if (transport === "resend" && !probeRequested) {
    return { transport, host: null, port: null, code: "not_applicable", ok: false, authenticated: false };
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
    return { transport, host: null, port: null, code: "not_configured", ok: false, authenticated: false };
  }

  const configuredHost = hostRaw?.trim() || DEFAULT_SMTP_HOST;
  const foreign = deps.hostOverride;
  if (foreign !== undefined && !FOREIGN_PROBE_HOSTS.includes(foreign)) {
    return { transport, host: null, port: null, code: "not_applicable", ok: false, authenticated: false };
  }
  const host = foreign ?? configuredHost;
  const configuredPort = parsePort(portRaw);
  const override = deps.portOverride;
  if (override !== undefined && !PROBE_PORTS.includes(override)) {
    return { transport, host, port: null, code: "not_applicable", ok: false, authenticated: false };
  }
  const port = override ?? configuredPort;
  // Неявный TLS только на 465; на прочих портах соединение начинается открытым
  // и обязано подняться через STARTTLS — иначе доступы ушли бы по чистому
  // каналу. Настройка secure учитывается лишь для настроенного порта: у пробы
  // режим определяет сам порт.
  const secure =
    override !== undefined
      ? override === 465
      : secureRaw === undefined || secureRaw === null
        ? port === 465
        : parseBool(secureRaw, port === 465);

  const make = deps.createTransporter ?? defaultCreateTransporter;
  // Доступы уходят ТОЛЬКО на свой сервер. На чужом проверяется достижимость —
  // соединение и приветствие, без AUTH: иначе наш пароль оказался бы у третьей
  // стороны ради диагностики.
  const authenticated = foreign === undefined;
  try {
    const transporter = await make({
      host,
      port,
      secure,
      requireTLS: !secure,
      ...(authenticated ? { auth: { user, pass } } : {}),
      connectionTimeout: VERIFY_TIMEOUT_MS,
      greetingTimeout: VERIFY_TIMEOUT_MS,
      socketTimeout: VERIFY_TIMEOUT_MS,
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2", servername: host },
    });
    await transporter.verify();
    return { transport, host, port, code: "ok", ok: true, authenticated };
  } catch (err) {
    const code = classifyVerifyError(err);
    // Для чужого хоста отказ авторизации — успех проверки достижимости: раз
    // сервер дошёл до отказа, соединение состоялось.
    if (!authenticated && code === "auth_failed") {
      return { transport, host, port, code: "ok", ok: true, authenticated };
    }
    return { transport, host, port, code, ok: false, authenticated };
  }
}

/**
 * Отправка диагностического письма САМИМ ПРИЛОЖЕНИЕМ.
 *
 * Достижимость и авторизация ещё не означают доставку: сервер может пускать
 * нас и всё равно отклонять письмо. Проверяется это только настоящей отправкой.
 *
 * Получателя выбрать НЕЛЬЗЯ — письмо всегда уходит на собственный ящик
 * отправки (`SMTP_USER`). Это намеренно: ручка с произвольным адресатом за
 * общим секретом стала бы отправлялкой чужой почты с нашего домена.
 *
 * Письмо приходит на наш же ящик, откуда его забирает почтовый синхронизатор —
 * то есть доставка подтверждается не обещанием сервера, а появлением письма.
 */
export async function sendSelfTestLetter(
  send: (message: {
    to: string;
    subject: string;
    text: string;
  }) => Promise<{ success: boolean; messageId?: string | null; error?: string | null }>,
): Promise<SelfSendResult> {
  const to = (await getSetting("SMTP_USER"))?.trim() ?? null;
  if (!to) {
    return { accepted: false, to: null, messageId: null, code: "not_configured" };
  }
  const stamp = new Date().toISOString();
  const res = await send({
    to,
    subject: `Проверка отправки — ${stamp}`,
    text:
      "Это служебное письмо проверяет, что отправка почты из приложения работает.\n" +
      `Отправлено: ${stamp}\n` +
      "Отвечать на него не нужно.",
  });
  return {
    accepted: res.success,
    to,
    messageId: res.messageId ?? null,
    code: res.success ? "ok" : res.error ? "rejected" : "unknown",
  };
}
