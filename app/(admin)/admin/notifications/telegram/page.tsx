export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  revokeSharedTelegramLink,
  setSharedTelegramDeliveryScope,
} from "@/app/actions/staff-notifications";
import { TelegramLinkPanel } from "@/components/admin/notifications/TelegramLinkPanel";
import { TelegramTestButton } from "@/components/admin/notifications/TelegramTestButton";
import { Alert, Card, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { roleHasPermission } from "@/lib/authz";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { loadTelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config";
import { TENANT_KEY } from "@/lib/tenant";
import { formatDateTime } from "@/lib/utils";

interface DestinationStatus {
  id: string;
  verifiedAt: Date;
  deliveryScope: string;
}

export default async function TelegramNotificationsPage() {
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await roleHasPermission(session.permissionRole, "notifications.manage"))) redirect("/");

  const [config, shared] = await Promise.all([
    loadTelegramRuntimeConfig(),
    db.telegramDestination.findFirst({
      where: {
        tenantKey: TENANT_KEY,
        kind: "SHARED",
        userId: null,
        isActive: true,
        disabledAt: null,
      },
      orderBy: { verifiedAt: "desc" },
      select: { id: true, verifiedAt: true, deliveryScope: true },
    }) as Promise<DestinationStatus | null>,
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Уведомления · Telegram"
        title="Общий получатель"
        description="chat_id приходит только от проверенного webhook и никогда не показывается в интерфейсе."
        actions={
          <Link href="/admin/notifications" className="btn btn-secondary text-sm">
            Вернуться к ленте
          </Link>
        }
      />

      <div className="max-w-2xl">
        <Card>
          <h2 className="text-base font-semibold">Общие уведомления</h2>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            Рабочая группа может получать только события без подходящего владельца или весь поток, не отменяя личные уведомления менеджеров.
          </p>
          <Alert variant="info" className="mt-4">
            В группе имя клиента и номер сделки увидят все участники — в том числе те, кого добавят позже.
          </Alert>
          <div className="mt-4">
            {shared ? (
              <div className="space-y-3">
                <p className="text-sm">Привязано {formatDateTime(shared.verifiedAt)}</p>
                <TelegramTestButton purpose="SHARED" />
                <form
                  action={setSharedTelegramDeliveryScope.bind(null, shared.id)}
                  className="space-y-2"
                >
                  <label htmlFor="telegram-delivery-scope" className="block text-sm font-medium">
                    Какие события отправлять
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      id="telegram-delivery-scope"
                      name="deliveryScope"
                      defaultValue={shared.deliveryScope}
                      className="input w-auto"
                    >
                      <option value="FALLBACK_ONLY">Только без подходящего владельца</option>
                      <option value="ALL_EVENTS">Все события</option>
                    </select>
                    <button type="submit" className="btn btn-primary text-sm">
                      Сохранить
                    </button>
                  </div>
                </form>
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
      </div>
    </div>
  );
}
