export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  revokePersonalTelegramLink,
  updateOwnStaffNotificationOptOuts,
} from "@/app/actions/staff-notifications";
import { TelegramLinkPanel } from "@/components/admin/notifications/TelegramLinkPanel";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { Card, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { rolePermissions } from "@/lib/authz";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { LOCALES, TIME_ZONES } from "@/lib/profile-options";
import { roleLabel } from "@/lib/roles";
import { loadTelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config";
import { staffNotificationTypesForPermissions } from "@/lib/staff-notifications/preferences";
import {
  STAFF_NOTIFICATION_EVENT_CATALOG,
  type StaffNotificationType,
} from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";
import { formatDateTime } from "@/lib/utils";

interface PersonalDestinationStatus {
  id: string;
  verifiedAt: Date;
}

/**
 * Свой профиль — для любого, кто вошёл.
 *
 * Отдельный маршрут, а не страница внутри кабинета или админки: профиль есть у
 * всех, а кабинет открывают клиенты и только они. Дублировать одну и ту же
 * форму в двух разделах значило бы чинить её потом дважды.
 *
 * Роль показана, но не редактируется: то, что даёт доступ, меняет
 * администратор на своей странице. В одной форме с «поменять себе имя» это
 * было бы приглашением к повышению прав.
 */
export default async function ProfilePage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = (await db.user.findUnique({
    where: { id: session.id },
    select: {
      name: true,
      email: true,
      phone: true,
      timeZone: true,
      locale: true,
      permissionRole: true,
      createdAt: true,
    },
  })) as {
    name: string;
    email: string;
    phone: string;
    timeZone: string | null;
    locale: string | null;
    permissionRole: string;
    createdAt: Date;
  } | null;
  if (!user) redirect("/login");

  const isStaff = user.permissionRole !== "CLIENT" && user.permissionRole !== "NONE";
  const permissions =
    user.permissionRole === "ADMIN"
      ? new Set<string>(PERMISSIONS)
      : await rolePermissions(user.permissionRole);
  const availableNotificationTypes = staffNotificationTypesForPermissions(permissions);
  const notificationsAvailable = availableNotificationTypes.length > 0;
  const [optOutRows, telegramConfig, personalTelegram] = notificationsAvailable
    ? await Promise.all([
        db.staffNotificationOptOut.findMany({
          where: {
            tenantKey: TENANT_KEY,
            userId: session.id,
            eventType: { in: availableNotificationTypes },
          },
          select: { eventType: true },
        }) as Promise<Array<{ eventType: string }>>,
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
        }) as Promise<PersonalDestinationStatus | null>,
      ])
    : [[], null, null];
  const disabledNotificationTypes = new Set(
    optOutRows.map((row) => row.eventType),
  );

  return (
    <div className="mx-auto max-w-xl p-4 md:p-6">
      <PageHeader
        eyebrow="Профиль"
        title={user.name}
        description={`Роль: ${roleLabel(user.permissionRole)}`}
        actions={
          <Link href={isStaff ? "/admin" : "/cabinet"} className="back-link">
            ← {isStaff ? "В админку" : "В кабинет"}
          </Link>
        }
      />

      <ProfileForm
        initial={{
          name: user.name,
          email: user.email,
          phone: user.phone,
          timeZone: user.timeZone,
          locale: user.locale,
        }}
        timeZones={TIME_ZONES}
        locales={LOCALES}
      />

      {notificationsAvailable && telegramConfig ? (
        <div id="staff-notifications" className="mt-6 space-y-6 scroll-mt-4">
          <Card>
            <h2 className="text-base font-semibold">Личные уведомления</h2>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              Здесь показаны только категории, доступные вам по правам. Отключение может
              только сузить этот список и не выдаёт новых прав.
            </p>
            <form action={updateOwnStaffNotificationOptOuts} className="mt-4 space-y-4">
              <div className="space-y-3">
                {availableNotificationTypes.map((type: StaffNotificationType) => (
                  <label key={type} className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="enabledEventType"
                      value={type}
                      defaultChecked={!disabledNotificationTypes.has(type)}
                      className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                    />
                    <span>{STAFF_NOTIFICATION_EVENT_CATALOG[type].label}</span>
                  </label>
                ))}
              </div>
              <button type="submit" className="btn btn-primary text-sm">
                Сохранить уведомления
              </button>
            </form>
          </Card>

          <Card>
            <h2 className="text-base font-semibold">Куда приходят мои уведомления</h2>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              Личный Telegram получает только ваши разрешённые и включённые категории.
            </p>
            <div className="mt-4">
              {personalTelegram ? (
                <div className="space-y-3">
                  <p className="text-sm">
                    Telegram привязан {formatDateTime(personalTelegram.verifiedAt)}
                  </p>
                  <form action={revokePersonalTelegramLink}>
                    <button type="submit" className="btn btn-secondary text-sm">
                      Отвязать
                    </button>
                  </form>
                </div>
              ) : (
                <TelegramLinkPanel
                  purpose="PERSONAL"
                  configured={telegramConfig.enabled}
                />
              )}
            </div>
          </Card>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-[var(--foreground-muted)]">
        Пароль и роль здесь не меняются: пароль сбрасывается через вход, роль выдаёт администратор.
      </p>
    </div>
  );
}
