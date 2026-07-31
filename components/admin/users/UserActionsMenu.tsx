"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { deleteCustomer, restoreCustomer } from "@/app/actions/crm/customers";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";
import {
  ActionsMenu,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  type ActionsMenuItem,
} from "@/components/ui";
import { EraseCustomerPanel } from "@/components/admin/customers/EraseCustomerPanel";

/**
 * The "⋯" beside a person's name.
 *
 * Deleting used to live in a red "danger zone" card at the bottom of the page,
 * which put the most destructive action on the screen permanently, below the
 * fold, in a block of its own invention. Collecting it into the standard
 * actions affordance means an operator looks in one place for what they can do
 * here — and the confirmation, with its export step and its typed phrase, is
 * unchanged behind it.
 */
export function UserActionsMenu({
  userId,
  userName,
  confirmPhrase,
  redirectTo,
  archiving,
}: {
  userId: string;
  userName: string;
  /** Email or phone — what the operator must retype to confirm. */
  confirmPhrase: string;
  redirectTo?: string;
  /**
   * Offer the reversible option too. Archiving only hides the card and is
   * where an operator should land far more often than on erasure, so it sits
   * above the separator — plain, not red.
   */
  archiving?: { archived: boolean };
}): React.ReactElement {
  const router = useRouter();
  const [eraseOpen, setEraseOpen] = useState(false);

  async function archive(): Promise<void> {
    const ok = await confirm({
      title: "Скрыть из CRM",
      message: `Скрыть «${userName}» из списков? История сделок и заказ-нарядов сохранится, действие обратимо.`,
      confirmText: "Скрыть",
    });
    if (!ok) return;
    const result = await deleteCustomer(userId);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Клиент скрыт из CRM");
    router.refresh();
  }

  async function restore(): Promise<void> {
    const result = await restoreCustomer(userId);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Клиент восстановлен");
    router.refresh();
  }

  const items: ActionsMenuItem[] = [
    ...(archiving
      ? [
          archiving.archived
            ? { label: "Восстановить в CRM", onSelect: restore }
            : { label: "Скрыть из CRM", onSelect: archive },
        ]
      : []),
    { label: "Удалить безвозвратно", danger: true, onSelect: () => setEraseOpen(true) },
  ];

  return (
    <>
      <ActionsMenu items={items} />

      <Dialog open={eraseOpen} onOpenChange={setEraseOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Удалить «{userName}»</DialogTitle>
            <DialogDescription>
              Персональные данные стираются безвозвратно. Что делать со связанными записями —
              выберите ниже.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {/* Remounted per open so a cancelled attempt never leaves a stale
                impact token behind — the token is only valid for the counts it
                was issued against. */}
            {eraseOpen ? (
              <EraseCustomerPanel
                key={userId}
                autoOpen
                customerUserId={userId}
                customerName={userName}
                confirmPhrase={confirmPhrase}
                redirectTo={redirectTo}
              />
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
