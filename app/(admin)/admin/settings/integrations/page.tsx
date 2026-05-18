export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { KNOWN_SETTINGS } from "@/lib/settings";
import { SettingForm } from "@/components/admin/settings/SettingForm";

/**
 * Integration secrets page. Each row in `KNOWN_SETTINGS` renders a card
 * with a form. Source indicator (db / env / none) tells the admin where
 * the active value is coming from right now.
 */
export default async function IntegrationsSettingsPage() {
  const session = await getSession();
  if (!session || session.permissionRole !== "ADMIN") {
    redirect("/login");
  }

  const rows = (await db.setting.findMany({
    where: { key: { in: KNOWN_SETTINGS.map((s) => s.key) } },
    select: { key: true, value: true, updatedAt: true },
  })) as Array<{ key: string; value: string; updatedAt: Date }>;

  const byKey = new Map(rows.map((r) => [r.key, r]));

  return (
    <div>
      <PageHeader
        eyebrow="Настройки"
        title="Интеграции"
        description="Секреты и креды для внешних сервисов. Изменения подхватываются всеми инстансами в течение 60 сек, без перезапуска."
      />

      <div className="space-y-8 max-w-2xl">
        {Array.from(
          KNOWN_SETTINGS.reduce((acc, s) => {
            const list = acc.get(s.group) ?? [];
            list.push(s);
            acc.set(s.group, list);
            return acc;
          }, new Map<string, typeof KNOWN_SETTINGS[number][]>()).entries(),
        ).map(([groupName, items]) => (
          <section key={groupName} className="space-y-3">
            <h2 className="text-sm uppercase tracking-wider text-[var(--foreground-muted)] font-semibold">
              {groupName}
            </h2>
            {items.map((s) => {
              const dbRow = byKey.get(s.key);
              const hasDb = Boolean(dbRow?.value);
              const envName = s.envFallback ?? s.key;
              const hasEnv = Boolean(process.env[envName]?.trim());
              const source: "db" | "env" | "none" = hasDb ? "db" : hasEnv ? "env" : "none";
              return (
                <SettingForm
                  key={s.key}
                  settingKey={s.key}
                  label={s.label}
                  description={s.description}
                  secret={s.secret}
                  source={source}
                />
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
