export const dynamic = "force-dynamic";

import Link from "next/link";
import { CheckCircle2, Link2Off } from "lucide-react";

import { Card } from "@/components/ui";
import { NarrowFormPage } from "@/components/shared/NarrowFormPage";
import { db } from "@/lib/db";
import {
  confirmEmailVerificationToken,
  type EmailVerificationDb,
} from "@/lib/email-verification/core";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps): Promise<React.ReactElement> {
  const query = await searchParams;
  const rawToken = typeof query.token === "string" ? query.token : "";
  const result = await confirmEmailVerificationToken(
    db as unknown as EmailVerificationDb,
    rawToken,
  );
  const confirmed = result.status === "confirmed";

  return (
    <NarrowFormPage
      title={confirmed ? "Email подтверждён" : "Ссылка недействительна"}
      description={
        confirmed
          ? "Спасибо — адрес электронной почты подтверждён."
          : "Ссылка уже использована, истекла или указана неверно."
      }
    >
      <Card className="text-center">
        <div className="mb-4 flex justify-center">
          {confirmed ? (
            <CheckCircle2
              size={40}
              className="text-[var(--color-success)]"
              aria-hidden
            />
          ) : (
            <Link2Off
              size={40}
              className="text-[var(--foreground-muted)]"
              aria-hidden
            />
          )}
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          {confirmed
            ? "Все функции сервиса были доступны и остаются доступны."
            : "В личном кабинете можно запросить новое письмо через несколько минут."}
        </p>
        <Link href="/cabinet" className="btn btn-primary mt-6 inline-flex">
          Перейти в личный кабинет
        </Link>
      </Card>
    </NarrowFormPage>
  );
}
