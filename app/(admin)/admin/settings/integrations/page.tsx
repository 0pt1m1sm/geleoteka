export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { KNOWN_SETTINGS, type SettingDescriptor } from "@/lib/settings";
import { SettingGroupForm } from "@/components/admin/settings/SettingGroupForm";
import { TestSendButton } from "@/components/admin/settings/TestSendButton";

/**
 * Integration secrets page — one card per integration (Resend / SMSC /
 * Yandex), single Save button per card. Source indicator on each field
 * shows whether the active value comes from DB, env var, or is missing.
 *
 * The Resend card also surfaces the webhook URL the operator must paste
 * into Resend's dashboard (read-only with copy button).
 */
export default async function IntegrationsSettingsPage() {
  const session = await getSession();
  if (!session || session.permissionRole !== "ADMIN") {
    redirect("/login");
  }

  const visibleSettings = KNOWN_SETTINGS.filter((setting) => setting.visibleInUi !== false);

  const rows = (await db.setting.findMany({
    where: { key: { in: visibleSettings.map((s) => s.key) } },
    select: { key: true, value: true },
  })) as Array<{ key: string; value: string }>;

  const dbKeys = new Set(rows.filter((r) => r.value).map((r) => r.key));

  // Group descriptors by `group` field, preserving definition order.
  const groups = new Map<string, SettingDescriptor[]>();
  for (const s of visibleSettings) {
    const list = groups.get(s.group) ?? [];
    list.push(s);
    groups.set(s.group, list);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";
  const inboundWebhookUrl = `${appUrl.replace(/\/$/, "")}/api/email/inbound`;

  // Per-group static info rows. Currently only Email (Resend) has one —
  // the webhook URL operator must paste into the Resend dashboard.
  const groupInfo: Record<string, Array<{ label: string; value: string; copyable?: boolean }>> = {
    "Email (Resend)": [
      {
        label: "URL для Resend webhooks (вставьте в Resend dashboard → Webhooks)",
        value: inboundWebhookUrl,
        copyable: true,
      },
    ],
  };

  return (
    <div>
      <PageHeader
        eyebrow="Настройки"
        title="Интеграции"
        description="Секреты и креды для внешних сервисов. Изменения подхватываются всеми инстансами в течение 60 сек, без перезапуска. Пустое значение возвращает fallback на переменную окружения."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {Array.from(groups.entries()).map(([groupName, descriptors]) => {
          const fields = descriptors.map((s) => {
            const envName = s.envFallback ?? s.key;
            const source: "db" | "env" | "none" = dbKeys.has(s.key)
              ? "db"
              : process.env[envName]?.trim()
                ? "env"
                : "none";
            return { descriptor: s, source };
          });
          return (
            <div key={groupName} className="space-y-3">
              <SettingGroupForm
                groupName={groupName}
                fields={fields}
                infoRows={groupInfo[groupName]}
              />
              {groupName === "Email (Resend)" ? (
                <div className="card">
                  <h3 className="text-sm font-semibold mb-2">Диагностика</h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">
                    Отправит письмо на email вашего админ-аккаунта через текущие настройки Resend.
                    Покажет какой API key/from использовался и что ответил Resend.
                  </p>
                  <TestSendButton />
                  <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <Link
                      href="/admin/settings/mail-sync"
                      className="text-[var(--color-accent)] hover:underline"
                    >
                      Синхронизация почты (IMAP) →
                    </Link>
                    <Link
                      href="/admin/settings/inbound-log"
                      className="text-[var(--color-accent)] hover:underline"
                    >
                      Лог входящих webhook-ов (Resend) →
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
