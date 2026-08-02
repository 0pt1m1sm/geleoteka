import { after, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { constantTimeSecretEqual } from "@/lib/security/constant-time";
import {
  loadTelegramRuntimeConfig,
} from "@/lib/staff-notifications/channels/telegram/config";
import { TELEGRAM_WEBHOOK_SECRET_HEADER } from "@/lib/staff-notifications/channels/telegram/constants";
import {
  sendTelegramTextWithDiagnostics,
} from "@/lib/staff-notifications/channels/telegram/adapter";
import type { TelegramSendDiagnosticsWriteDb } from "@/lib/staff-notifications/channels/telegram/diagnostics";
import {
  deliverTelegramWebhookReply,
  processTelegramWebhookUpdate,
  type TelegramWebhookDb,
} from "@/lib/staff-notifications/channels/telegram/webhook";

export const dynamic = "force-dynamic";
const MAX_UPDATE_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const config = await loadTelegramRuntimeConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const presented = request.headers.get(TELEGRAM_WEBHOOK_SECRET_HEADER) ?? "";
  if (!presented || !constantTimeSecretEqual(presented, config.webhookSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_UPDATE_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid update" }, { status: 400 });
  }

  try {
    const outcome = await processTelegramWebhookUpdate(
      db as unknown as TelegramWebhookDb,
      update,
      new Date(),
      (reply) => {
        after(() =>
          deliverTelegramWebhookReply(
            db as unknown as TelegramWebhookDb,
            reply,
            async ({ chatId, text }) => {
              const normalized = await sendTelegramTextWithDiagnostics({
                client: db as unknown as TelegramSendDiagnosticsWriteDb,
                fetchImpl: globalThis.fetch,
                message: {
                  botToken: config.botToken,
                  chatId,
                  text,
                },
                operation: "WEBHOOK_REPLY",
              });
              if (normalized.outcome === "failed") {
                return {
                  errorCode: normalized.errorCode,
                  httpStatus: normalized.httpStatus,
                };
              }
            },
          ),
        );
      },
    );
    if (outcome === "invalid-update") {
      return NextResponse.json({ error: "invalid update" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, outcome });
  } catch {
    return NextResponse.json({ error: "webhook failed" }, { status: 500 });
  }
}
