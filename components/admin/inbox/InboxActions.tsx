"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { CustomerSearchCombobox } from "./CustomerSearchCombobox";
import { confirm } from "@/lib/ui/confirm";
import {
  linkInboxMessageToCustomer,
  markInboxMessageSpam,
  archiveInboxMessage,
} from "@/app/actions/crm/inbox";

interface Props {
  inboxMessageId: string;
  fromEmail: string;
  fromName: string | null;
}

type Panel = null | "link";

export function InboxActions({
  inboxMessageId,
  fromEmail,
  fromName,
}: Props): React.ReactElement {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close(): void {
    setPanel(null);
    setError(null);
  }

  function onLink(customer: { id: string; name: string }): void {
    setError(null);
    startTransition(async () => {
      const result = await linkInboxMessageToCustomer(inboxMessageId, customer.id, null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/admin/customers/${customer.id}`);
    });
  }

  async function onSpam(): Promise<void> {
    if (!(await confirm({ message: "Пометить как спам?" }))) return;
    startTransition(async () => {
      const result = await markInboxMessageSpam(inboxMessageId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/admin/crm/inbox?status=SPAM");
    });
  }

  function onArchive(): void {
    startTransition(async () => {
      const result = await archiveInboxMessage(inboxMessageId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/admin/crm/inbox?status=ARCHIVED");
    });
  }

  const createCustomerHref = `/admin/customers/new?email=${encodeURIComponent(fromEmail)}${
    fromName ? `&name=${encodeURIComponent(fromName)}` : ""
  }&source=EMAIL`;

  return (
    <div className="space-y-3">
      {error ? <Alert variant="error">{error}</Alert> : null}

      {panel === "link" ? (
        <div className="card space-y-3">
          <h4 className="font-semibold text-sm">Найти клиента</h4>
          <CustomerSearchCombobox onSelect={onLink} />
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={close} disabled={pending}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="w-full"
            onClick={() => setPanel("link")}
            disabled={pending}
          >
            Привязать к клиенту
          </Button>
          <Link
            href={createCustomerHref}
            className="btn btn-secondary btn-sm w-full text-center"
            aria-disabled={pending}
          >
            Создать клиента
          </Link>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={onSpam}
            disabled={pending}
          >
            Это спам
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={onArchive}
            disabled={pending}
          >
            Архив
          </Button>
        </>
      )}
    </div>
  );
}
