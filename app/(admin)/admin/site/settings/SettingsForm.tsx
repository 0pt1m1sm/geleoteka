"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@/components/ui";
import { updateCMSBlock } from "@/app/actions/cms";

interface Props {
  initialGatewayUrl: string;
}

/**
 * Edits site-level integration settings. Currently scoped to the payment
 * gateway URL template — the only setting that lives outside the generic
 * CMS grid. Persists via the existing `updateCMSBlock` action.
 */
export function SettingsForm({ initialGatewayUrl }: Props): React.ReactElement {
  const router = useRouter();
  const [gatewayUrl, setGatewayUrl] = useState(initialGatewayUrl);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateCMSBlock("payments.gateway_url_template", {
        value: gatewayUrl,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input
        label="URL платёжного шлюза"
        value={gatewayUrl}
        onChange={(e) => setGatewayUrl(e.target.value)}
        placeholder="https://yookassa.ru/checkout/payments/v2/contract?orderId={estimateId}"
        autoComplete="off"
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      {saved ? <Alert variant="success">Сохранено.</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" isLoading={pending} disabled={pending}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}
