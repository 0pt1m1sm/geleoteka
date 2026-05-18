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
    result?.apiKeySource === "db"
      ? "из админки"
      : result?.apiKeySource === "env"
        ? "из переменной окружения"
        : "не задан";

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" onClick={handleClick} isLoading={pending} disabled={pending}>
        Отправить тестовое письмо себе
      </Button>
      {result ? (
        <Alert variant={result.ok ? "success" : "error"}>
          <div className="space-y-1">
            <p>{result.detail}</p>
            {result.from || result.to || result.apiKeySource ? (
              <p className="text-xs text-[var(--foreground-muted)] mt-2">
                {result.to ? <>Кому: <span className="font-mono">{result.to}</span><br/></> : null}
                {result.from ? <>От: <span className="font-mono">{result.from}</span><br/></> : null}
                {result.apiKeySource ? <>API key: {sourceLabel}</> : null}
              </p>
            ) : null}
          </div>
        </Alert>
      ) : null}
    </div>
  );
}
