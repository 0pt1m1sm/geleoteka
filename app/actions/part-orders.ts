"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";
import {
  findOrCreateGuestCustomer,
  generateClaimToken,
} from "@/lib/customer-onboarding";
import { createDeal } from "@/lib/crm/public";

interface OrderInput {
  items: { partId: string; quantity: number }[];
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
}

interface OrderResult {
  success: boolean;
  orderId?: string;
  /** Set when success=true. Customer the order was attached to. */
  userId?: string;
  /** True only when matched an existing user with a real password. */
  isReturningCustomer?: boolean;
  /** One-shot claim secret. Returned only for guest creates (no session). null when user was already logged in. */
  claimToken?: string | null;
  error?: string;
  /** Discriminator for error UX. "phone_collision" → render inline login panel. */
  errorKind?: "phone_collision" | "other";
}

export async function createPartOrder(input: OrderInput): Promise<OrderResult> {
  const { items, contactName, contactPhone, contactEmail, notes } = input;

  if (!items.length || !contactName || !contactPhone || !contactEmail) {
    return { success: false, error: "Заполните все обязательные поля" };
  }

  const normalizedPhone = normalizePhone(contactPhone);
  if (!isValidRussianPhone(normalizedPhone)) {
    return { success: false, error: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX" };
  }

  try {
    const session = await getSession();
    const guestResult = await findOrCreateGuestCustomer({
      sessionUserId: session?.id ?? null,
      name: contactName,
      email: contactEmail,
      phone: normalizedPhone,
    });
    if (!guestResult.ok) {
      return { success: false, error: guestResult.error, errorKind: guestResult.kind };
    }
    const claimToken = !session ? generateClaimToken() : null;

    // Fetch parts to get prices and check stock
    const partIds = items.map((i) => i.partId);
    const parts = await db.part.findMany({ where: { id: { in: partIds } } });

    const partMap = new Map(parts.map((p: Record<string, unknown>) => [p.id as string, p]));

    let total = 0;
    const orderItems: Array<{ partId: string; quantity: number; unitPrice: number }> = [];

    for (const item of items) {
      const part = partMap.get(item.partId);
      if (!part) return { success: false, error: `Запчасть не найдена` };

      const price = part.price as number;
      const stock = part.quantity as number;

      if (stock < item.quantity) {
        return { success: false, error: `${part.name as string}: недостаточно на складе (${stock} шт.)` };
      }

      total += price * item.quantity;
      orderItems.push({ partId: item.partId, quantity: item.quantity, unitPrice: price });
    }

    // Originate the Deal first. Retail parts checkout is point-of-sale —
    // stage starts at APPROVED so the deal is on the books immediately.
    const deal = await createDeal({
      customerUserId: guestResult.userId,
      channel: "PARTS_RETAIL",
      source: "parts-cart",
      initialStage: "IN_PROGRESS",
      claimToken,
      notes: notes || null,
      lines: orderItems.map((item) => {
        const part = partMap.get(item.partId) as Record<string, unknown> | undefined;
        return {
          type: "PART" as const,
          description: (part?.name as string) ?? "Запчасть",
          qty: item.quantity,
          unitPrice: item.unitPrice,
          partId: item.partId,
        };
      }),
    });

    // Create order + decrement stock in transaction
    const order = await db.$transaction(async (tx) => {
      const created = await tx.partOrder.create({
        data: {
          userId: guestResult.userId,
          dealId: deal.id,
          total,
          contactName,
          contactPhone: normalizePhone(contactPhone),
          contactEmail: contactEmail.trim().toLowerCase(),
          claimToken,
          notes: notes || null,
          items: { create: orderItems },
        },
      });

      // Decrement stock
      for (const item of orderItems) {
        await tx.part.update({
          where: { id: item.partId },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      return created;
    });

    const orderId = (order as Record<string, unknown>).id as string;

    if (contactEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";
      // cabinetUrl is meaningful only for logged-in customers — guests have no
      // working deep-link to /cabinet without going through PostCheckoutAuthPanel
      // at submit time (see TD-003). Points at the orders list — there is no
      // /cabinet/orders/[id] detail page in this iteration.
      const cabinetUrl = session?.id ? `${appUrl}/cabinet/orders` : undefined;
      const emailItems = orderItems.map((row) => {
        const part = partMap.get(row.partId) as Record<string, unknown> | undefined;
        return {
          name: (part?.name as string) ?? "Запчасть",
          qty: row.quantity,
          unitPrice: row.unitPrice,
          total: row.unitPrice * row.quantity,
        };
      });
      const {
        sendPartOrderConfirmationEmail,
        generateOutboundMessageId,
        recordOutboundEmail,
        markOutboundEmailFailed,
        markOutboundEmailSent,
        isPlausibleEmail,
      } = await import("@/lib/email");
      const subject = "Geleoteka — заказ запчастей принят";
      const itemSummary = emailItems
        .slice(0, 10)
        .map((it) => `${it.name} × ${it.qty}`)
        .join("; ");
      const bodyText = `Здравствуйте, ${contactName}. Ваш заказ №${orderId.slice(-6).toUpperCase()} принят. Позиции: ${itemSummary}. Сумма: ${(total / 100).toLocaleString("ru-RU")} ₽.`;
      const messageId = generateOutboundMessageId();
      if (isPlausibleEmail(contactEmail)) {
        await recordOutboundEmail({
          customerUserId: guestResult.userId,
          dealId: deal.id,
          subject,
          body: bodyText,
          messageId,
        });
      }
      void sendPartOrderConfirmationEmail(
        contactEmail,
        {
          customerName: contactName,
          orderId,
          items: emailItems,
          total,
          contactPhone: normalizedPhone,
          cabinetUrl,
        },
        { messageId },
      )
        .then((result) => {
          if (!result.success) return markOutboundEmailFailed(messageId, result.error);
          return markOutboundEmailSent(messageId);
        })
        .catch((err) =>
          markOutboundEmailFailed(messageId, err instanceof Error ? err.message : String(err)),
        );
    }

    return {
      success: true,
      orderId,
      userId: guestResult.userId,
      isReturningCustomer: guestResult.isReturning && guestResult.hasRealPassword,
      claimToken,
    };
  } catch (err) {
    console.error("Part order error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}
