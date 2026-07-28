"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import { Alert, Button } from "@/components/ui";
import { CustomerSearchCombobox } from "./CustomerSearchCombobox";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";
import {
  linkInboxMessageToCustomer,
  markInboxMessageSpam,
  archiveInboxMessage,
} from "@/app/actions/crm/inbox";

interface Props {
  inboxMessageId: string;
  fromEmail: string;
  fromName: string | null;
  /** First recipient — the correspondent for an OUTBOUND message (we are the sender). */
  toEmail?: string;
  direction?: string;
}

type Panel = null | "link";

export function InboxActions({
  inboxMessageId,
  fromEmail,
  fromName,
  toEmail,
  direction,
}: Props): React.ReactElement {
  const isOutbound = direction === "OUTBOUND";
  const nav = useProgressRouter();
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
        toast.error(result.error);
        return;
      }
      toast.success("Письмо привязано к клиенту");
      nav.push(`/admin/customers/${customer.id}`);
    });
  }

  async function onSpam(): Promise<void> {
    if (!(await confirm({ message: "Пометить как спам?" }))) return;
    startTransition(async () => {
      const result = await markInboxMessageSpam(inboxMessageId);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Помечено как спам");
      nav.push("/admin/crm/inbox?status=SPAM");
    });
  }

  function onArchive(): void {
    startTransition(async () => {
      const result = await archiveInboxMessage(inboxMessageId);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Письмо в архиве");
      nav.push("/admin/crm/inbox?status=ARCHIVED");
    });
  }

  // For an OUTBOUND message we are the sender, so the customer to create is the
  // recipient, not the From address. Fall back to From only when no recipient is
  // known. The customer name prefill only makes sense for an inbound sender.
  const prefillEmail = isOutbound && toEmail ? toEmail : fromEmail;
  const prefillName = !isOutbound && fromName ? fromName : null;
  const createCustomerHref = `/admin/customers/new?email=${encodeURIComponent(prefillEmail)}${
    prefillName ? `&name=${encodeURIComponent(prefillName)}` : ""
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
