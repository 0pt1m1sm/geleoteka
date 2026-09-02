"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { isChecked } from "@/lib/forms";

/**
 * The team roster shown on «О нас» — site content, edited the same way as
 * vacancies.
 *
 * It is deliberately unrelated to `User`: who appears on the website is a
 * marketing decision, whereas `isMaster`/`MasterProfile` decide who can be
 * assigned to a repair order and who reaches the master portal. Keeping them
 * apart is what stops one person being edited in two places.
 */

interface TeamMemberFormData {
  name: string;
  role: string | null;
  bio: string | null;
  photoUrl: string | null;
  yearsExperience: number | null;
  certifications: string[];
  isActive: boolean;
  sortOrder: number;
}

function parseFormData(formData: FormData): TeamMemberFormData {
  const str = (key: string): string => ((formData.get(key) as string) || "").trim();

  const yearsRaw = str("yearsExperience");
  const years = yearsRaw === "" ? null : Number.parseInt(yearsRaw, 10);

  return {
    name: str("name"),
    role: str("role") || null,
    bio: str("bio") || null,
    photoUrl: str("photoUrl") || null,
    yearsExperience: Number.isInteger(years) ? years : null,
    // One per line, matching how vacancy requirements are entered.
    certifications: ((formData.get("certifications") as string) || "")
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean),
    isActive: isChecked(formData, "isActive"),
    sortOrder: Number.parseInt(str("sortOrder") || "0", 10) || 0,
  };
}

function validate(data: TeamMemberFormData): string | null {
  if (!data.name) return "Имя обязательно";
  if (data.yearsExperience !== null && (data.yearsExperience < 0 || data.yearsExperience > 80)) {
    return "Опыт должен быть числом от 0 до 80";
  }
  return null;
}

function revalidateTeam(): void {
  revalidatePath("/about");
  revalidatePath("/admin/team");
}

export async function createTeamMember(
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseFormData(formData);
  const error = validate(data);
  if (error) return { error };

  await db.teamMember.create({ data });

  revalidateTeam();
  redirect("/admin/team");
}

export async function updateTeamMember(
  id: string,
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseFormData(formData);
  const error = validate(data);
  if (error) return { error };

  await db.teamMember.update({ where: { id }, data });

  revalidateTeam();
  redirect("/admin/team");
}

export async function deleteTeamMember(id: string): Promise<void> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  await requireRole(["ADMIN", "MANAGER"]);
  await db.teamMember.delete({ where: { id } });
  revalidateTeam();
}
