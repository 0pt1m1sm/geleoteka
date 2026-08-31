"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { clientIp } from "@/lib/audit";
import { oemKey } from "@/lib/part-reference";
import { partRequestThrottle } from "@/lib/rate-limit";
import { publishPartRequestCreated } from "@/lib/staff-notifications/business-events";
import type { StaffNotificationPublishTx } from "@/lib/staff-notifications/publish";

const CONTACT_MAX = 200;
const NOTE_MAX = 500;

/** Похоже ли на способ связаться: телефон (цифры) либо почта.
 *  БЕЗ export: в файле с «use server» каждый экспорт обязан быть асинхронным,
 *  и сборка падает на синхронном — типы и тесты этого не показывают. */
function looksLikeContact(raw: string): boolean {
  const v = raw.trim();
  if (v.length < 5) return false;
  if (v.includes("@")) return /\S+@\S+\.\S+/.test(v);
  return (v.match(/\d/g) ?? []).length >= 6;
}

/**
 * Приём заявки «сообщить о поступлении».
 *
 * Автоуведомлений покупателю НЕТ и не появится в этой истории — решение
 * владельца в PRD: заявка попадает в список, сотрудник связывается сам.
 * Персоналу уведомление уходит (Р5), иначе заявка лежала бы до тех пор, пока
 * кто-нибудь не откроет админку.
 */
export async function createPartRequest(
  _prevState: { error: string | null; success?: boolean } | null,
  formData: FormData,
): Promise<{ error: string | null; success?: boolean }> {
  // Honeypot. Поле спрятано от человека, поэтому заполнить его может только
  // автомат. Отвечаем как при успехе: сказать боту «ты распознан» — значит
  // подсказать, что именно поправить.
  const trap = ((formData.get("contact_confirm_url") as string | null) ?? "").trim();
  if (trap) return { error: null, success: true };

  const ip = (await clientIp()) ?? "unknown";
  if (partRequestThrottle.isBlocked(ip)) {
    return { error: "Слишком много заявок подряд. Попробуйте через несколько минут." };
  }
  // Засчитываем ЛЮБУЮ непустую попытку, а не только удачную: иначе перебор
  // заведомо невалидными данными не стоил бы автомату ничего.
  partRequestThrottle.register(ip);

  const contact = ((formData.get("contact") as string | null) ?? "").trim().slice(0, CONTACT_MAX);
  const note = ((formData.get("note") as string | null) ?? "").trim().slice(0, NOTE_MAX) || null;
  const oemRaw = ((formData.get("oem") as string | null) ?? "").trim();
  const oem = oemKey(oemRaw);

  if (!looksLikeContact(contact)) {
    return { error: "Оставьте телефон или почту — иначе мы не сможем ответить" };
  }
  if (!oem) return { error: "Не указан номер детали" };

  const reference = (await db.partReference.findUnique({
    where: { oem },
    select: { id: true, oem: true, name: true },
  })) as { id: string; oem: string; name: string } | null;
  if (!reference) return { error: "Такой детали нет в справочнике" };

  await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
    const created = (await tx.partRequest.create({
      data: {
        referenceId: reference.id,
        // Снимок: заявка обязана читаться, даже если номенклатуру удалят.
        oem: reference.oem,
        partName: reference.name,
        contact,
        note,
      },
      select: { id: true, createdAt: true },
    })) as { id: string; createdAt: Date };

    await publishPartRequestCreated(tx as unknown as StaffNotificationPublishTx, {
      requestId: created.id,
      oem: reference.oem,
      occurredAt: created.createdAt,
    });
  });

  return { error: null, success: true };
}

/**
 * Отметить заявку обработанной.
 *
 * `requireRole` обязателен: файл объявлен «use server», значит КАЖДЫЙ экспорт
 * здесь — сетевая точка входа, а не внутренняя функция страницы. Без проверки
 * отметить заявку мог кто угодно без сессии, зная id (найдено ревью PR #110).
 * Закрытая страница-список этого не спасает: страница и действие — разные
 * входы, и закрыт был только один.
 *
 * Автор берётся ИЗ СЕССИИ, а не из параметра. Параметром его передавал клиент,
 * то есть авторство подделывалось: в `handledById` можно было записать любого
 * сотрудника.
 */
export async function markPartRequestHandled(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  await db.partRequest.update({
    where: { id },
    data: { handledAt: new Date(), handledById: session.id },
  });
}
