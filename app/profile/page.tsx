export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { LOCALES, TIME_ZONES } from "@/lib/profile-options";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { roleLabel } from "@/lib/roles";

/**
 * Свой профиль — для любого, кто вошёл.
 *
 * Отдельный маршрут, а не страница внутри кабинета или админки: профиль есть у
 * всех, а кабинет открывают клиенты и только они. Дублировать одну и ту же
 * форму в двух разделах значило бы чинить её потом дважды.
 *
 * Роль показана, но не редактируется: то, что даёт доступ, меняет
 * администратор на своей странице. В одной форме с «поменять себе имя» это
 * было бы приглашением к повышению прав.
 */
export default async function ProfilePage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = (await db.user.findUnique({
    where: { id: session.id },
    select: {
      name: true,
      email: true,
      phone: true,
      timeZone: true,
      locale: true,
      permissionRole: true,
      createdAt: true,
    },
  })) as {
    name: string;
    email: string;
    phone: string;
    timeZone: string | null;
    locale: string | null;
    permissionRole: string;
    createdAt: Date;
  } | null;
  if (!user) redirect("/login");

  const isStaff = user.permissionRole !== "CLIENT" && user.permissionRole !== "NONE";

  return (
    <div className="mx-auto max-w-xl p-4 md:p-6">
      <PageHeader
        eyebrow="Профиль"
        title={user.name}
        description={`Роль: ${roleLabel(user.permissionRole)}`}
        actions={
          <Link href={isStaff ? "/admin" : "/cabinet"} className="back-link">
            ← {isStaff ? "В админку" : "В кабинет"}
          </Link>
        }
      />

      <ProfileForm
        initial={{
          name: user.name,
          email: user.email,
          phone: user.phone,
          timeZone: user.timeZone,
          locale: user.locale,
        }}
        timeZones={TIME_ZONES}
        locales={LOCALES}
      />

      <p className="mt-4 text-xs text-[var(--foreground-muted)]">
        Пароль и роль здесь не меняются: пароль сбрасывается через вход, роль выдаёт администратор.
      </p>
    </div>
  );
}
