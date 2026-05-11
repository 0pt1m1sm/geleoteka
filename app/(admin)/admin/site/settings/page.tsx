export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCMSText } from "@/lib/cms";
import { Card, PageHeader } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";

export default async function SiteSettingsPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (
    !session ||
    (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")
  ) {
    redirect("/login");
  }

  const gatewayUrl = await getCMSText("payments.gateway_url_template");

  return (
    <div>
      <PageHeader
        eyebrow="Сайт"
        title="Настройки"
        description="Общие настройки публичной части и интеграций. Изменения применяются сразу после сохранения."
      />
      <Card>
        <h2 className="font-semibold mb-1">Платёжный шлюз</h2>
        <p className="text-xs text-[var(--foreground-muted)] mb-4">
          URL, по которому клиент попадает с QR-кода смет. Поддерживает
          плейсхолдеры <code>{"{estimateId}"}</code> и <code>{"{number}"}</code>.
          Оставьте пустым, чтобы скрыть QR на PDF-смете.
        </p>
        <SettingsForm initialGatewayUrl={gatewayUrl} />
      </Card>
    </div>
  );
}
