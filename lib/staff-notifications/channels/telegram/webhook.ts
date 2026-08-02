import { hashTelegramLinkToken } from "@/lib/staff-notifications/channels/telegram/linking";
import { roleLabel } from "@/lib/roles";
import type { TelegramLinkPurpose } from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

interface TelegramWebhookTx {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  telegramUpdateReceipt: {
    createMany(args: QueryArgs): Promise<{ count: number }>;
  };
  telegramLinkToken: {
    findUnique(args: QueryArgs): Promise<unknown>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
  telegramDestination: {
    findUnique(args: QueryArgs): Promise<unknown>;
    findFirst(args: QueryArgs): Promise<unknown>;
    create(args: QueryArgs): Promise<unknown>;
    update(args: QueryArgs): Promise<unknown>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
  user: {
    findUnique(args: QueryArgs): Promise<unknown>;
  };
  auditLog: {
    create(args: QueryArgs): Promise<unknown>;
  };
}

export interface TelegramWebhookDb {
  $transaction<T>(fn: (tx: TelegramWebhookTx) => Promise<T>): Promise<T>;
}

export type TelegramWebhookOutcome =
  | "linked"
  | "migrated"
  | "duplicate"
  | "ignored"
  | "invalid-update"
  | "invalid-token"
  | "expired-token"
  | "destination-conflict";

interface ParsedTelegramUpdate {
  updateId: string;
  chatType: string | null;
  chatId: string | null;
  telegramUserId: string | null;
  rawLinkToken: string | null;
  migrateToChatId: string | null;
}

interface LinkTokenRow {
  id: string;
  userId: string | null;
  purpose: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdByUserId: string;
}

interface DestinationRow {
  id: string;
  kind: string;
  userId: string | null;
  chatId: string;
}

interface AuditActorRow {
  id: string;
  name: string;
  permissionRole: string;
}

export async function processTelegramWebhookUpdate(
  client: TelegramWebhookDb,
  rawUpdate: unknown,
  now = new Date(),
): Promise<TelegramWebhookOutcome> {
  const update = parseTelegramUpdate(rawUpdate);
  if (!update) return "invalid-update";

  return client.$transaction(async (tx) => {
    const receipt = await tx.telegramUpdateReceipt.createMany({
      data: [{ tenantKey: TENANT_KEY, updateId: update.updateId, processedAt: now }],
      skipDuplicates: true,
    });
    if (receipt.count === 0) return "duplicate";

    if (update.chatId && update.migrateToChatId) {
      const migrated = await tx.telegramDestination.updateMany({
        where: {
          tenantKey: TENANT_KEY,
          kind: "SHARED",
          chatId: update.chatId,
        },
        data: { chatId: update.migrateToChatId },
      });
      return migrated.count > 0 ? "migrated" : "ignored";
    }

    if (
      !update.chatId ||
      !update.chatType ||
      !update.telegramUserId ||
      !update.rawLinkToken
    ) {
      return "ignored";
    }

    const token = (await tx.telegramLinkToken.findUnique({
      where: {
        tenantKey_tokenHash: {
          tenantKey: TENANT_KEY,
          tokenHash: hashTelegramLinkToken(update.rawLinkToken),
        },
      },
      select: {
        id: true,
        userId: true,
        purpose: true,
        expiresAt: true,
        usedAt: true,
        createdByUserId: true,
      },
    })) as LinkTokenRow | null;
    if (!token || !isLinkPurpose(token.purpose)) return "invalid-token";
    if (token.usedAt !== null || token.expiresAt.getTime() <= now.getTime()) {
      return "expired-token";
    }
    if (
      (token.purpose === "PERSONAL" && !token.userId) ||
      (token.purpose === "PERSONAL" && token.userId !== token.createdByUserId) ||
      (token.purpose === "SHARED" && token.userId !== null)
    ) {
      return "invalid-token";
    }
    if (!chatTypeAllowedForPurpose(update.chatType, token.purpose)) {
      return "ignored";
    }

    const lockKey = `${TENANT_KEY}\u0000telegram-link\u0000${token.purpose}\u0000${token.userId ?? "shared"}`;
    await tx.$queryRaw<Array<{ locked: unknown }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS "locked"
    `;

    const chatDestination = (await tx.telegramDestination.findUnique({
      where: {
        tenantKey_chatId: { tenantKey: TENANT_KEY, chatId: update.chatId },
      },
      select: { id: true, kind: true, userId: true, chatId: true },
    })) as DestinationRow | null;
    if (chatDestination && !sameLinkTarget(chatDestination, token)) {
      return "destination-conflict";
    }

    const existing = (await tx.telegramDestination.findFirst({
      where: {
        tenantKey: TENANT_KEY,
        kind: token.purpose,
        userId: token.userId,
      },
      orderBy: { verifiedAt: "asc" },
      select: { id: true, kind: true, userId: true, chatId: true },
    })) as DestinationRow | null;

    const actor = (await tx.user.findUnique({
      where: { id: token.createdByUserId },
      select: { id: true, name: true, permissionRole: true },
    })) as AuditActorRow | null;
    if (!actor) return "invalid-token";

    const consumed = await tx.telegramLinkToken.updateMany({
      where: {
        tenantKey: TENANT_KEY,
        id: token.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return "expired-token";

    const destination = existing
      ? ((await tx.telegramDestination.update({
          where: { tenantKey_id: { tenantKey: TENANT_KEY, id: existing.id } },
          data: {
            chatId: update.chatId,
            telegramUserId: update.telegramUserId,
            isActive: true,
            verifiedAt: now,
            disabledAt: null,
          },
          select: { id: true },
        })) as { id: string })
      : ((await tx.telegramDestination.create({
          data: {
            tenantKey: TENANT_KEY,
            kind: token.purpose,
            userId: token.userId,
            chatId: update.chatId,
            telegramUserId: update.telegramUserId,
            label: null,
            deliveryScope: "FALLBACK_ONLY",
            isActive: true,
            verifiedAt: now,
          },
          select: { id: true },
        })) as { id: string });

    await tx.auditLog.create({
      data: {
        tenantKey: TENANT_KEY,
        actorUserId: actor.id,
        actorName: actor.name,
        actorRole: roleLabel(actor.permissionRole),
        action: "telegram.destination_link",
        targetType: "TelegramDestination",
        targetId: destination.id,
        targetLabel: token.purpose === "PERSONAL" ? "Личная привязка" : "Общий получатель",
        metadata: { kind: token.purpose },
        ip: null,
      },
    });

    return "linked";
  });
}

function parseTelegramUpdate(value: unknown): ParsedTelegramUpdate | null {
  if (value === null || typeof value !== "object") return null;
  const update = value as Record<string, unknown>;
  const updateId = integerId(update.update_id);
  if (!updateId) return null;

  const message = objectValue(update.message);
  const chat = objectValue(message?.chat);
  const from = objectValue(message?.from);
  const text = typeof message?.text === "string" ? message.text : "";
  const match = text.match(/^\/start(?:@[A-Za-z0-9_]+)? ([A-Za-z0-9_-]{43})$/);

  return {
    updateId,
    chatType: typeof chat?.type === "string" ? chat.type : null,
    chatId: integerId(chat?.id),
    telegramUserId: from?.is_bot === true ? null : integerId(from?.id),
    rawLinkToken: match?.[1] ?? null,
    migrateToChatId: integerId(message?.migrate_to_chat_id),
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function integerId(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : null;
}

function isLinkPurpose(value: string): value is TelegramLinkPurpose {
  return value === "PERSONAL" || value === "SHARED";
}

function chatTypeAllowedForPurpose(
  chatType: string,
  purpose: TelegramLinkPurpose,
): boolean {
  if (purpose === "PERSONAL") return chatType === "private";
  return chatType === "private" || chatType === "group" || chatType === "supergroup";
}

function sameLinkTarget(destination: DestinationRow, token: LinkTokenRow): boolean {
  return destination.kind === token.purpose && destination.userId === token.userId;
}
