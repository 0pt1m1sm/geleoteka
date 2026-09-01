import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { checkOutboundReachability } from "@/lib/email/self-test";

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

  const result = await checkOutboundReachability();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
