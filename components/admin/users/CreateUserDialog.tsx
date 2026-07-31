"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  Select,
} from "@/components/ui";
import { createUser } from "@/app/actions/user-management";
import { ALLOWED_ROLES, ROLE_LABELS } from "@/lib/roles";

/**
 * Заведение аккаунта из админки.
 *
 * Пароль не вводится, а выдаётся: администратор, придумывающий пароли, начинает
 * их переиспользовать, а знать пароль, который тут же отдают человеку, никому не
 * нужно. Показывается один раз и уходит смской — как при сбросе.
 *
 * Диалог не закрывается сам после успеха: пароль виден только здесь, и закрыть
 * его за оператора значит потерять единственный экземпляр.
 */
export function CreateUserDialog(): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createUser, null);
  const [role, setRole] = useState("CLIENT");

  const created = state?.ok === true ? state : null;

  useEffect(() => {
    if (created) router.refresh();
  }, [created, router]);

  function close(): void {
    setOpen(false);
    setRole("CLIENT");
  }

  return (
    <>
      <Button type="button" size="sm" leftIcon={<Plus size={16} />} onClick={() => setOpen(true)}>
        Новый пользователь
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
          else setOpen(true);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый пользователь</DialogTitle>
            <DialogDescription>
              Пароль сгенерируется автоматически, будет показан один раз и отправлен смской.
            </DialogDescription>
          </DialogHeader>

          {created ? (
            <>
              <DialogBody className="space-y-3">
                <Alert variant="success">Аккаунт создан.</Alert>
                <div>
                  <p className="text-xs text-[var(--foreground-muted)] mb-1">
                    Пароль — запишите сейчас, второй раз он не покажется:
                  </p>
                  <code className="select-all block text-lg font-mono px-3 py-2 rounded-[var(--radius-md)] bg-[var(--background-secondary)]">
                    {created.tempPassword}
                  </code>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={close}>
                  Готово
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form action={formAction}>
              <DialogBody className="space-y-3">
                <Input name="name" label="Имя" required maxLength={120} autoComplete="off" />
                <Input name="email" label="Email" type="email" required autoComplete="off" />
                <Input
                  name="phone"
                  label="Телефон"
                  required
                  placeholder="+7 900 000-00-00"
                  autoComplete="off"
                />
                <Select
                  name="permissionRole"
                  label="Роль"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  helperText={
                    role === "NONE"
                      ? "Вход закрыт — пароль не выдаётся и смс не уходит."
                      : "Что откроет роль, настраивается в разделе «Роли»."
                  }
                >
                  {ALLOWED_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>

                <div className="space-y-1.5 pt-1">
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Кем человек является для сервиса — это не про доступ:
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="isCustomer"
                      defaultChecked
                      className="w-4 h-4 accent-[var(--color-accent)]"
                    />
                    Клиент — появится в CRM
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="isMaster"
                      className="w-4 h-4 accent-[var(--color-accent)]"
                    />
                    Мастер — можно назначать на заказ-наряды
                  </label>
                </div>

                {state && state.ok === false ? (
                  <Alert variant="error">{state.error}</Alert>
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={close} disabled={isPending}>
                  Отмена
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Создаём…" : "Создать"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
