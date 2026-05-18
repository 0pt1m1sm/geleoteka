"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";
import {
  isValidColorSlug,
  normalizeTagName,
  type ColorSlug,
} from "@/lib/customer-tags";

const NOTE_MAX = 4000;
const NAME_MAX = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("Unique constraint")) return true;
  // Prisma's known request error encodes the code in the message in some
  // serialization paths; cover both.
  if ("code" in err && (err as { code?: string }).code === "P2002") return true;
  return false;
}

function generateTempPassword(): string {
  const out: string[] = [];
  for (let i = 0; i < 10; i++) {
    out.push(PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)]);
  }
  return out.join("");
}

interface CreateCustomerOk {
  ok: true;
  tempPassword: string;
  customerId: string;
}
interface ActionFail {
  ok: false;
  error: string;
}

/**
 * Manual customer creation from /admin/customers/new. Hashes a generated
 * 10-character temp password (returned to the manager exactly once).
 * Always creates `CustomerProfile` and `LoyaltyAccount` alongside the User.
 */
export async function createCustomer(
  _prev: CreateCustomerOk | ActionFail | null,
  formData: FormData,
): Promise<CreateCustomerOk | ActionFail> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const phoneRaw = (formData.get("phone") as string | null)?.trim() ?? "";
  const emailRaw = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const note = (formData.get("note") as string | null)?.trim() ?? "";

  if (!name || name.length > NAME_MAX) {
    return { ok: false, error: "Имя обязательно (до 120 символов)" };
  }
  if (!phoneRaw) {
    return { ok: false, error: "Телефон обязателен" };
  }
  if (!emailRaw || !EMAIL_RE.test(emailRaw)) {
    return { ok: false, error: "Некорректный email" };
  }
  if (note.length > NOTE_MAX) {
    return { ok: false, error: `Заметка не может быть длиннее ${NOTE_MAX} символов` };
  }

  const phone = normalizePhone(phoneRaw);
  if (!isValidRussianPhone(phone)) {
    return { ok: false, error: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX" };
  }

  const existing = await db.user.findFirst({
    where: { OR: [{ email: emailRaw }, { phone }] },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "Пользователь с таким email или телефоном уже существует" };
  }

  // Optional marketing source ("откуда узнал"). Unknown / missing → null.
  const referralRaw = (formData.get("referralSource") as string | null)?.trim() ?? "";
  const REFERRAL_VALUES = new Set([
    "YANDEX", "GOOGLE", "AVITO", "INSTAGRAM", "TELEGRAM_CHAN",
    "FRIEND", "REPEAT", "WALK_IN", "OTHER",
  ]);
  const referralSource = REFERRAL_VALUES.has(referralRaw) ? (referralRaw as never) : null;

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  let created: { id: string };
  try {
    created = (await db.user.create({
      data: {
        name,
        email: emailRaw,
        phone,
        passwordHash,
        isTempPassword: true,
        permissionRole: "CLIENT",
        isCustomer: true,
        referralSource,
        customerProfile: { create: {} },
        loyaltyAccount: { create: {} },
      },
      select: { id: true },
    })) as { id: string };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "Пользователь с таким email или телефоном уже существует" };
    }
    throw err;
  }

  if (note.length > 0) {
    await db.customerNote.create({
      data: {
        customerUserId: created.id,
        authorUserId: session.id,
        body: note,
      },
    });
  }

  revalidatePath("/admin/customers", "layout");

  return { ok: true, tempPassword, customerId: created.id };
}

interface UpdateOk {
  ok: true;
  error: null;
}
interface UpdateFail {
  ok: false;
  error: string;
}

