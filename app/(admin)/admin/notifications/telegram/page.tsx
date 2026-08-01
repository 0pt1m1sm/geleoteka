export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  revokePersonalTelegramLink,
  revokeSharedTelegramLink,
} from "@/app/actions/staff-notifications";
import { TelegramLinkPanel } from "@/components/admin/notifications/TelegramLinkPanel";
import { Card, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { roleHasPermission } from "@/lib/authz";
import { db } from "@/lib/db";
import { loadTelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config";
import { TENANT_KEY } from "@/lib/tenant";
import { formatDateTime } from "@/lib/utils";

interface DestinationStatus {
  id: string;
  verifiedAt: Date;
}

export default async function TelegramNotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await roleHasPermission(session.permissionRole, "notifications.view"))) redirect("/");

  const canManage = await roleHasPermission(
    session.permissionRole,
    "notifications.manage",
  );
  const [config, personal, shared] = await Promise.all([
    loadTelegramRuntimeConfig(),
    db.telegramDestination.findFirst({
      where: {
        tenantKey: TENANT_KEY,
        kind: "PERSONAL",
        userId: session.id,
        isActive: true,
        disabledAt: null,
      },
      select: { id: true, verifiedAt: true },
    }) as Promise<DestinationStatus | null>,
    canManage
      ? (db.telegramDestination.findFirst({
          where: {
            tenantKey: TENANT_KEY,
            kind: "SHARED",
            userId: null,
            isActive: true,
            disabledAt: null,
          },
          orderBy: { verifiedAt: "desc" },
          select: { id: true, verifiedAt: true },
        }) as Promise<DestinationStatus | null>)
      : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Уведомления · Telegram"
        title="Привязка Telegram"
        description="chat_id приходит только от проверенного webhook и никогда не показывается в интерфейсе."
        actions={
          <Link href="/admin/notifications" className="btn btn-secondary text-sm">
            Вернуться к ленте
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-semibold">Личные уведомления</h2>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            Событие назначенной сделки отправляется лично её владельцу, если привязка активна.
          </p>
          <div className="mt-4">
            {personal ? (
              <div className="space-y-3">
                <p className="text-sm">Привязано {formatDateTime(personal.verifiedAt)}</p>
                <form action={revokePersonalTelegramLink}>
                  <button type="submit" className="btn btn-secondary text-sm">
                    Отвязать
                  </button>
                </form>
              </div>
            ) : (
              <TelegramLinkPanel purpose="PERSONAL" configured={config.enabled} />
            )}
          </div>
        </Card>

        {canManage ? (
          <Card>
            <h2 className="text-base font-semibold">Общий служебный fallback</h2>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              Используется только для событий без подходящего владельца. Ссылку нужно открыть из приватного служебного Telegram-аккаунта.
            </p>
            <div className="mt-4">
              {shared ? (
                <div className="space-y-3">
                  <p className="text-sm">Привязано {formatDateTime(shared.verifiedAt)}</p>
                  <form action={revokeSharedTelegramLink}>
                    <button type="submit" className="btn btn-secondary text-sm">
                      Отвязать
                    </button>
                  </form>
                </div>
              ) : (
                <TelegramLinkPanel purpose="SHARED" configured={config.enabled} />
              )}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

