import { hashTelegramLinkToken } from "@/lib/staff-notifications/channels/telegram/linking";
import { parseTelegramLinkCommand } from "@/lib/staff-notifications/channels/telegram/link-command";
import type { TelegramTextSendErrorCode } from "@/lib/staff-notifications/channels/telegram/adapter";
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
) => void;

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

    if (update.chatId && update.telegramUserId && update.isBareStart) {
      return transactionResult("ignored", BARE_START_REPLY);
    }

    if (
      update.chatId &&
      update.telegramUserId &&
      update.isStartCommand &&
      !update.rawLinkToken
    ) {
      return transactionResult("invalid-token", INVALID_LINK_REPLY);
    }

    if (
      !update.chatId ||
      !update.chatType ||
      !update.telegramUserId ||
      !update.rawLinkToken
    ) {
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
    if (!chatTypeAllowedForPurpose(update.chatType, token.purpose)) {
      return transactionResult("ignored", INVALID_LINK_REPLY);
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

    return transactionResult(
      "linked",
      token.purpose === "PERSONAL" ? LINKED_PERSONAL_REPLY : LINKED_SHARED_REPLY,
    );
  });

  // Prisma resolves the interactive transaction only after commit. The route
  // schedules this reply for post-response delivery; no provider I/O belongs
  // to the transaction or the webhook response path.
  if (result.replyText && update.chatId && scheduleReply) {
    scheduleReply({ chatId: update.chatId, text: result.replyText });
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
  const text = typeof message?.text === "string" ? message.text : "";
  const rawLinkToken = parseTelegramLinkCommand(text);
  const isStartCommand = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s.*)?$/s.test(text);
  const isBareStart = /^\/start(?:@[A-Za-z0-9_]+)?$/.test(text);

  return {
    updateId,
    chatType: typeof chat?.type === "string" ? chat.type : null,
    chatId: integerId(chat?.id),
    telegramUserId: from?.is_bot === true ? null : integerId(from?.id),
    rawLinkToken,
    isStartCommand,
    isBareStart,
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

function sameLinkTarget(destination: DestinationRow, token: LinkTokenRow): boolean {
  return destination.kind === token.purpose && destination.userId === token.userId;
}
