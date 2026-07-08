"use client";

import { useActionState } from "react";
import { completeOAuthRegistrationAction } from "@/app/actions/oauth-complete";
import { NarrowFormPage } from "@/components/shared/NarrowFormPage";
import { Alert, Button, Card, Input } from "@/components/ui";

interface Props {
  providerLabel: string;
  name: string;
  knownEmail: string | null;
  knownPhone: string | null;
}

export function OAuthCompleteForm({ providerLabel, name, knownEmail, knownPhone }: Props): React.ReactElement {
  const [state, formAction, isPending] = useActionState(completeOAuthRegistrationAction, null);

  return (
    <NarrowFormPage
      title="Почти готово"
      description={`Вход через ${providerLabel} подтверждён. Осталось дополнить профиль.`}
    >
      <Card>
        <form action={formAction} className="space-y-4">
          {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

          <Input
            label="Имя"
            id="name"
            name="name"
            type="text"
            required
            defaultValue={name}
            autoComplete="name"
          />

          {knownEmail ? null : (
            <Input
              label="Email"
              id="email"
              name="email"
              type="email"
              required
              placeholder="your@email.com"
              autoComplete="email"
              helperText="Нужен для уведомлений о заказах и сметах."
            />
          )}

          {knownPhone ? null : (
            <Input
              label="Телефон"
              id="phone"
              name="phone"
              type="tel"
              required
              placeholder="+79991234567"
              autoComplete="tel"
              helperText="Российский номер — используется для входа и SMS о статусе работ."
            />
          )}

          <Button type="submit" isLoading={isPending} className="w-full">
            {isPending ? "Создание..." : "Завершить регистрацию"}
          </Button>
        </form>
      </Card>
    </NarrowFormPage>
  );
}
