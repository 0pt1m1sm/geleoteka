import { createHash } from "node:crypto";

import { hashTelegramLinkToken } from "@/lib/staff-notifications/channels/telegram/linking";
import { parseTelegramStartCommand } from "@/lib/staff-notifications/channels/telegram/link-command";
import type { TelegramTextSendErrorCode } from "@/lib/staff-notifications/channels/telegram/adapter";
import { roleLabel } from "@/lib/roles";
import type { TelegramLinkPurpose } from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

interface TelegramWebhookTx {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
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
  auditLog: {
    create(args: QueryArgs): Promise<unknown>;
  };
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

export interface TelegramWebhookReply {
  chatId: string;
  text: string;
}

export interface TelegramWebhookReplyFailure {
  errorCode: TelegramTextSendErrorCode;
  httpStatus: number | null;
}

export type TelegramWebhookReplySender = (
  reply: TelegramWebhookReply,
) => Promise<TelegramWebhookReplyFailure | void>;

export type TelegramWebhookReplyScheduler = (
  reply: TelegramWebhookReply,
) => void | Promise<void>;

interface TelegramWebhookTransactionResult {
  outcome: TelegramWebhookOutcome;
  replyText: string | null;
}

const LINKED_PERSONAL_REPLY =
  "Привязка выполнена. Сюда будут приходить уведомления.";
const LINKED_SHARED_REPLY =
  "Привязка выполнена. Этот чат настроен как общий получатель уведомлений.";
const INVALID_LINK_REPLY =
  "Ссылка недействительна. Получите новую ссылку в личном кабинете.";
const DESTINATION_CONFLICT_REPLY =
  "Этот чат уже используется для другой привязки.";
const BARE_START_REPLY =
  "Для привязки вернитесь в личный кабинет: откройте ссылку заново или отправьте боту указанную там команду привязки.";

interface ParsedTelegramUpdate {
  updateId: string;
  chatType: string | null;
  chatId: string | null;
  telegramUserId: string | null;
  rawLinkToken: string | null;
  isStartCommand: boolean;
  isBareStart: boolean;
  isAddressedStart: boolean;
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
  scheduleReply?: TelegramWebhookReplyScheduler,
): Promise<TelegramWebhookOutcome> {
  const update = parseTelegramUpdate(rawUpdate);
  if (!update) return "invalid-update";

  const result = await client.$transaction(async (tx) => {
    const receipt = await tx.telegramUpdateReceipt.createMany({
      data: [{ tenantKey: TENANT_KEY, updateId: update.updateId, processedAt: now }],
      skipDuplicates: true,
    });
    if (receipt.count === 0) return transactionResult("duplicate");

    if (update.chatId && update.migrateToChatId) {
      const migrated = await tx.telegramDestination.updateMany({
        where: {
          tenantKey: TENANT_KEY,
          kind: "SHARED",
          chatId: update.chatId,
        },
        data: { chatId: update.migrateToChatId },
      });
      return transactionResult(migrated.count > 0 ? "migrated" : "ignored");
    }

    if (update.chatId && update.isBareStart) {
      if (
        (update.chatType === "private" && update.telegramUserId) ||
        (isGroupChatType(update.chatType) && update.isAddressedStart)
      ) {
        return transactionResult("ignored", BARE_START_REPLY);
      }
      return transactionResult("ignored");
    }

    if (
      update.chatId &&
      update.isStartCommand &&
      !update.rawLinkToken
    ) {
      if (
        (update.chatType === "private" && update.telegramUserId) ||
        (isGroupChatType(update.chatType) && update.isAddressedStart)
      ) {
        return transactionResult("invalid-token", INVALID_LINK_REPLY);
      }
      return transactionResult("ignored");
    }

    if (!update.chatId || !update.chatType || !update.rawLinkToken) {
      return transactionResult("ignored");
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
    if (!token || !isLinkPurpose(token.purpose)) {
      return transactionResult("invalid-token", INVALID_LINK_REPLY);
    }
    if (token.usedAt !== null || token.expiresAt.getTime() <= now.getTime()) {
      return transactionResult("expired-token", INVALID_LINK_REPLY);
    }
    if (
      (token.purpose === "PERSONAL" && !token.userId) ||
      (token.purpose === "PERSONAL" && token.userId !== token.createdByUserId) ||
      (token.purpose === "SHARED" && token.userId !== null)
    ) {
      return transactionResult("invalid-token", INVALID_LINK_REPLY);
    }
    if (token.purpose === "PERSONAL" && !update.telegramUserId) {
      return transactionResult("ignored");
    }
    if (!chatTypeAllowedForPurpose(update.chatType, token.purpose)) {
      return transactionResult("ignored", INVALID_LINK_REPLY);
    }

    const destinationTelegramUserId =
      token.purpose === "PERSONAL" ? update.telegramUserId : null;

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${telegramLinkLockId(token)})`;

    const chatDestination = (await tx.telegramDestination.findUnique({
      where: {
        tenantKey_chatId: { tenantKey: TENANT_KEY, chatId: update.chatId },
      },
      select: { id: true, kind: true, userId: true, chatId: true },
    })) as DestinationRow | null;
    if (chatDestination && !sameLinkTarget(chatDestination, token)) {
      return transactionResult(
        "destination-conflict",
        DESTINATION_CONFLICT_REPLY,
      );
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
    if (!actor) return transactionResult("invalid-token", INVALID_LINK_REPLY);

    const consumed = await tx.telegramLinkToken.updateMany({
      where: {
        tenantKey: TENANT_KEY,
        id: token.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) {
      return transactionResult("expired-token", INVALID_LINK_REPLY);
    }

    // updateMany по (tenantKey, id), НЕ update(tenantKey_id): у модели нет
    // такой compound-уникальности, невалидный селектор валит перепривязку
    // PrismaClientValidationError (тот же класс, что ронял доставку
    // уведомлений в адаптере).
    const destination = existing
      ? await (async () => {
          await tx.telegramDestination.updateMany({
            where: { tenantKey: TENANT_KEY, id: existing.id },
            data: {
              chatId: update.chatId,
              telegramUserId: destinationTelegramUserId,
              isActive: true,
              verifiedAt: now,
              disabledAt: null,
            },
          });
          return { id: existing.id };
        })()
      : ((await tx.telegramDestination.create({
          data: {
            tenantKey: TENANT_KEY,
            kind: token.purpose,
            userId: token.userId,
            chatId: update.chatId,
            telegramUserId: destinationTelegramUserId,
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

    return transactionResult(
      "linked",
      token.purpose === "PERSONAL" ? LINKED_PERSONAL_REPLY : LINKED_SHARED_REPLY,
    );
  });

  // Prisma resolves the interactive transaction only after commit. The
  // webhook route passes a sync scheduler (after() takes the reply out of the
  // response path); the polling runtime passes an async deliverer, and it is
  // awaited here — polling has no after(), so the drain must not outrun the
  // reply and its diagnostics.
  if (result.replyText && update.chatId && scheduleReply) {
    await scheduleReply({ chatId: update.chatId, text: result.replyText });
  }

  return result.outcome;
}

export async function deliverTelegramWebhookReply(
  client: TelegramWebhookDb,
  reply: TelegramWebhookReply,
  sendReply: TelegramWebhookReplySender,
): Promise<void> {
  let failure: TelegramWebhookReplyFailure | null = null;
  try {
    failure = (await sendReply(reply)) ?? null;
  } catch {
    failure = { errorCode: "TELEGRAM_NETWORK", httpStatus: null };
  }
  if (failure) {
    await recordTelegramReplyFailure(client, failure);
  }
}

/**
 * 64-битный ключ advisory-замка считается В ПРИЛОЖЕНИИ. Прежний вариант —
 * строковый параметр с NUL-разделителями внутрь hashtextextended — Postgres
 * отбивал ошибкой 22021 «invalid byte sequence for encoding UTF8: 0x00», и
 * КАЖДАЯ валидная привязка детерминированно падала (ядовитый апдейт).
 * Bigint-параметр таких граней не имеет; воспроизведено и проверено на
 * настоящем Prisma+Postgres 2026-08-02.
 */
function telegramLinkLockId(
  token: Pick<LinkTokenRow, "purpose" | "userId">,
): bigint {
  const digest = createHash("sha256")
    .update(
      [TENANT_KEY, "telegram-link", token.purpose, token.userId ?? "shared"].join(
        "",
      ),
    )
    .digest();
  return digest.readBigInt64BE(0);
}

function transactionResult(
  outcome: TelegramWebhookOutcome,
  replyText: string | null = null,
): TelegramWebhookTransactionResult {
  return { outcome, replyText };
}

function parseTelegramUpdate(value: unknown): ParsedTelegramUpdate | null {
  if (value === null || typeof value !== "object") return null;
  const update = value as Record<string, unknown>;
  const updateId = integerId(update.update_id);
  if (!updateId) return null;

  const message = objectValue(update.message);
  const chat = objectValue(message?.chat);
  const from = objectValue(message?.from);
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const startCommand = parseTelegramStartCommand(text);

  return {
    updateId,
    chatType: typeof chat?.type === "string" ? chat.type : null,
    chatId: integerId(chat?.id),
    telegramUserId: from?.is_bot === true ? null : integerId(from?.id),
    rawLinkToken: startCommand?.rawLinkToken ?? null,
    isStartCommand: startCommand !== null,
    isBareStart: startCommand?.isBare ?? false,
    isAddressedStart: startCommand?.isAddressed ?? false,
    migrateToChatId: integerId(message?.migrate_to_chat_id),
  };
}

async function recordTelegramReplyFailure(
  client: TelegramWebhookDb,
  failure: TelegramWebhookReplyFailure,
): Promise<void> {
  const metadata = {
    errorCode: failure.errorCode,
    httpStatus: failure.httpStatus,
  };
  try {
    await client.auditLog.create({
      data: {
        tenantKey: TENANT_KEY,
        actorUserId: null,
        actorName: "Система",
        actorRole: "Система",
        action: "telegram.webhook_reply_failed",
        targetType: "TelegramWebhookReply",
        targetId: null,
        targetLabel: null,
        metadata,
        ip: null,
      },
    });
  } catch {
    // The durable business outcome and webhook 200 stay independent from the
    // diagnostic write. This fallback also contains only the safe fields.
    console.error("telegram.webhook_reply_failed", metadata);
  }
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

function isGroupChatType(chatType: string | null): boolean {
  return chatType === "group" || chatType === "supergroup";
}

function sameLinkTarget(destination: DestinationRow, token: LinkTokenRow): boolean {
  return destination.kind === token.purpose && destination.userId === token.userId;
}
