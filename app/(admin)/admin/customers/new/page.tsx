export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { CustomerCreateForm } from "@/components/admin/customers/CustomerCreateForm";
import { REFERRAL_SOURCE_KEYS } from "@/lib/crm-labels";

interface Props {
  searchParams: Promise<{
    email?: string;
    name?: string;
    phone?: string;
    source?: string;
  }>;
}

function pickString(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickReferralSource(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return REFERRAL_SOURCE_KEYS.includes(value) ? value : undefined;
}

export default async function NewCustomerPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const sp = await searchParams;

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Новый клиент"
        description="Ручное создание клиента — например, при звонке без онлайн-записи"
        actions={
          <Link href="/admin/customers" className="btn btn-secondary">
            ← Назад к списку
          </Link>
        }
      />
      <CustomerCreateForm
        defaultName={pickString(sp.name, 120)}
        defaultEmail={pickString(sp.email, 254)}
        defaultPhone={pickString(sp.phone, 32)}
        defaultReferralSource={pickReferralSource(sp.source)}
      />
    </div>
  );
}
