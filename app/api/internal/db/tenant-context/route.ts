import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Что база думает об арендаторе ЭТОГО соединения — и включена ли изоляция.
 *
 * Нужна ровно для одного момента, но момент важный: перед включением политик
 * надо знать, что приложение действительно передаёт `app.tenant_id`. Если не
 * передаёт, включение политик выключит сайт — забытая установка означает ноль
 * строк, и это правильно, но узнавать об этом на боевом сайте не надо.
 *
 * Дальше ручка остаётся полезной: после переезда, смены строки подключения или
 * непонятного «ничего не находится» она за секунду отвечает, кто виноват.
 *
 * Отдаёт только факты о настройке и политике: ни строки подключения, ни
 * доступов. Дверь машинная, тем же секретом, что у mail-sync.
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
  const presented = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!presented || !bearerMatches(presented, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [{ tenant_id, db_user, is_superuser }] = (await db.$queryRaw`
    select current_setting('app.tenant_id', true) as tenant_id,
           current_user::text as db_user,
           (select usesuper from pg_user where usename = current_user) as is_superuser
  `) as Array<{ tenant_id: string | null; db_user: string; is_superuser: boolean }>;

  // Сколько таблиц уже под политикой: до включения — ноль, после — все с
  // колонкой арендатора.
  const [{ protected_tables, forced_tables }] = (await db.$queryRaw`
    select count(*) filter (where relrowsecurity) as protected_tables,
           count(*) filter (where relforcerowsecurity) as forced_tables
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  `) as Array<{ protected_tables: bigint; forced_tables: bigint }>;

  return NextResponse.json({
    tenantId: tenant_id,
    dbUser: db_user,
    // Суперпользователь обходит политики целиком — если true, изоляция не
    // работает, чем бы ни были заполнены остальные поля.
    isSuperuser: is_superuser,
    protectedTables: Number(protected_tables),
    forcedTables: Number(forced_tables),
  });
}
