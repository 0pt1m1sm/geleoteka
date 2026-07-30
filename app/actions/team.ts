"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Editing the service team — the master profiles shown on the public /about
 * page.
 *
 * A team member is not separate content: it is a `User` flagged `isMaster` plus
 * a 1:1 `MasterProfile`. So this edits real people, and deliberately does NOT
 * create or delete accounts — a person registers themselves and an admin grants
 * the role. Removing someone from the team clears the flag and hides the
 * profile; it never touches the account or their work history.
 */

export interface TeamResult {
  error: string | null;
  success?: boolean;
}

const BIO_MAX = 2000;
const SPECIALTY_MAX = 120;

function revalidateTeam(userId: string): void {
  revalidatePath("/admin/team");
  revalidatePath(`/admin/team/${userId}`);
  // The public roster reads the same rows.
  revalidatePath("/about");
}

export async function saveMasterProfile(
  _prevState: TeamResult | null,
  formData: FormData,
): Promise<TeamResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) return { error: "Не передан сотрудник" };

  const user = (await db.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true },
  })) as { id: string; deletedAt: Date | null } | null;
  if (!user) return { error: "Сотрудник не найден" };
  if (user.deletedAt) return { error: "Сотрудник архивирован" };

  const specialty = (formData.get("specialty") as string | null)?.trim() || null;
  const bio = (formData.get("bio") as string | null)?.trim() || null;
  if (specialty && specialty.length > SPECIALTY_MAX) {
    return { error: `Специализация — не длиннее ${SPECIALTY_MAX} символов` };
  }
  if (bio && bio.length > BIO_MAX) {
    return { error: `Описание — не длиннее ${BIO_MAX} символов` };
  }

  const yearsRaw = (formData.get("yearsExperience") as string | null)?.trim() ?? "";
  let yearsExperience: number | null = null;
  if (yearsRaw !== "") {
    const n = Number.parseInt(yearsRaw, 10);
    if (!Number.isInteger(n) || n < 0 || n > 80) {
      return { error: "Опыт должен быть числом от 0 до 80" };
    }
    yearsExperience = n;
  }

  const sortRaw = (formData.get("sortOrder") as string | null)?.trim() ?? "";
  let sortOrder = 0;
  if (sortRaw !== "") {
    const n = Number.parseInt(sortRaw, 10);
    if (!Number.isInteger(n)) return { error: "Порядок должен быть числом" };
    sortOrder = n;
  }

  // Comma-separated in the form; stored as a string[].
  const certifications = ((formData.get("certifications") as string | null) ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const isActive = formData.get("isActive") === "on" || formData.get("isActive") === "true";

  const data = { specialty, bio, yearsExperience, certifications, isActive, sortOrder };

  await db.$transaction(
    async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      // Editing someone's team profile is what makes them a team member; the
      // flag and the profile must not disagree or the public page and the admin
      // list would show different rosters.
      await tx.user.update({ where: { id: userId }, data: { isMaster: true } });
      await tx.masterProfile.upsert({
        where: { userId },
        update: data,
        create: { userId, ...data },
      });
    },
  );

  revalidateTeam(userId);
  return { error: null, success: true };
}

/**
 * Take someone off the team. Clears `isMaster` and deactivates the profile —
 * the account, its role and every repair order they worked on are untouched.
 */
export async function removeFromTeam(userId: string): Promise<TeamResult> {
  await requireRole(["ADMIN"]);

  await db.$transaction(
    async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      await tx.user.update({ where: { id: userId }, data: { isMaster: false } });
      await tx.masterProfile.updateMany({ where: { userId }, data: { isActive: false } });
    },
  );

  revalidateTeam(userId);
  return { error: null, success: true };
}

/** Add an existing user to the team (they must already have an account). */
export async function addToTeam(userId: string): Promise<TeamResult> {
  await requireRole(["ADMIN"]);

  const user = (await db.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true },
  })) as { id: string; deletedAt: Date | null } | null;
  if (!user) return { error: "Пользователь не найден" };
  if (user.deletedAt) return { error: "Пользователь архивирован" };

  await db.$transaction(
    async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      await tx.user.update({ where: { id: userId }, data: { isMaster: true } });
      await tx.masterProfile.upsert({
        where: { userId },
        update: { isActive: true },
        create: { userId, isActive: true, certifications: [], sortOrder: 0 },
      });
    },
  );

  revalidateTeam(userId);
  return { error: null, success: true };
}
