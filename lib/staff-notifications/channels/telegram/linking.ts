import { createHash, randomBytes } from "node:crypto";

import {
  TELEGRAM_LINK_TOKEN_BYTES,
  TELEGRAM_LINK_TOKEN_TTL_MS,
} from "@/lib/staff-notifications/channels/telegram/constants";
import type { TelegramLinkPurpose } from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

interface TelegramLinkTx {
  telegramLinkToken: {
    updateMany(args: QueryArgs): Promise<{ count: number }>;
    create(args: QueryArgs): Promise<unknown>;
  };
}

export interface TelegramLinkDb {
  $transaction<T>(fn: (tx: TelegramLinkTx) => Promise<T>): Promise<T>;
}

export interface TelegramLinkRequest {
  purpose: TelegramLinkPurpose;
  userId: string | null;
  createdByUserId: string;
  botUsername: string;
  now?: Date;
}

export interface TelegramLinkResult {
  deepLink: string;
  expiresAt: Date;
}

/** Generate 256 bits, persist only SHA-256, and return the one-time deep link. */
export async function createTelegramLinkToken(
  client: TelegramLinkDb,
  input: TelegramLinkRequest,
): Promise<TelegramLinkResult> {
  assertLinkIdentity(input);
  const now = input.now ?? new Date();
  const rawToken = randomBytes(TELEGRAM_LINK_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashTelegramLinkToken(rawToken);
  const expiresAt = new Date(now.getTime() + TELEGRAM_LINK_TOKEN_TTL_MS);

  await client.$transaction(async (tx) => {
    // A newly requested link revokes older outstanding links for the same
    // target without retaining any raw token.
    await tx.telegramLinkToken.updateMany({
      where: {
        tenantKey: TENANT_KEY,
        purpose: input.purpose,
        userId: input.userId,
        usedAt: null,
      },
      data: { usedAt: now },
    });
    await tx.telegramLinkToken.create({
      data: {
        tenantKey: TENANT_KEY,
        userId: input.userId,
        purpose: input.purpose,
        tokenHash,
        expiresAt,
        createdByUserId: input.createdByUserId,
      },
    });
  });

  return {
    deepLink:
      input.purpose === "SHARED"
        ? `https://t.me/${input.botUsername}?startgroup=${rawToken}`
        : `https://t.me/${input.botUsername}?start=${rawToken}`,
    expiresAt,
  };
}

export function hashTelegramLinkToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function assertLinkIdentity(input: TelegramLinkRequest): void {
  if (input.purpose === "PERSONAL" && !input.userId) {
    throw new Error("Personal Telegram link requires a user");
  }
  if (
    input.purpose === "PERSONAL" &&
    input.userId !== input.createdByUserId
  ) {
    throw new Error("Personal Telegram link must be self-service");
  }
  if (input.purpose === "SHARED" && input.userId !== null) {
    throw new Error("Shared Telegram link cannot target a user");
  }
  if (!input.createdByUserId.trim() || !input.botUsername.trim()) {
    throw new Error("Invalid Telegram link request");
  }
}
