export const dynamic = "force-dynamic";

import Link from "next/link";
import { enabledOAuthProviders } from "@/lib/oauth";
import { LoginForm } from "@/components/shared/LoginForm";
import { NarrowFormPage } from "@/components/shared/NarrowFormPage";

interface PageProps {
  searchParams: Promise<{ oauth_error?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps): Promise<React.ReactElement> {
  const [providers, params] = await Promise.all([enabledOAuthProviders(), searchParams]);

  return (
    <NarrowFormPage
      title="Вход в личный кабинет"
      description={
        <>
          Ещё нет аккаунта?{" "}
          <Link href="/register" className="text-[var(--color-accent)] hover:underline">
            Зарегистрироваться
          </Link>
        </>
      }
    >
      <LoginForm oauthProviders={providers} oauthError={params.oauth_error ?? null} />
    </NarrowFormPage>
  );
}
