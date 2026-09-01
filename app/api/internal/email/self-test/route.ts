import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { sendEmail } from "@/lib/email/send";
import {
  checkOutboundReachability,
  FOREIGN_PROBE_HOSTS,
  PROBE_PORTS,
  sendSelfTestLetter,
} from "@/lib/email/self-test";

export const dynamic = "force-dynamic";

/**
 * Внутренняя проверка исходящей почты. Отвечает на единственный вопрос:
 * выпускает ли сеть приложения соединение с почтовым сервером и принимает ли
 * тот наши доступы. Письмо НЕ отправляется.
 *
 * Дверь машинная, как у mail-sync, и защищена тем же секретом: проверку надо
 * уметь запускать без человека в браузере — после смены конфига, переезда или
 * правки файрвола. Ответ — только класс исхода, хост и порт: ни доступов, ни
 * сырого текста ошибки.
 */

function bearerMatches(presented: string, secret: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.MAIL_SYNC_CRON_SECRET ?? "";
  if (secret.length === 0) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const authorization = request.headers.get("authorization") ?? "";
  const presented = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!presented || !bearerMatches(presented, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Необязательный порт в теле: {"port": 587}. Хост подменить нельзя — только
  // настроенный, и только из списка почтовых портов.
  let portOverride: number | undefined;
  let hostOverride: string | undefined;
  let doSend = false;
  try {
    const body = (await request.json()) as { port?: unknown; host?: unknown; send?: unknown };
    doSend = body?.send === true;
    if (typeof body?.port === "number" && PROBE_PORTS.includes(body.port)) {
      portOverride = body.port;
    }
    // Чужой хост — только из закрытого списка и только без авторизации.
    if (typeof body?.host === "string" && FOREIGN_PROBE_HOSTS.includes(body.host)) {
      hostOverride = body.host;
    }
  } catch {
    // Пустое тело — обычный случай: проверяем настроенный хост и порт.
  }

  // {"send": true} — настоящая отправка на СВОЙ ящик. Адресата в запросе нет
  // и быть не может: см. комментарий у sendSelfTestLetter.
  if (doSend) {
    const sent = await sendSelfTestLetter(async (message) => {
      const r = await sendEmail({
        to: message.to,
        subject: message.subject,
        // html обязателен по контракту отправки; тело служебное, без разметки.
        html: `<p>${message.text.replace(/\n/g, "<br>")}</p>`,
        text: message.text,
      });
      return r.success
        ? { success: true, messageId: r.messageId ?? null, error: null }
        : { success: false, messageId: null, error: r.error };
    });
    return NextResponse.json(sent, { status: sent.accepted ? 200 : 502 });
  }

  const result = await checkOutboundReachability({ portOverride, hostOverride });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
