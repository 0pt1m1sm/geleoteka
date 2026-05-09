"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

interface VacancyFormData {
  title: string;
  type: string;
  description: string;
  requirements: string[];
  isActive: boolean;
  sortOrder: number;
}

function parseVacancyFormData(formData: FormData): VacancyFormData {
  const title = ((formData.get("title") as string) || "").trim();
  const type = ((formData.get("type") as string) || "Полная занятость").trim();
  const description = ((formData.get("description") as string) || "").trim();
  const requirementsRaw = (formData.get("requirements") as string) || "";
  const requirements = requirementsRaw
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  const isActive = formData.get("isActive") !== "off";
  const sortOrderRaw = (formData.get("sortOrder") as string) || "0";
  const sortOrder = parseInt(sortOrderRaw, 10) || 0;
  return { title, type, description, requirements, isActive, sortOrder };
}

function validate(data: VacancyFormData): string | null {
  if (!data.title) return "Название обязательно";
  if (!data.description) return "Описание обязательно";
  return null;
}

export async function createVacancy(
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseVacancyFormData(formData);
  const error = validate(data);
  if (error) return { error };

  await db.vacancy.create({ data });

  revalidatePath("/vacancies");
  revalidatePath("/admin/vacancies");
  redirect("/admin/vacancies");
}

export async function updateVacancy(
  vacancyId: string,
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseVacancyFormData(formData);
  const error = validate(data);
  if (error) return { error };

  await db.vacancy.update({ where: { id: vacancyId }, data });

  revalidatePath("/vacancies");
  revalidatePath("/admin/vacancies");
  redirect("/admin/vacancies");
}

export async function deleteVacancy(vacancyId: string): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  await db.vacancy.delete({ where: { id: vacancyId } });
  revalidatePath("/vacancies");
  revalidatePath("/admin/vacancies");
}
