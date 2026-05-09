"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  setPasswordForGuestUser,
  loginAndAttachOrder,
} from "@/app/actions/customer-onboarding";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

interface PostCheckoutAuthPanelProps {
  kind: "booking" | "cart" | "rental";
  orderId: string;
  /** One-shot claim secret captured from the order-creation result. */
  claimToken: string;
  /** Email submitted at checkout — captured before BookingProvider reset. */
  email: string;
  /** True only when an existing user with a real password matched this checkout. */
  isReturning: boolean;
}

const BENEFITS = [
  "Видеть статус заказа в кабинете",
  "Не вводить контакты заново при следующей записи",
  "История всех визитов и баллы лояльности",
];

export function PostCheckoutAuthPanel({
  kind,
  orderId,
  claimToken,
  email,
  isReturning,
}: PostCheckoutAuthPanelProps): React.ReactElement {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "login">(
    isReturning ? "login" : "create",
  );

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold mb-2">
          {isReturning
            ? "Войдите, чтобы заказ появился в личном кабинете"
            : "Создайте аккаунт — заказ будет в личном кабинете"}
        </h2>
        <ul className="text-sm text-[var(--foreground-muted)] space-y-1 list-disc pl-5">
          {BENEFITS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>

      {isReturning ? (
        <LoginTab
          orderId={orderId}
          orderKind={kind}
          claimToken={claimToken}
          email={email}
          router={router}
        />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "create" | "login")}>
          <TabsList ariaLabel="Создание аккаунта или вход">
            <TabsTrigger value="create">Создать пароль</TabsTrigger>
            <TabsTrigger value="login">У меня уже есть аккаунт</TabsTrigger>
          </TabsList>
          <TabsContent value="create">
            <CreateTab
              orderId={orderId}
              orderKind={kind}
              claimToken={claimToken}
              email={email}
              router={router}
            />
          </TabsContent>
          <TabsContent value="login">
            <LoginTab
              orderId={orderId}
              orderKind={kind}
              claimToken={claimToken}
              email={email}
              router={router}
            />
          </TabsContent>
        </Tabs>
      )}

      <p className="text-xs text-[var(--foreground-muted)]">
        <a href="/reset-password" className="underline hover:text-[var(--foreground)]">
          Не помню пароль — восстановить по SMS
        </a>
      </p>
    </div>
  );
}

interface TabProps {
  orderId: string;
  orderKind: "booking" | "cart" | "rental";
  claimToken: string;
  email: string;
  router: ReturnType<typeof useRouter>;
}

function CreateTab({ orderId, orderKind, claimToken, email, router }: TabProps): React.ReactElement {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await setPasswordForGuestUser({
        orderId,
        orderKind,
        claimToken,
        email,
        password,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      router.push(res.redirectTo);
    } catch (err) {
      console.error("setPasswordForGuestUser failed", err);
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось создать пароль. Попробуйте ещё раз.",
      );
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <p className="text-sm text-[var(--foreground-muted)]">Перенаправляем в кабинет…</p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-[var(--foreground-muted)]">
        Email: <span className="font-medium text-[var(--foreground)]">{email}</span>
      </p>
      <Input
        type="password"
        name="password"
        label="Новый пароль"
        helperText="Минимум 6 символов"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required
        minLength={6}
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Button type="submit" variant="primary" isLoading={pending} disabled={pending || password.length < 6}>
        {pending ? "Создаём…" : "Создать аккаунт"}
      </Button>
    </form>
  );
}

function LoginTab({ orderId, orderKind, claimToken, email, router }: TabProps): React.ReactElement {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await loginAndAttachOrder({
        orderId,
        orderKind,
        claimToken,
        email,
        password,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      router.push(res.redirectTo);
    } catch (err) {
      console.error("loginAndAttachOrder failed", err);
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось войти. Попробуйте ещё раз.",
      );
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <p className="text-sm text-[var(--foreground-muted)]">Перенаправляем в кабинет…</p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Input
        type="email"
        name="email"
        label="Email"
        helperText="Email из заказа"
        value={email}
        readOnly
        aria-readonly
      />
      <Input
        type="password"
        name="password"
        label="Пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Button type="submit" variant="primary" isLoading={pending} disabled={pending || !password}>
        {pending ? "Входим…" : "Войти"}
      </Button>
    </form>
  );
}