/** Inline edit of contacts + CustomerProfile (notes, blacklisted) in one nested write. */
export async function updateCustomer(
  customerUserId: string,
  _prev: UpdateOk | UpdateFail | null,
  formData: FormData,
): Promise<UpdateOk | UpdateFail> {
  await requireRole(["ADMIN", "MANAGER"]);

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const phoneRaw = (formData.get("phone") as string | null)?.trim() ?? "";
  const emailRaw = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const profileNotes = (formData.get("notes") as string | null) ?? "";
  const blacklisted = formData.get("blacklisted") === "on";

  if (!name || name.length > NAME_MAX) {
    return { ok: false, error: "Имя обязательно (до 120 символов)" };
  }
  if (!phoneRaw) {
    return { ok: false, error: "Телефон обязателен" };
  }
  if (!emailRaw || !EMAIL_RE.test(emailRaw)) {
    return { ok: false, error: "Некорректный email" };
  }

  const phone = normalizePhone(phoneRaw);
  if (!isValidRussianPhone(phone)) {
    return { ok: false, error: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX" };
  }
  const profileNotesValue = profileNotes.trim() === "" ? null : profileNotes;

  try {
    await db.user.update({
      where: { id: customerUserId },
      data: {
        name,
        email: emailRaw,
        phone,
        customerProfile: {
          upsert: {
            create: { blacklisted, notes: profileNotesValue },
            update: { blacklisted, notes: profileNotesValue },
          },
        },
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "Пользователь с таким email или телефоном уже существует" };
    }
    throw err;
  }

  revalidatePath("/admin/customers", "layout");
  return { ok: true, error: null };
}

interface NoteOk {
  ok: true;
  error: null;
}
interface NoteFail {
  ok: false;
  error: string;
}

/** Add a manager-authored timeline note to a customer. */
export async function addCustomerNote(
  customerUserId: string,
  _prev: NoteOk | NoteFail | null,
  formData: FormData,
): Promise<NoteOk | NoteFail> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const body = (formData.get("body") as string | null)?.trim() ?? "";
  if (body.length === 0) {
    return { ok: false, error: "Заметка не может быть пустой" };
  }
  if (body.length > NOTE_MAX) {
    return { ok: false, error: `Заметка не может быть длиннее ${NOTE_MAX} символов` };
  }

  await db.customerNote.create({
    data: {
      customerUserId,
      authorUserId: session.id,
      body,
    },
  });

  revalidatePath(`/admin/customers/${customerUserId}`);
  return { ok: true, error: null };
}

/**
 * Delete a customer note. Author can delete their own; ADMIN can delete any.
 * MANAGER trying to delete a peer's note gets a 403-style error message.
 */
export async function deleteCustomerNote(
  noteId: string,
): Promise<NoteOk | NoteFail> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const note = (await db.customerNote.findUnique({
    where: { id: noteId },
    select: { authorUserId: true, customerUserId: true },
  })) as { authorUserId: string | null; customerUserId: string } | null;

  if (!note) {
    return { ok: false, error: "Заметка не найдена" };
  }

  if (note.authorUserId !== session.id && session.permissionRole !== "ADMIN") {
    return { ok: false, error: "Нет прав на удаление чужой заметки" };
  }

  await db.customerNote.delete({ where: { id: noteId } });
  revalidatePath(`/admin/customers/${note.customerUserId}`);
  return { ok: true, error: null };
}

interface TagCreateOk {
  ok: true;
  error: null;
  tagId: string;
}
interface TagCreateFail {
  ok: false;
  error: string;
  tagId?: undefined;
}

/** Create a new CRM tag. Manager+. Catches name uniqueness races. */
export async function createCustomerTag(
  _prev: TagCreateOk | TagCreateFail | null,
  formData: FormData,
): Promise<TagCreateOk | TagCreateFail> {
  await requireRole(["ADMIN", "MANAGER"]);

  const rawName = (formData.get("name") as string | null) ?? "";
  const rawColor = (formData.get("colorSlug") as string | null)?.trim() ?? "";

  let name: string;
  try {
    name = normalizeTagName(rawName);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Имя тэга обязательно" };
  }

  if (!isValidColorSlug(rawColor)) {
    return { ok: false, error: "Неизвестный цвет" };
  }
  const colorSlug: ColorSlug = rawColor;

  try {
    const created = (await db.customerTag.create({
      data: { name, colorSlug },
      select: { id: true },
    })) as { id: string };
    revalidatePath("/admin/customers", "layout");
    return { ok: true, error: null, tagId: created.id };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "Тэг с таким именем уже существует" };
    }
    throw err;
  }
}

/** Idempotent: assign a tag to a customer. Re-calls are no-ops. */
export async function assignCustomerTag(
  customerUserId: string,
  tagId: string,
): Promise<NoteOk | NoteFail> {
  await requireRole(["ADMIN", "MANAGER"]);

  await db.customerTagAssignment.upsert({
    where: { customerUserId_tagId: { customerUserId, tagId } },
    create: { customerUserId, tagId },
    update: {},
  });

  revalidatePath("/admin/customers", "layout");
  return { ok: true, error: null };
}

/** Idempotent: remove an assignment if present, ok if not. */
export async function unassignCustomerTag(
  customerUserId: string,
  tagId: string,
): Promise<NoteOk | NoteFail> {
  await requireRole(["ADMIN", "MANAGER"]);

  await db.customerTagAssignment.deleteMany({
    where: { customerUserId, tagId },
  });

  revalidatePath("/admin/customers", "layout");
  return { ok: true, error: null };
}

/** Delete a tag globally (ADMIN only). FK cascade removes assignments. */
export async function deleteCustomerTag(
  tagId: string,
): Promise<NoteOk | NoteFail> {
  await requireRole(["ADMIN"]);

  await db.customerTag.delete({ where: { id: tagId } });
  revalidatePath("/admin/customers", "layout");
  return { ok: true, error: null };
}
