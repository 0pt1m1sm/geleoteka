"use client";

import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui";
import { sendTestEmail, type TestSendResult } from "@/app/actions/settings";

export function TestSendButton(): React.ReactElement {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestSendResult | null>(null);

  function handleClick(): void {
    setResult(null);
    startTransition(async () => {
      const r = await sendTestEmail();
      setResult(r);
    });
  }

  const sourceLabel =
    result?.credentialSource === "db"
      ? "из админки"
      : result?.credentialSource === "env"
        ? "из переменной окружения"
        : "не задан";
  const transportLabel = result?.transport === "resend" ? "Resend (legacy)" : "SMTP";

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" onClick={handleClick} isLoading={pending} disabled={pending}>
        Отправить тестовое письмо себе
      </Button>
      {result ? (
        <Alert variant={result.ok ? "success" : "error"}>
          <div className="space-y-1">
            <p>{result.detail}</p>
            {result.from || result.to || result.transport || result.credentialSource ? (
              <p className="text-xs text-[var(--foreground-muted)] mt-2">
                {result.to ? <>Кому: <span className="font-mono">{result.to}</span><br/></> : null}
                {result.from ? <>От: <span className="font-mono">{result.from}</span><br/></> : null}
                {result.transport ? <>Транспорт: {transportLabel}<br/></> : null}
                {result.credentialSource ? <>Учётные данные: {sourceLabel}</> : null}
              </p>
            ) : null}
          </div>
        </Alert>
      ) : null}
    </div>
  );
}
