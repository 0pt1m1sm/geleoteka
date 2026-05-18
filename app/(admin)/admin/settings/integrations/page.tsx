export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { KNOWN_SETTINGS, type SettingDescriptor } from "@/lib/settings";
import { SettingGroupForm } from "@/components/admin/settings/SettingGroupForm";

/**
 * Integration secrets page — one card per integration (Resend / SMSC /
 * Yandex), single Save button per card. Source indicator on each field
 * shows whether the active value comes from DB, env var, or is missing.
 */
export default async function IntegrationsSettingsPage() {
  const session = await getSession();
  if (!session || session.permissionRole !== "ADMIN") {
    redirect("/login");
  }

  const rows = (await db.setting.findMany({
    where: { key: { in: KNOWN_SETTINGS.map((s) => s.key) } },
    select: { key: true, value: true },
  })) as Array<{ key: string; value: string }>;

  const dbKeys = new Set(rows.filter((r) => r.value).map((r) => r.key));

  // Group descriptors by `group` field, preserving definition order.
  const groups = new Map<string, SettingDescriptor[]>();
  for (const s of KNOWN_SETTINGS) {
    const list = groups.get(s.group) ?? [];
    list.push(s);
    groups.set(s.group, list);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Настройки"
        title="Интеграции"
        description="Секреты и креды для внешних сервисов. Изменения подхватываются всеми инстансами в течение 60 сек, без перезапуска. Пустое значение возвращает fallback на переменную окружения."
      />

      <div className="space-y-6 max-w-2xl">
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
            <SettingGroupForm key={groupName} groupName={groupName} fields={fields} />
          );
        })}
      </div>
    </div>
  );
}
