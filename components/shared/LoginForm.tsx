"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions/login";
import { Alert, Button, Card, Input } from "@/components/ui";

interface Props {
  /** Провайдеры с настроенным client_id — только для них рендерятся кнопки. */
  oauthProviders: ReadonlyArray<"yandex" | "vk">;
  /** Код ошибки из ?oauth_error= после неудачного callback. */
  oauthError?: string | null;
}

const OAUTH_ERRORS: Record<string, string> = {
  state_mismatch: "Сессия входа устарела. Попробуйте ещё раз.",
  exchange_failed: "Провайдер не подтвердил вход. Попробуйте ещё раз.",
  account_blocked: "Учётная запись не может выполнить вход.",
  not_configured: "Этот способ входа временно недоступен.",
  unknown_provider: "Неизвестный способ входа.",
};

/* Бренд-глифы — как в FloatingButtons, инлайновые SVG. */
const YandexIcon = (
  <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="12" fill="#FC3F1D" />
    <path
      d="M13.32 7.03h-1.21c-2.02 0-3.06 1.02-3.06 2.53 0 1.7.72 2.5 2.21 3.51l1.23.83-3.53 5.28H6.32l3.17-4.72c-1.82-1.3-2.85-2.57-2.85-4.72 0-2.69 1.87-4.52 5.43-4.52h3.53v13.95h-2.28V7.03z"
      fill="#fff"
    />
  </svg>
);

const VkIcon = (
  <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
    <rect width="24" height="24" rx="5" fill="#0077FF" />
    <path
      d="M12.78 17.28c-4.63 0-7.27-3.17-7.38-8.45h2.32c.08 3.88 1.79 5.52 3.14 5.86V8.83h2.19v3.34c1.34-.14 2.74-1.66 3.21-3.34h2.19c-.36 2.07-1.89 3.59-2.97 4.22 1.08.51 2.82 1.83 3.48 4.23h-2.41c-.52-1.61-1.8-2.86-3.5-3.03v3.03h-.27z"
      fill="#fff"
    />
  </svg>
);

const OAUTH_BUTTONS: Record<"yandex" | "vk", { label: string; icon: React.ReactNode }> = {
  yandex: { label: "Войти с Яндекс ID", icon: YandexIcon },
  vk: { label: "Войти через VK ID", icon: VkIcon },
};

export function LoginForm({ oauthProviders, oauthError }: Props): React.ReactElement {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const oauthMessage = oauthError ? (OAUTH_ERRORS[oauthError] ?? OAUTH_ERRORS.exchange_failed) : null;

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
        {!state?.error && oauthMessage ? <Alert variant="error">{oauthMessage}</Alert> : null}

        <Input
          label="Email или телефон"
          id="identifier"
          name="identifier"
          type="text"
          required
          placeholder="your@email.com или +79991234567"
          autoComplete="username"
          helperText="Войдите по любому из контактов, указанных при регистрации."
        />

        <Input
          label="Пароль"
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="Введите пароль"
          autoComplete="current-password"
        />

        <Button type="submit" isLoading={isPending} className="w-full">
          {isPending ? "Вход..." : "Войти"}
        </Button>

        <div className="text-center">
          <Link href="/reset-password" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
            Забыли пароль?
          </Link>
        </div>
      </form>

      {oauthProviders.length > 0 ? (
        <div className="mt-6 border-t border-[var(--border)] pt-5">
          <p className="mb-3 text-center text-sm text-[var(--foreground-muted)]">или войдите через</p>
          <div className="flex flex-col gap-2">
            {oauthProviders.map((p) => (
              <a
                key={p}
                href={`/api/auth/oauth/${p}`}
                className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--color-accent)]"
              >
                {OAUTH_BUTTONS[p].icon}
                {OAUTH_BUTTONS[p].label}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
